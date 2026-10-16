import { buildCreationTaskMessages } from "@/app/image/lib/conversation-task-sync";
import { DEFAULT_IMAGE_OUTPUT_FORMAT, DEFAULT_IMAGE_QUALITY } from "@/app/image/lib/image-page-types";
import {
  imageOutputCompressionForFormat,
  imageQualityForModel,
  resolveCreationTaskRoute,
  usesReferenceImages,
} from "@/app/image/lib/image-turn-utils";
import { dataUrlToFile } from "@/app/image/lib/reference-image-utils";
import {
  createChatCompletionTask,
  createImageEditTask,
  createImageGenerationTask,
  createResponseImageGenerationTask,
} from "@/lib/api";
import type { ImageConversation } from "@/store/image-conversations";

type ImageTurn = ImageConversation["turns"][number];
type TaskGroup = { taskId: string; count: number };

export function buildImageQueueTaskSubmitter(
  conversation: ImageConversation,
  turn: ImageTurn,
  beforeSubmit: () => void,
) {
  const referenceFiles = turn.referenceImages.map((image, index) =>
    dataUrlToFile(image.dataUrl, image.name || `${turn.id}-${index + 1}.png`, image.type),
  );
  if (usesReferenceImages(turn.mode) && referenceFiles.length === 0) {
    throw new Error("未找到可用的参考图");
  }
  const taskMessages = buildCreationTaskMessages(conversation, turn.id);
  const outputFormat = turn.outputFormat || DEFAULT_IMAGE_OUTPUT_FORMAT;
  const outputCompression = imageOutputCompressionForFormat(outputFormat, turn.outputCompression);
  const quality = imageQualityForModel(turn.model, turn.quality || DEFAULT_IMAGE_QUALITY);

  return (group: TaskGroup) => {
    beforeSubmit();
    const route = resolveCreationTaskRoute(
      turn.mode,
      turn.model,
      usesReferenceImages(turn.mode) && referenceFiles.length > 0,
    );
    switch (route) {
      case "chat":
        return createChatCompletionTask(group.taskId, turn.prompt, turn.model, taskMessages);
      case "response-image":
        return createResponseImageGenerationTask(
          group.taskId, turn.prompt, turn.model, turn.size, quality, group.count, taskMessages,
          turn.referenceImages.map((image) => image.dataUrl), turn.visibility || "private",
          turn.sizeSelection?.resolution, outputFormat, outputCompression,
          turn.channelModelId,
        );
      case "image-edits":
        return createImageEditTask(
          group.taskId, referenceFiles, turn.prompt, turn.model, turn.size, quality, group.count,
          taskMessages, turn.visibility || "private", turn.sizeSelection?.resolution,
          outputFormat, outputCompression,
          turn.channelModelId,
        );
      case "image-generations":
      default:
        return createImageGenerationTask(
          group.taskId, turn.prompt, turn.model, turn.size, quality, group.count, taskMessages,
          turn.visibility || "private", turn.sizeSelection?.resolution, outputFormat, outputCompression,
          turn.channelModelId,
        );
    }
  };
}
