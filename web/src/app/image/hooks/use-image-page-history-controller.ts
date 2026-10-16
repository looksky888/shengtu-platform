import { useCallback, type RefObject } from "react";

import { useImageHistoryActions } from "@/app/image/hooks/use-image-history-actions";
import { useImageTurnDeleteAction } from "@/app/image/hooks/use-image-turn-delete-action";
import type { ImageConversation } from "@/store/image-conversations";

type UseImagePageHistoryControllerParams = {
  conversations: ImageConversation[];
  conversationsRef: RefObject<ImageConversation[]>;
  selectedConversationId: string | null;
  setSelectedConversationId: (value: string | null) => void;
  replaceConversations: (value: ImageConversation[]) => void;
  resetComposer: () => void;
  updateConversation: (
    conversationId: string,
    updater: (conversation: ImageConversation | null) => ImageConversation,
    options?: { persist?: boolean },
  ) => Promise<void>;
  clearTurnProgress: (conversationId: string, turnId: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

export function useImagePageHistoryController({
  conversations,
  conversationsRef,
  selectedConversationId,
  setSelectedConversationId,
  replaceConversations,
  resetComposer,
  updateConversation,
  clearTurnProgress,
  textareaRef,
}: UseImagePageHistoryControllerParams) {
  const handleDeleteTurn = useImageTurnDeleteAction({
    conversationsRef,
    replaceConversations,
    updateConversation,
    clearTurnProgress,
  });
  const historyActions = useImageHistoryActions({
    conversations,
    selectedConversationId,
    setSelectedConversationId,
    replaceConversations,
    resetComposer,
    handleDeleteTurn,
  });
  const handleCreateDraft = useCallback(() => {
    setSelectedConversationId(null);
    resetComposer();
    textareaRef.current?.focus();
  }, [resetComposer, setSelectedConversationId, textareaRef]);

  return { ...historyActions, handleDeleteTurn, handleCreateDraft };
}
