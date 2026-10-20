import { fetchCreationTasks, type CreationTaskMessage } from "@/lib/api";
import { isTurnBusy } from "@/lib/image-turn-state";
import { advanceConversationRevision, touchConversation } from "@/store/image-conversation-revision";
import { saveImageConversations, type ImageConversation } from "@/store/image-conversations";

import { imageDataIndexForTask, imageTaskIdForImage, taskDataToStoredImage } from "./image-task-utils";
import { deriveTurnStatus, isMissingBatchImageDataError, isMissingRecoverableTaskIdError } from "./image-turn-utils";
import { MISSING_RECOVERABLE_TASK_ID_ERROR } from "./image-page-types";

export function buildCreationTaskMessages(conversation: ImageConversation, activeTurnId: string): CreationTaskMessage[] {
  const messages: CreationTaskMessage[] = [];
  for (const turn of conversation.turns) {
    const prompt = turn.prompt.trim();
    if (prompt) {
      messages.push({ role: "user", content: prompt });
    }
    if (turn.id === activeTurnId) {
      break;
    }

    const assistantParts = turn.images.flatMap((image) => {
      if (image.status === "message" && image.text_response?.trim()) {
        return [image.text_response.trim()];
      }
      if (image.status === "success" && image.revised_prompt?.trim()) {
        return [`Generated image: ${image.revised_prompt.trim()}`];
      }
      return [];
    });
    if (assistantParts.length > 0) {
      messages.push({ role: "assistant", content: assistantParts.join("\n\n") });
    }
  }
  return messages;
}

export async function syncConversationCreationTasks(items: ImageConversation[]) {
  const taskIds = Array.from(new Set(items.flatMap((conversation) => conversation.turns.flatMap((turn) => turn.images.flatMap((image) => (image.status === "loading" && image.taskId ? [image.taskId] : []))))));
  if (taskIds.length === 0) {
    return items;
  }

  let taskList: Awaited<ReturnType<typeof fetchCreationTasks>>;
  try {
    taskList = await fetchCreationTasks(taskIds);
  } catch {
    return items;
  }
  const taskMap = new Map(taskList.items.map((task) => [task.id, task]));
  let changed = false;
  const normalized = items.map((conversation) => {
    let completedActiveTurn = false;
    const turns = conversation.turns.map((turn) => {
      let turnChanged = false;
      const images = turn.images.map((image, imageIndex) => {
        if (image.status !== "loading" || !image.taskId) {
          return image;
        }
        const task = taskMap.get(image.taskId);
        if (!task) {
          return image;
        }
        const nextImage = taskDataToStoredImage(image, task, turn.mode, imageDataIndexForTask(turn.images, imageIndex), turn.visibility);
        if (nextImage !== image) {
          turnChanged = true;
        }
        return nextImage;
      });
      if (!turnChanged) {
        return turn;
      }
      changed = true;
      const derived = deriveTurnStatus({ ...turn, images });
      const nextTurn = { ...turn, ...derived, images };
      if (isTurnBusy(turn) && !isTurnBusy(nextTurn)) {
        completedActiveTurn = true;
      }
      return nextTurn;
    });
    if (turns === conversation.turns || !turns.some((turn, index) => turn !== conversation.turns[index])) {
      return conversation;
    }
    const nextConversation = { ...conversation, turns };
    // Only a finished turn is a user-visible change; poll updates just advance the revision.
    return completedActiveTurn ? touchConversation(nextConversation) : advanceConversationRevision(nextConversation);
  });

  if (changed) {
    await saveImageConversations(normalized);
  }
  return normalized;
}

export async function recoverConversationHistory(items: ImageConversation[]) {
  let changed = false;
  const normalized = items.map((conversation) => {
    const turns = conversation.turns.map((turn) => {
      let turnChanged = false;
      const recoveredImages = turn.images.map((image, imageIndex) => {
        if (image.status === "error" && isMissingBatchImageDataError(image.error)) {
          turnChanged = true;
          return { ...image, taskId: image.id, status: "loading" as const, error: undefined };
        }
        if (turn.mode === "chat" && image.status === "error" && isMissingRecoverableTaskIdError(image.error)) {
          turnChanged = true;
          return { ...image, taskId: imageTaskIdForImage(turn.id, turn.images, imageIndex), status: "loading" as const, error: undefined };
        }
        if (turn.mode === "chat" && image.status === "loading" && !image.taskId) {
          turnChanged = true;
          return { ...image, taskId: imageTaskIdForImage(turn.id, turn.images, imageIndex) };
        }
        return image;
      });

      if (turn.status !== "queued" && turn.status !== "generating") {
        if (!turnChanged) {
          return turn;
        }
        changed = true;
        const derived = deriveTurnStatus({ ...turn, status: "queued", images: recoveredImages });
        return { ...turn, ...derived, images: recoveredImages };
      }

      const images = recoveredImages.map((image) => {
        if (image.status !== "loading" || image.taskId) {
          return image;
        }
        turnChanged = true;
        return { ...image, status: "error" as const, error: MISSING_RECOVERABLE_TASK_ID_ERROR };
      });
      const derived = deriveTurnStatus({ ...turn, images });
      if (!turnChanged && derived.status === turn.status && derived.error === turn.error) {
        return turn;
      }
      changed = true;
      return { ...turn, ...derived, images };
    });

    if (!turns.some((turn, index) => turn !== conversation.turns[index])) {
      return conversation;
    }

    return touchConversation(conversation, { turns });
  });

  if (changed) {
    await saveImageConversations(normalized);
  }

  return syncConversationCreationTasks(normalized);
}
