import type { ImageConversation } from "@/store/image-conversation-types";

export function preserveEphemeralReferenceImages(
  persisted: ImageConversation[],
  current: ImageConversation[],
): ImageConversation[] {
  const currentConversations = new Map(current.map((conversation) => [conversation.id, conversation]));
  return persisted.map((conversation) => {
    const currentConversation = currentConversations.get(conversation.id);
    if (!currentConversation) {
      return conversation;
    }
    const currentTurns = new Map(currentConversation.turns.map((turn) => [turn.id, turn]));
    let changed = false;
    const turns = conversation.turns.map((turn) => {
      const currentTurn = currentTurns.get(turn.id);
      if (!currentTurn || currentTurn.referenceImages.length === 0) {
        return turn;
      }
      changed = true;
      return { ...turn, referenceImages: currentTurn.referenceImages };
    });
    return changed ? { ...conversation, turns } : conversation;
  });
}
