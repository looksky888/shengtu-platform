import { useCallback, type RefObject } from "react";
import { toast } from "sonner";

import { removeImageTurn } from "@/app/image/lib/image-conversation-mutations";
import { isTurnBusy } from "@/lib/image-turn-state";
import type { ImageConversation } from "@/store/image-conversations";

type UpdateConversation = (
  conversationId: string,
  updater: (current: ImageConversation | null) => ImageConversation,
) => Promise<void>;

type UseImageTurnDeleteActionOptions = {
  conversationsRef: RefObject<ImageConversation[]>;
  replaceConversations: (items: ImageConversation[]) => void;
  updateConversation: UpdateConversation;
  clearTurnProgress: (conversationId: string, turnId: string) => void;
};

export function useImageTurnDeleteAction({
  conversationsRef,
  replaceConversations,
  updateConversation,
  clearTurnProgress,
}: UseImageTurnDeleteActionOptions) {
  return useCallback(
    async (conversationId: string, turnId: string) => {
      const targetConversation = conversationsRef.current.find((conversation) => conversation.id === conversationId);
      const targetTurn = targetConversation?.turns.find((turn) => turn.id === turnId);
      if (!targetConversation || !targetTurn) {
        toast.error("未找到对应的对话轮次");
        return;
      }
      if (isTurnBusy(targetTurn)) {
        toast.error("当前轮次正在处理，请先终止任务后再删除");
        return;
      }

      const previousConversations = conversationsRef.current;
      try {
        await updateConversation(conversationId, (current) => {
          const conversation = current ?? targetConversation;
          const latestTurn = conversation.turns.find((turn) => turn.id === turnId);
          if (!latestTurn) {
            throw new Error("未找到对应的对话轮次");
          }
          if (isTurnBusy(latestTurn)) {
            throw new Error("当前轮次正在处理，请先终止任务后再删除");
          }
          const nextConversation = removeImageTurn(conversation, turnId);
          if (!nextConversation) {
            throw new Error("未找到对应的对话轮次");
          }
          return nextConversation;
        });
        clearTurnProgress(conversationId, turnId);
        toast.success("已删除本轮创作记录，图片库中的图片仍然保留");
      } catch (error) {
        replaceConversations(previousConversations);
        toast.error(error instanceof Error ? error.message : "删除本轮创作记录失败");
      }
    },
    [clearTurnProgress, conversationsRef, replaceConversations, updateConversation],
  );
}
