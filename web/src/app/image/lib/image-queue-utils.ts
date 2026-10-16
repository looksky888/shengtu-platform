import { imageDataIndexForTask, imageTaskIdForImage, taskDataToStoredImage } from "@/app/image/lib/image-task-utils";
import { deriveTurnStatus, isTurnInProgress } from "@/app/image/lib/image-turn-utils";
import type { CreationTask } from "@/lib/api";
import type { ImageConversation, ImageTurn } from "@/store/image-conversations";

export type ImageTaskGroup = {
  taskId: string;
  count: number;
};

export function findRunnableTurn(conversation: ImageConversation | undefined | null) {
  return conversation?.turns.find(
    (turn) =>
      (turn.status === "queued" || turn.status === "generating") &&
      turn.images.some((image) => image.status === "loading"),
  );
}

export function hasRunnableConversation(conversation: ImageConversation) {
  return Boolean(findRunnableTurn(conversation));
}

export function buildPendingTaskGroups(turn: ImageTurn) {
  return turn.images.reduce<ImageTaskGroup[]>((groups, image, imageIndex) => {
    if (image.status !== "loading") {
      return groups;
    }
    const taskId = imageTaskIdForImage(turn.id, turn.images, imageIndex);
    const existing = groups.find((group) => group.taskId === taskId);
    if (existing) {
      existing.count += 1;
    } else {
      groups.push({ taskId, count: 1 });
    }
    return groups;
  }, []);
}

export function getLoadingTaskIds(turn: ImageTurn | undefined | null) {
  return Array.from(
    new Set(turn?.images.flatMap((image) => (image.status === "loading" && image.taskId ? [image.taskId] : [])) || []),
  );
}

export function buildMissingTaskGroups(turn: ImageTurn, missingIds: string[]) {
  return missingIds.flatMap((taskId) => {
    const count = turn.images.filter((image) => image.status === "loading" && image.taskId === taskId).length;
    return count > 0 ? [{ taskId, count }] : [];
  });
}

export function markTurnTasksGenerating(conversation: ImageConversation, turnId: string) {
  return {
    ...conversation,
    turns: conversation.turns.map((turn) =>
      turn.id === turnId
        ? {
            ...turn,
            status: "generating" as const,
            error: undefined,
            images: turn.images.map((image, imageIndex) =>
              image.status === "loading"
                ? {
                    ...image,
                    taskId: imageTaskIdForImage(turn.id, turn.images, imageIndex),
                  }
                : image,
            ),
          }
        : turn,
    ),
  };
}

const LOCAL_TERMINAL_IMAGE_STATUSES = new Set(["cancelled", "error", "success"]);

export function applyCreationTasksToConversation(
  conversation: ImageConversation,
  turnId: string,
  tasks: CreationTask[],
) {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  let completedActiveTurn = false;
  const turns = conversation.turns.map((turn) => {
    if (turn.id !== turnId) {
      return turn;
    }
    // Local cancel/error must win over concurrent poll results.
    if (turn.status === "cancelled" || turn.status === "error") {
      return turn;
    }
    const images = turn.images.map((image, imageIndex) => {
      // Never revive a terminal local image from a stale poll/resubmit.
      if (image.status && LOCAL_TERMINAL_IMAGE_STATUSES.has(image.status)) {
        return image;
      }
      const taskId = image.taskId || image.id;
      const task = taskMap.get(taskId);
      const taskImage = image.taskId === taskId ? image : { ...image, taskId };
      return task ? taskDataToStoredImage(taskImage, task, turn.mode, imageDataIndexForTask(turn.images, imageIndex), turn.visibility) : image;
    });
    const derived = deriveTurnStatus({ ...turn, status: "generating", images });
    const nextTurn = {
      ...turn,
      ...derived,
      images,
    };
    if (isTurnInProgress(turn) && !isTurnInProgress(nextTurn)) {
      completedActiveTurn = true;
    }
    return nextTurn;
  });
  const nextConversation = {
    ...conversation,
    turns,
  };
  return completedActiveTurn
    ? {
        ...nextConversation,
        updatedAt: new Date().toISOString(),
      }
    : nextConversation;
}

/** Mark loading images for exhausted missing-resubmit budget as error so the poll loop can exit. */
export function markMissingTasksExhausted(
  conversation: ImageConversation,
  turnId: string,
  taskIds: string[],
  message = "任务状态丢失且已达重提上限",
) {
  if (taskIds.length === 0) {
    return conversation;
  }
  const idSet = new Set(taskIds);
  return {
    ...conversation,
    updatedAt: new Date().toISOString(),
    turns: conversation.turns.map((turn) => {
      if (turn.id !== turnId) {
        return turn;
      }
      const images = turn.images.map((image) => {
        const taskId = image.taskId || image.id;
        if (image.status === "loading" && idSet.has(taskId)) {
          return { ...image, status: "error" as const, error: message };
        }
        return image;
      });
      const derived = deriveTurnStatus({ ...turn, images });
      return { ...turn, ...derived, images, error: derived.error || message };
    }),
  };
}

export function markTurnError(conversation: ImageConversation, turnId: string, message: string) {
  return {
    ...conversation,
    updatedAt: new Date().toISOString(),
    turns: conversation.turns.map((turn) =>
      turn.id === turnId
        ? {
            ...turn,
            status: "error" as const,
            error: message,
            images: turn.images.map((image) => (image.status === "loading" ? { ...image, status: "error" as const, error: message } : image)),
          }
        : turn,
    ),
  };
}
