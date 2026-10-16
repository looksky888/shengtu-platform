import type { ImageConversation } from "@/store/image-conversations";

const EMPTY_CONVERSATION_TITLE = "新建对话";

export function buildConversationTitle(prompt: string) {
  const trimmed = prompt.trim();
  return trimmed.length <= 12 ? trimmed : `${trimmed.slice(0, 12)}...`;
}

/** Remove one completed turn while keeping the conversation usable for the next submission. */
export function removeImageTurn(
  conversation: ImageConversation,
  turnId: string,
  updatedAt = new Date().toISOString(),
): ImageConversation | null {
  const turnIndex = conversation.turns.findIndex((turn) => turn.id === turnId);
  if (turnIndex < 0) {
    return null;
  }

  const turns = conversation.turns.filter((turn) => turn.id !== turnId);
  const firstTurn = turns[0];
  return {
    ...conversation,
    title:
      turnIndex === 0
        ? firstTurn?.prompt.trim()
          ? buildConversationTitle(firstTurn.prompt)
          : EMPTY_CONVERSATION_TITLE
        : conversation.title,
    updatedAt,
    turns,
  };
}
