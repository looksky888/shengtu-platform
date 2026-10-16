import { useCallback, useEffect, useRef, type RefObject } from "react";
import { toast } from "sonner";

import { buildImageQueueTaskSubmitter } from "@/app/image/hooks/image-queue-task-submitter";
import { activeConversationQueueIds, QUOTA_REFRESH_EVENT } from "@/app/image/lib/image-page-types";
import {
  applyCreationTasksToConversation,
  buildMissingTaskGroups,
  buildPendingTaskGroups,
  findRunnableTurn,
  getLoadingTaskIds,
  hasRunnableConversation,
  markMissingTasksExhausted,
  markTurnError,
  markTurnTasksGenerating,
} from "@/app/image/lib/image-queue-utils";

/** Max automatic resubmits per taskId when backend reports missing_ids (prevents infinite credit drain). */
const MAX_MISSING_RESUBMITS_PER_TASK = 1;
import {
  sleep,
  submitCreationTaskGroupsSequentially,
} from "@/app/image/lib/image-task-utils";
import {
  formatCreationTaskError,
  usesReferenceImages,
} from "@/app/image/lib/image-turn-utils";
import {
  fetchCreationTasks,
  type CreationTask,
} from "@/lib/api";
import { AUTH_SESSION_CHANGE_EVENT } from "@/lib/auth-session-events";
import type { ImageConversation } from "@/store/image-conversations";
import { imageTurnProgressKey } from "@/store/image-turn-progress";

type UpdateConversation = (
  conversationId: string,
  updater: (current: ImageConversation | null) => ImageConversation,
  options?: { persist?: boolean },
) => Promise<void>;

type UpdateTurnProgress = (
  conversationId: string,
  turnId: string,
  updates: { message: string; detail?: string; startedAt?: number },
) => void;

type UseImageQueueRunnerOptions = {
  conversations: ImageConversation[];
  conversationsRef: RefObject<ImageConversation[]>;
  cancelledTurnIdsRef: RefObject<Set<string>>;
  updateConversation: UpdateConversation;
  updateTurnProgress: UpdateTurnProgress;
  clearTurnProgress: (conversationId: string, turnId: string) => void;
};

class ImageQueueSessionChangedError extends Error {}

export function useImageQueueRunner({
  conversations,
  conversationsRef,
  cancelledTurnIdsRef,
  updateConversation,
  updateTurnProgress,
  clearTurnProgress,
}: UseImageQueueRunnerOptions) {
  const sessionGenerationRef = useRef(0);
  const runConversationQueue = useCallback(
    async (conversationId: string) => {
      if (activeConversationQueueIds.has(conversationId)) {
        return;
      }

      const snapshot = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const activeTurn = findRunnableTurn(snapshot);
      if (!snapshot || !activeTurn) {
        return;
      }

      activeConversationQueueIds.add(conversationId);
      const sessionGeneration = sessionGenerationRef.current;
      const assertCurrentSession = () => {
        if (sessionGeneration !== sessionGenerationRef.current) {
          throw new ImageQueueSessionChangedError("auth session changed");
        }
      };
      const activeTurnKey = imageTurnProgressKey(conversationId, activeTurn.id);
      updateTurnProgress(conversationId, activeTurn.id, {
        message: activeTurn.mode === "chat" ? "正在准备对话请求" : "正在准备生成任务",
        detail:
          activeTurn.mode === "chat"
            ? "正在整理上下文"
            : `准备处理 ${activeTurn.images.filter((image) => image.status === "loading").length || activeTurn.count} 张图片`,
      });
      const applyTasks = async (tasks: CreationTask[]) => {
        assertCurrentSession();
        await updateConversation(conversationId, (current) => {
          const conversation = current ?? snapshot;
          return applyCreationTasksToConversation(conversation, activeTurn.id, tasks);
        });
      };

      try {
        assertCurrentSession();
        await updateConversation(conversationId, (current) => {
          const conversation = current ?? snapshot;
          return markTurnTasksGenerating(conversation, activeTurn.id);
        });

        updateTurnProgress(conversationId, activeTurn.id, {
          message:
            activeTurn.mode === "chat" ? "正在准备对话请求" : usesReferenceImages(activeTurn.mode) ? "正在整理参考图" : "正在准备生成任务",
          detail:
            activeTurn.mode === "chat"
              ? "正在整理上下文并提交到后台"
              : usesReferenceImages(activeTurn.mode)
                ? "正在读取参考图并准备上传"
                : "正在创建图片生成请求",
        });
        const pendingTaskGroups = buildPendingTaskGroups(activeTurn);
        const submitTaskGroup = buildImageQueueTaskSubmitter(snapshot, activeTurn, assertCurrentSession);
        updateTurnProgress(conversationId, activeTurn.id, {
          message: activeTurn.mode === "chat" ? "正在提交对话请求" : "正在提交生成任务",
          detail: activeTurn.mode === "chat" ? "对话请求正在处理" : `${pendingTaskGroups.length} 张图片生成请求已提交`,
        });
        const submitted = await submitCreationTaskGroupsSequentially(pendingTaskGroups, submitTaskGroup);
        assertCurrentSession();
        await applyTasks(submitted);
        updateTurnProgress(conversationId, activeTurn.id, {
          message: activeTurn.mode === "chat" ? "等待对话回复" : "等待生成结果",
          detail: "任务已经提交，正在查询生成状态",
        });

        const missingResubmitCount = new Map<string, number>();

        while (true) {
          assertCurrentSession();
          if (cancelledTurnIdsRef.current.has(activeTurnKey)) {
            break;
          }

          const latestConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
          const latestTurn = latestConversation?.turns.find((turn) => turn.id === activeTurn.id);
          if (!latestTurn || latestTurn.status === "cancelled" || latestTurn.status === "error") {
            break;
          }
          const loadingTaskIds = getLoadingTaskIds(latestTurn);
          if (loadingTaskIds.length === 0) {
            break;
          }

          updateTurnProgress(conversationId, activeTurn.id, {
            message: activeTurn.mode === "chat" ? "等待对话回复" : "等待生成结果",
            detail: activeTurn.mode === "chat" ? "对话请求处理中" : `还有 ${loadingTaskIds.length} 张图片生成中`,
          });
          await sleep(2000);
          assertCurrentSession();

          // Re-check cancel after sleep — user may have stopped during the wait.
          if (cancelledTurnIdsRef.current.has(activeTurnKey)) {
            break;
          }
          const afterSleepConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
          const afterSleepTurn = afterSleepConversation?.turns.find((turn) => turn.id === activeTurn.id);
          if (!afterSleepTurn || afterSleepTurn.status === "cancelled" || afterSleepTurn.status === "error") {
            break;
          }
          const pollIds = getLoadingTaskIds(afterSleepTurn);
          if (pollIds.length === 0) {
            break;
          }

          const taskList = await fetchCreationTasks(pollIds);
          assertCurrentSession();
          if (taskList.items.length > 0) {
            await applyTasks(taskList.items);
          }
          if (taskList.missing_ids.length > 0) {
            const canResubmit: string[] = [];
            const exhausted: string[] = [];
            for (const taskId of taskList.missing_ids) {
              const used = missingResubmitCount.get(taskId) || 0;
              if (used >= MAX_MISSING_RESUBMITS_PER_TASK) {
                exhausted.push(taskId);
                continue;
              }
              missingResubmitCount.set(taskId, used + 1);
              canResubmit.push(taskId);
            }
            if (exhausted.length > 0) {
              await updateConversation(conversationId, (current) => {
                const conversation = current ?? snapshot;
                return markMissingTasksExhausted(conversation, activeTurn.id, exhausted);
              });
              toast.error(`有 ${exhausted.length} 个任务状态丢失且已达重提上限`);
            }
            if (canResubmit.length > 0 && !cancelledTurnIdsRef.current.has(activeTurnKey)) {
              const turnForResubmit =
                conversationsRef.current.find((conversation) => conversation.id === conversationId)?.turns.find((turn) => turn.id === activeTurn.id) ||
                afterSleepTurn;
              updateTurnProgress(conversationId, activeTurn.id, {
                message: activeTurn.mode === "chat" ? "正在恢复对话任务" : "正在恢复生成任务",
                detail: `${canResubmit.length} 个任务状态丢失，正在重新提交（每任务最多 ${MAX_MISSING_RESUBMITS_PER_TASK} 次）`,
              });
              const missingTaskGroups = buildMissingTaskGroups(turnForResubmit, canResubmit);
              const resubmitted = await submitCreationTaskGroupsSequentially(missingTaskGroups, submitTaskGroup);
              assertCurrentSession();
              if (resubmitted.length > 0) {
                await applyTasks(resubmitted);
              }
            }
          }
        }

        updateTurnProgress(conversationId, activeTurn.id, {
          message: activeTurn.mode === "chat" ? "回复完成" : "生成完成",
          detail: "正在刷新会话",
        });
        if (activeTurn.mode !== "chat") {
          window.dispatchEvent(new Event(QUOTA_REFRESH_EVENT));
        }
      } catch (error) {
        if (error instanceof ImageQueueSessionChangedError) {
          return;
        }
        const message = formatCreationTaskError(error, activeTurn.mode === "chat" ? "对话请求失败" : "生成图片失败");
        await updateConversation(conversationId, (current) => {
          const conversation = current ?? snapshot;
          return markTurnError(conversation, activeTurn.id, message);
        });
        toast.error(message);
      } finally {
        clearTurnProgress(conversationId, activeTurn.id);
        cancelledTurnIdsRef.current.delete(activeTurnKey);
        activeConversationQueueIds.delete(conversationId);
        if (sessionGeneration === sessionGenerationRef.current) {
          for (const conversation of conversationsRef.current) {
            if (!activeConversationQueueIds.has(conversation.id) && hasRunnableConversation(conversation)) {
              void runConversationQueue(conversation.id);
            }
          }
        }
      }
    },
    [cancelledTurnIdsRef, clearTurnProgress, conversationsRef, updateConversation, updateTurnProgress],
  );

  useEffect(() => {
    const handleSessionChange = () => {
      sessionGenerationRef.current += 1;
    };
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
    return () => window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, handleSessionChange);
  }, []);

  useEffect(() => {
    for (const conversation of conversations) {
      if (!activeConversationQueueIds.has(conversation.id) && hasRunnableConversation(conversation)) {
        void runConversationQueue(conversation.id);
      }
    }
  }, [conversations, runConversationQueue]);

  return { runConversationQueue };
}
