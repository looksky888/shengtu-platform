import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { recoverConversationHistory } from "@/app/image/lib/conversation-task-sync";
import { pickFallbackConversationId } from "@/app/image/lib/image-storage-utils";
import { preserveEphemeralReferenceImages } from "@/store/image-conversation-ephemeral";
import { sortImageConversations } from "@/store/image-conversation-normalize";
import { advanceConversationRevision } from "@/store/image-conversation-revision";
import {
  ACTIVE_IMAGE_CONVERSATION_STORAGE_KEY,
  getImageConversationStats,
  IMAGE_ACTIVE_CONVERSATION_REQUEST_EVENT,
  IMAGE_CONVERSATIONS_CHANGED_EVENT,
  listImageConversations,
  saveImageConversation,
  type ImageConversation,
} from "@/store/image-conversations";

type UseImageConversationsOptions = {
  restoreStoredComposerSettings: () => void;
};

export function useImageConversations({ restoreStoredComposerSettings }: UseImageConversationsOptions) {
  const conversationsRef = useRef<ImageConversation[]>([]);
  const [conversations, setConversations] = useState<ImageConversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  const activeTaskCount = useMemo(
    () =>
      conversations.reduce((sum, conversation) => {
        const stats = getImageConversationStats(conversation);
        return sum + stats.queued + stats.running;
      }, 0),
    [conversations],
  );

  const replaceConversations = useCallback((items: ImageConversation[]) => {
    conversationsRef.current = items;
    setConversations(items);
  }, []);

  const refreshConversations = useCallback(async () => {
    const items = await listImageConversations();
    replaceConversations(preserveEphemeralReferenceImages(items, conversationsRef.current));
  }, [replaceConversations]);

  useEffect(() => {
    let cancelled = false;

    const refreshChangedConversations = async () => {
      try {
        const items = await listImageConversations();
        if (!cancelled) {
          replaceConversations(preserveEphemeralReferenceImages(items, conversationsRef.current));
        }
      } catch {
        // Background updates should not surface noisy toasts while the user is on another workflow.
      }
    };

    const handleConversationsChanged = () => {
      void refreshChangedConversations();
    };

    window.addEventListener(IMAGE_CONVERSATIONS_CHANGED_EVENT, handleConversationsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(IMAGE_CONVERSATIONS_CHANGED_EVENT, handleConversationsChanged);
    };
  }, [replaceConversations]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        restoreStoredComposerSettings();
        const items = await listImageConversations();
        const normalizedItems = await recoverConversationHistory(items);
        if (cancelled) {
          return;
        }

        replaceConversations(normalizedItems);
        let storedConversationId: string | null = null;
        if (typeof window !== "undefined") {
          try {
            storedConversationId = window.localStorage.getItem(ACTIVE_IMAGE_CONVERSATION_STORAGE_KEY);
          } catch {
            storedConversationId = null;
          }
        }
        const nextSelectedConversationId =
          (storedConversationId && normalizedItems.some((conversation) => conversation.id === storedConversationId)
            ? storedConversationId
            : null) ?? pickFallbackConversationId(normalizedItems);
        setSelectedConversationId(nextSelectedConversationId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取会话记录失败";
        toast.error(message);
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [replaceConversations, restoreStoredComposerSettings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      if (selectedConversationId) {
        window.localStorage.setItem(ACTIVE_IMAGE_CONVERSATION_STORAGE_KEY, selectedConversationId);
      } else {
        window.localStorage.removeItem(ACTIVE_IMAGE_CONVERSATION_STORAGE_KEY);
      }
    } catch {
      // Ignore storage access errors.
    }
  }, [selectedConversationId]);

  useEffect(() => {
    const handleOpenConversation = (event: Event) => {
      const conversationId = (event as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
      if (conversationId) {
        setSelectedConversationId(conversationId);
      }
    };

    window.addEventListener(IMAGE_ACTIVE_CONVERSATION_REQUEST_EVENT, handleOpenConversation);
    return () => {
      window.removeEventListener(IMAGE_ACTIVE_CONVERSATION_REQUEST_EVENT, handleOpenConversation);
    };
  }, []);

  useEffect(() => {
    if (selectedConversationId && !conversations.some((conversation) => conversation.id === selectedConversationId)) {
      setSelectedConversationId(pickFallbackConversationId(conversations));
    }
  }, [conversations, selectedConversationId]);

  const persistConversation = useCallback(
    async (conversation: ImageConversation) => {
      const nextConversation = advanceConversationRevision(conversation);
      const nextConversations = sortImageConversations([
        nextConversation,
        ...conversationsRef.current.filter((item) => item.id !== nextConversation.id),
      ]);
      replaceConversations(nextConversations);
      await saveImageConversation(nextConversation);
    },
    [replaceConversations],
  );

  const updateConversation = useCallback(
    async (
      conversationId: string,
      updater: (current: ImageConversation | null) => ImageConversation,
      options: { persist?: boolean } = {},
    ) => {
      const current = conversationsRef.current.find((item) => item.id === conversationId) ?? null;
      // Every write advances the revision so merge arbitration never depends on the
      // (frequently stale) display timestamp; see image-conversation-revision.
      const nextConversation = advanceConversationRevision(updater(current));
      const nextConversations = sortImageConversations([
        nextConversation,
        ...conversationsRef.current.filter((item) => item.id !== conversationId),
      ]);
      replaceConversations(nextConversations);
      if (options.persist !== false) {
        await saveImageConversation(nextConversation);
      }
    },
    [replaceConversations],
  );

  return {
    conversations,
    conversationsRef,
    selectedConversationId,
    setSelectedConversationId,
    selectedConversation,
    isLoadingHistory,
    activeTaskCount,
    replaceConversations,
    refreshConversations,
    persistConversation,
    updateConversation,
  };
}
