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
import {
  isRetryableSubmitCapacityError,
  sleep,
} from "@/app/image/lib/image-task-utils";
import {
  formatCreationTaskError,
  usesReferenceImages,
} from "@/app/image/lib/image-turn-utils";
import {
  cancelCreationTask,
  fetchCreationTasks,
  type CreationTask,
} from "@/lib/api";
import { AUTH_SESSION_CHANGE_EVENT } from "@/lib/auth-session-events";
import type { ImageConversation } from "@/store/image-conversations";
import { imageTurnProgressKey } from "@/store/image-turn-progress";

/** Max automatic resubmits per taskId when backend reports missing_ids (prevents infinite credit drain). */
const MAX_MISSING_RESUBMITS_PER_TASK = 1;
/** Max 2-second idle waits when zero tasks of this turn are in-flight and backend returns 429 RPM/concurrency. */
const MAX_IDLE_CAPACITY_WAITS = 30;
/** Short pacing interval between rapid multi-image submissions (1–15 images). */
const SUBMIT_PACING_MS = 150;

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
        const unsubmittedGroups = [...pendingTaskGroups];
        const totalPlannedCount = pendingTaskGroups.length;
        let submittedCount = 0;
        let consecutiveIdleCapacityWaits = 0;
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

          // Sliding-window submission: submit as many pending image tasks as user/channel concurrency allows.
          let hitCapacityLimit = false;
          if (unsubmittedGroups.length > 0) {
            const newlySubmitted: CreationTask[] = [];
            while (unsubmittedGroups.length > 0) {
              assertCurrentSession();
              if (cancelledTurnIdsRef.current.has(activeTurnKey)) {
                break;
              }
              const nextGroup = unsubmittedGroups[0];
              updateTurnProgress(conversationId, activeTurn.id, {
                message: activeTurn.mode === "chat" ? "正在提交对话请求" : "正在提交生成任务",
                detail:
                  activeTurn.mode === "chat"
                    ? "对话请求正在处理"
                    : totalPlannedCount > 1
                      ? `正在提交第 ${Math.min(totalPlannedCount, submittedCount + 1)} / ${totalPlannedCount} 张图片请求`
                      : "1 张图片生成请求已提交",
              });
              try {
                const task = await submitTaskGroup(nextGroup);
                const latestConvAfterSubmit = conversationsRef.current.find(
                  (conversation) => conversation.id === conversationId,
                );
                const latestTurnAfterSubmit = latestConvAfterSubmit?.turns.find(
                  (turn) => turn.id === activeTurn.id,
                );
                if (
                  cancelledTurnIdsRef.current.has(activeTurnKey) ||
                  !latestTurnAfterSubmit ||
                  latestTurnAfterSubmit.status === "cancelled"
                ) {
                  const orphanIds = new Set<string>([
                    task.id || nextGroup.taskId,
                    ...newlySubmitted.map((item) => item.id).filter(Boolean),
                  ]);
                  orphanIds.forEach((orphanId) => {
                    if (orphanId) {
                      void cancelCreationTask(orphanId).catch(() => undefined);
                    }
                  });
                  newlySubmitted.length = 0;
                  break;
                }
                unsubmittedGroups.shift();
                submittedCount += 1;
                consecutiveIdleCapacityWaits = 0;
                newlySubmitted.push(task);
                if (unsubmittedGroups.length > 0 && !cancelledTurnIdsRef.current.has(activeTurnKey)) {
                  await sleep(SUBMIT_PACING_MS);
                }
              } catch (submitError) {
                if (submitError instanceof ImageQueueSessionChangedError) {
                  throw submitError;
                }
                if (isRetryableSubmitCapacityError(submitError)) {
                  hitCapacityLimit = true;
                  break;
                }
                if (newlySubmitted.length > 0) {
                  assertCurrentSession();
                  await applyTasks(newlySubmitted);
                  newlySubmitted.length = 0;
                }
                if (submittedCount === 0) {
                  throw submitError;
                }
                const partialMessage = formatCreationTaskError(
                  submitError,
                  activeTurn.mode === "chat" ? "对话请求失败" : "部分图片提交失败",
                );
                const remainingIds = unsubmittedGroups.map((item) => item.taskId);
                unsubmittedGroups.length = 0;
                await updateConversation(conversationId, (current) => {
                  const conversation = current ?? snapshot;
                  return markMissingTasksExhausted(conversation, activeTurn.id, remainingIds, partialMessage);
                });
                toast.error(`${partialMessage}（已提交的 ${submittedCount} 张继续生成）`);
                break;
              }
            }
            if (newlySubmitted.length > 0) {
              assertCurrentSession();
              await applyTasks(newlySubmitted);
            }
          }

          if (cancelledTurnIdsRef.current.has(activeTurnKey)) {
            break;
          }

          const unsubmittedIds = new Set(unsubmittedGroups.map((item) => item.taskId));
          const postSubmitConv = conversationsRef.current.find((conversation) => conversation.id === conversationId);
          const postSubmitTurn = postSubmitConv?.turns.find((turn) => turn.id === activeTurn.id);
          if (!postSubmitTurn || postSubmitTurn.status === "cancelled" || postSubmitTurn.status === "error") {
            break;
          }

          const inFlightIds = getLoadingTaskIds(postSubmitTurn).filter((id) => !unsubmittedIds.has(id));
          if (inFlightIds.length === 0 && unsubmittedGroups.length === 0) {
            break;
          }

          if (hitCapacityLimit && inFlightIds.length === 0) {
            consecutiveIdleCapacityWaits += 1;
            if (consecutiveIdleCapacityWaits > MAX_IDLE_CAPACITY_WAITS) {
              throw new Error("当前并发或速率已达上限，请稍后重试");
            }
          }

          updateTurnProgress(conversationId, activeTurn.id, {
            message: activeTurn.mode === "chat" ? "等待对话回复" : "等待生成结果",
            detail:
              activeTurn.mode === "chat"
                ? "对话请求处理中"
                : unsubmittedGroups.length > 0
                  ? `已提交 ${submittedCount}/${totalPlannedCount} 张，${inFlightIds.length} 张生成中（其余排队补位）`
                  : `还有 ${inFlightIds.length} 张图片生成中`,
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
          const pollIds = getLoadingTaskIds(afterSleepTurn).filter((id) => !unsubmittedIds.has(id));
          if (pollIds.length === 0) {
            if (unsubmittedGroups.length === 0) {
              break;
            }
            continue;
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
              for (const missingGroup of missingTaskGroups) {
                if (!unsubmittedGroups.some((existing) => existing.taskId === missingGroup.taskId)) {
                  unsubmittedGroups.push(missingGroup);
                }
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
