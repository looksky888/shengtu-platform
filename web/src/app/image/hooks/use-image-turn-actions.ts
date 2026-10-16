import { useCallback, useRef, type RefObject } from "react";
import { toast } from "sonner";

import {
  imageDataIndexForTask,
  imageTaskBatchId,
  taskDataToStoredImage,
} from "@/app/image/lib/image-task-utils";
import {
  deriveTurnStatus,
  formatCreationTaskError,
  isTurnInProgress,
  normalizeRequestedImageCount,
  usesReferenceImages,
} from "@/app/image/lib/image-turn-utils";
import { buildConversationTitle, createId } from "@/app/image/lib/reference-image-utils";
import { cancelCreationTask } from "@/lib/api";
import type { ImageConversation } from "@/store/image-conversations";
import { imageTurnProgressKey } from "@/store/image-turn-progress";

type UpdateConversation = (
  conversationId: string,
  updater: (current: ImageConversation | null) => ImageConversation,
  options?: { persist?: boolean },
) => Promise<void>;

type UseImageTurnActionsOptions = {
  conversationsRef: RefObject<ImageConversation[]>;
  cancelledTurnIdsRef: RefObject<Set<string>>;
  updateConversation: UpdateConversation;
  runConversationQueue: (conversationId: string) => void | Promise<void>;
  clearTurnProgress: (conversationId: string, turnId: string) => void;
};

export function useImageTurnActions({
  conversationsRef,
  cancelledTurnIdsRef,
  updateConversation,
  runConversationQueue,
  clearTurnProgress,
}: UseImageTurnActionsOptions) {
  const retryingImageIdsRef = useRef(new Set<string>());

  const handleCancelTurn = useCallback(
    async (conversationId: string, turnId: string) => {
      const targetConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const targetTurn = targetConversation?.turns.find((turn) => turn.id === turnId);
      if (!targetConversation || !targetTurn) {
        toast.error("未找到对应的对话轮次");
        return;
      }

      const taskIds = Array.from(
        new Set(targetTurn.images.flatMap((image) => (image.status === "loading" && image.taskId ? [image.taskId] : []))),
      );
      if (taskIds.length === 0) {
        if (targetTurn.mode === "chat") {
          const turnKey = imageTurnProgressKey(conversationId, turnId);
          cancelledTurnIdsRef.current.add(turnKey);
          clearTurnProgress(conversationId, turnId);
          await updateConversation(conversationId, (current) => {
            const conversation = current ?? targetConversation;
            return {
              ...conversation,
              updatedAt: new Date().toISOString(),
              turns: conversation.turns.map((turn) => {
                if (turn.id !== turnId) {
                  return turn;
                }
                const images = turn.images.map((image) =>
                  image.status === "loading" ? { ...image, status: "cancelled" as const, error: "请求已终止" } : image,
                );
                return {
                  ...turn,
                  ...deriveTurnStatus({ ...turn, images }),
                  images,
                };
              }),
            };
          });
          toast.success("已终止对话请求");
        }
        return;
      }

      const results = await Promise.allSettled(taskIds.map((taskId) => cancelCreationTask(taskId)));
      const taskMap = new Map(
        results.flatMap((result) => (result.status === "fulfilled" ? [[result.value.id, result.value] as const] : [])),
      );
      const failedRequests = results.filter((result) => result.status === "rejected").length;
      await updateConversation(conversationId, (current) => {
        const conversation = current ?? targetConversation;
        return {
          ...conversation,
          updatedAt: new Date().toISOString(),
          turns: conversation.turns.map((turn) => {
            if (turn.id !== turnId) {
              return turn;
            }
            const images = turn.images.map((image, imageIndex) => {
              if (image.status !== "loading") {
                return image;
              }
              const taskId = image.taskId || image.id;
              const task = taskMap.get(taskId);
              if (task) {
                return taskDataToStoredImage(
                  { ...image, taskId },
                  task,
                  turn.mode,
                  imageDataIndexForTask(turn.images, imageIndex),
                  turn.visibility,
                );
              }
              return {
                ...image,
                taskId,
                status: "cancelled" as const,
                error: failedRequests > 0 ? "终止请求失败，已在本地停止等待" : "任务已终止",
              };
            });
            const derived = deriveTurnStatus({ ...turn, images });
            return {
              ...turn,
              ...derived,
              images,
            };
          }),
        };
      });

      if (failedRequests > 0) {
        toast.error(`部分终止请求失败：${failedRequests}/${taskIds.length}`);
      } else {
        toast.success("已终止生成任务");
      }
    },
    [cancelledTurnIdsRef, clearTurnProgress, conversationsRef, updateConversation],
  );

  const handleRetryImage = useCallback(
    async (conversationId: string, turnId: string, imageIndex: number) => {
      const retryKey = `${conversationId}:${turnId}:${imageIndex}`;
      if (retryingImageIdsRef.current.has(retryKey)) {
        return;
      }

      const targetConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const targetTurn = targetConversation?.turns.find((turn) => turn.id === turnId);
      const targetImage = targetTurn?.images[imageIndex];
      if (!targetConversation || !targetTurn || !targetImage) {
        toast.error("未找到对应的图片记录");
        return;
      }
      if (isTurnInProgress(targetTurn)) {
        toast.error("当前轮次正在处理，稍后再重试");
        return;
      }
      if (!targetTurn.prompt.trim()) {
        toast.error("请输入提示词");
        return;
      }
      if (targetImage.status !== "error" && targetImage.status !== "message") {
        toast.error("只有失败图片或模型文本回复可以单独重试");
        return;
      }
      if (usesReferenceImages(targetTurn.mode) && targetTurn.referenceImages.length === 0) {
        toast.error("未找到可用的参考图");
        return;
      }

      retryingImageIdsRef.current.add(retryKey);
      const now = new Date().toISOString();
      const retryTaskId = imageTaskBatchId(`${targetTurn.id}-${createId()}`, imageIndex);
      try {
        await updateConversation(conversationId, (current) => {
          const conversation = current ?? targetConversation;
          return {
            ...conversation,
            updatedAt: now,
            turns: conversation.turns.map((turn) => {
              if (turn.id !== turnId) {
                return turn;
              }
              const images = turn.images.map((image, index) =>
                index === imageIndex
                  ? {
                      ...image,
                      taskId: retryTaskId,
                      status: "loading" as const,
                      b64_json: undefined,
                      url: undefined,
                      path: undefined,
                      width: undefined,
                      height: undefined,
                      resolution: undefined,
                      visibility: targetTurn.mode === "chat" ? undefined : targetTurn.visibility || "private",
                      revised_prompt: undefined,
                      text_response: undefined,
                      error: undefined,
                    }
                  : image,
              );
              const derived = deriveTurnStatus({ ...turn, status: "queued", images });
              return {
                ...turn,
                ...derived,
                images,
              };
            }),
          };
        });
        void runConversationQueue(conversationId);
        toast.success("已加入重试队列");
      } catch (error) {
        toast.error(formatCreationTaskError(error, "提交重试失败"));
      } finally {
        retryingImageIdsRef.current.delete(retryKey);
      }
    },
    [conversationsRef, runConversationQueue, updateConversation],
  );

  const handleRegenerateTurn = useCallback(
    async (conversationId: string, turnId: string) => {
      const targetConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const targetTurn = targetConversation?.turns.find((turn) => turn.id === turnId);
      if (!targetConversation || !targetTurn) {
        toast.error("未找到对应的对话轮次");
        return;
      }
      if (!targetTurn.prompt.trim()) {
        toast.error("请输入提示词");
        return;
      }
      if (isTurnInProgress(targetTurn)) {
        toast.error("当前轮次正在处理，稍后再重新生成");
        return;
      }
      if (usesReferenceImages(targetTurn.mode) && targetTurn.referenceImages.length === 0) {
        toast.error("未找到可用的参考图");
        return;
      }

      const now = new Date().toISOString();
      const regenerationId = createId();
      await updateConversation(conversationId, (current) => {
        const conversation = current ?? targetConversation;
        const isFirstTurn = conversation.turns[0]?.id === turnId;
        return {
          ...conversation,
          title: isFirstTurn ? buildConversationTitle(targetTurn.prompt) : conversation.title,
          updatedAt: now,
          turns: conversation.turns.map((turn) => {
            if (turn.id !== turnId) {
              return turn;
            }

            const imageCount = turn.mode === "chat" ? 1 : normalizeRequestedImageCount(turn.count || turn.images.length || 1);
            const visibility = turn.mode === "chat" ? undefined : turn.visibility || "private";
            return {
              ...turn,
              count: imageCount,
              status: "queued",
              error: undefined,
              images: Array.from({ length: imageCount }, (_, index) => ({
                id: `${turn.id}-${regenerationId}-${index}`,
                taskId: imageTaskBatchId(`${turn.id}-${regenerationId}`, index),
                status: "loading" as const,
                visibility,
              })),
            };
          }),
        };
      });
      void runConversationQueue(conversationId);
      toast.success("已加入重新生成队列");
    },
    [conversationsRef, runConversationQueue, updateConversation],
  );

  return {
    handleCancelTurn,
    handleRetryImage,
    handleRegenerateTurn,
  };
}
