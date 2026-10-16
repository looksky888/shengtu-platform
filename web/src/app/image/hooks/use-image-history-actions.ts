import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { ImageDeleteConfirmTarget } from "@/app/image/components/image-delete-confirm-dialog";
import { pickFallbackConversationId } from "@/app/image/lib/image-storage-utils";
import {
  clearImageConversations,
  deleteImageConversation,
  listImageConversations,
  type ImageConversation,
} from "@/store/image-conversations";

type UseImageHistoryActionsParams = {
  conversations: ImageConversation[];
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;
  replaceConversations: (items: ImageConversation[]) => void;
  resetComposer: () => void;
  handleDeleteTurn: (conversationId: string, turnId: string) => void | Promise<void>;
};

export function useImageHistoryActions({
  conversations,
  selectedConversationId,
  setSelectedConversationId,
  replaceConversations,
  resetComposer,
  handleDeleteTurn,
}: UseImageHistoryActionsParams) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<ImageDeleteConfirmTarget | null>(null);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      const nextConversations = conversations.filter((item) => item.id !== id);
      replaceConversations(nextConversations);
      if (selectedConversationId === id) {
        setSelectedConversationId(pickFallbackConversationId(nextConversations));
        resetComposer();
      }

      try {
        await deleteImageConversation(id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "删除会话失败";
        toast.error(message);
        const items = await listImageConversations();
        replaceConversations(items);
      }
    },
    [conversations, replaceConversations, resetComposer, selectedConversationId, setSelectedConversationId],
  );

  const handleClearHistory = useCallback(async () => {
    try {
      await clearImageConversations();
      replaceConversations([]);
      setSelectedConversationId(null);
      resetComposer();
      toast.success("已清空历史记录");
    } catch (error) {
      const message = error instanceof Error ? error.message : "清空历史记录失败";
      toast.error(message);
    }
  }, [replaceConversations, resetComposer, setSelectedConversationId]);

  const openDeleteConversationConfirm = useCallback((id: string) => {
    setIsHistoryOpen(false);
    setDeleteConfirm({ type: "one", id });
  }, []);

  const openClearHistoryConfirm = useCallback(() => {
    setIsHistoryOpen(false);
    setDeleteConfirm({ type: "all" });
  }, []);

  const openDeleteTurnConfirm = useCallback((conversationId: string, turnId: string, prompt: string) => {
    setDeleteConfirm({ type: "turn", conversationId, turnId, prompt });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    const target = deleteConfirm;
    setDeleteConfirm(null);
    if (!target) return;
    if (target.type === "all") {
      await handleClearHistory();
      return;
    }
    if (target.type === "turn") {
      await handleDeleteTurn(target.conversationId, target.turnId);
      return;
    }
    await handleDeleteConversation(target.id);
  }, [deleteConfirm, handleClearHistory, handleDeleteConversation, handleDeleteTurn]);

  return {
    isHistoryOpen,
    setIsHistoryOpen,
    deleteConfirm,
    setDeleteConfirm,
    openDeleteConversationConfirm,
    openClearHistoryConfirm,
    openDeleteTurnConfirm,
    handleConfirmDelete,
  };
}
