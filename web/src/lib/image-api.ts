import { httpRequest } from "@/lib/request";
import type {
  CreationTask,
  CreationTaskMessage,
  ImageModel,
  ImageOutputFormat,
  ImageQuality,
  ImageVisibility,
} from "@/lib/api-types";

export * from "@/lib/image-task-api";

function validGifPositiveInt(outputFormat: ImageOutputFormat | undefined, value: number | undefined): number | undefined {
  if (outputFormat !== "gif" || typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : undefined;
}

export async function createImageGenerationTask(
  clientTaskId: string,
  prompt: string,
  model?: ImageModel,
  size?: string,
  quality?: ImageQuality,
  count = 1,
  messages?: CreationTaskMessage[],
  visibility: ImageVisibility = "private",
  imageResolution?: string,
  outputFormat?: ImageOutputFormat,
  outputCompression?: number,
  channelModelId?: string,
  frameCount?: number,
  frameDurationMs?: number,
) {
  const safeFrameCount = validGifPositiveInt(outputFormat, frameCount);
  const safeFrameDurationMs = validGifPositiveInt(outputFormat, frameDurationMs);
  return httpRequest<CreationTask>("/api/creation-tasks/image-generations", {
    method: "POST",
    body: {
      client_task_id: clientTaskId,
      prompt,
      ...(model ? { model } : {}),
      ...(size ? { size } : {}),
      ...(imageResolution ? { image_resolution: imageResolution } : {}),
      ...(quality ? { quality } : {}),
      ...(outputFormat ? { output_format: outputFormat } : {}),
      ...(typeof outputCompression === "number" && outputFormat !== "png" && outputFormat !== "gif"
        ? { output_compression: outputCompression }
        : {}),
      ...(safeFrameCount !== undefined ? { frame_count: safeFrameCount } : {}),
      ...(safeFrameDurationMs !== undefined ? { frame_duration_ms: safeFrameDurationMs } : {}),
      ...(channelModelId ? { channel_model_id: channelModelId } : {}),
      ...(messages?.length ? { messages } : {}),
      visibility,
      n: count,
    },
  });
}

export async function createResponseImageGenerationTask(
  clientTaskId: string,
  prompt: string,
  model: ImageModel,
  size?: string,
  quality?: ImageQuality,
  count = 1,
  messages?: CreationTaskMessage[],
  images?: string[],
  visibility: ImageVisibility = "private",
  imageResolution?: string,
  outputFormat?: ImageOutputFormat,
  outputCompression?: number,
  channelModelId?: string,
  frameCount?: number,
  frameDurationMs?: number,
) {
  const safeFrameCount = validGifPositiveInt(outputFormat, frameCount);
  const safeFrameDurationMs = validGifPositiveInt(outputFormat, frameDurationMs);
  return httpRequest<CreationTask>("/api/creation-tasks/response-image-generations", {
    method: "POST",
    body: {
      client_task_id: clientTaskId,
      prompt,
      model,
      ...(size ? { size } : {}),
      ...(imageResolution ? { image_resolution: imageResolution } : {}),
      ...(quality ? { quality } : {}),
      ...(outputFormat ? { output_format: outputFormat } : {}),
      ...(typeof outputCompression === "number" && outputFormat !== "png" && outputFormat !== "gif"
        ? { output_compression: outputCompression }
        : {}),
      ...(safeFrameCount !== undefined ? { frame_count: safeFrameCount } : {}),
      ...(safeFrameDurationMs !== undefined ? { frame_duration_ms: safeFrameDurationMs } : {}),
      ...(channelModelId ? { channel_model_id: channelModelId } : {}),
      ...(messages?.length ? { messages } : {}),
      ...(images?.length ? { images } : {}),
      visibility,
      n: count,
    },
  });
}

export async function createImageEditTask(
  clientTaskId: string,
  files: File | File[],
  prompt: string,
  model?: ImageModel,
  size?: string,
  quality?: ImageQuality,
  count = 1,
  messages?: CreationTaskMessage[],
  visibility: ImageVisibility = "private",
  imageResolution?: string,
  outputFormat?: ImageOutputFormat,
  outputCompression?: number,
  channelModelId?: string,
  frameCount?: number,
  frameDurationMs?: number,
) {
  const formData = new FormData();
  const uploadFiles = Array.isArray(files) ? files : [files];
  const safeFrameCount = validGifPositiveInt(outputFormat, frameCount);
  const safeFrameDurationMs = validGifPositiveInt(outputFormat, frameDurationMs);

  uploadFiles.forEach((file) => {
    formData.append("image", file);
  });
  formData.append("client_task_id", clientTaskId);
  formData.append("prompt", prompt);
  if (model) {
    formData.append("model", model);
  }
  if (size) {
    formData.append("size", size);
  }
  if (imageResolution) {
    formData.append("image_resolution", imageResolution);
  }
  if (quality) {
    formData.append("quality", quality);
  }
  if (outputFormat) {
    formData.append("output_format", outputFormat);
  }
  if (typeof outputCompression === "number" && outputFormat !== "png" && outputFormat !== "gif") {
    formData.append("output_compression", String(outputCompression));
  }
  if (safeFrameCount !== undefined) {
    formData.append("frame_count", String(safeFrameCount));
  }
  if (safeFrameDurationMs !== undefined) {
    formData.append("frame_duration_ms", String(safeFrameDurationMs));
  }
  if (channelModelId) {
    formData.append("channel_model_id", channelModelId);
  }
  if (messages?.length) {
    formData.append("messages", JSON.stringify(messages));
  }
  formData.append("visibility", visibility);
  formData.append("n", String(count));

  return httpRequest<CreationTask>("/api/creation-tasks/image-edits", {
    method: "POST",
    body: formData,
  });
}

export async function createChatCompletionTask(
  clientTaskId: string,
  prompt: string,
  model: ImageModel,
  messages: CreationTaskMessage[],
) {
  return httpRequest<CreationTask>("/api/creation-tasks/chat-completions", {
    method: "POST",
    body: {
      client_task_id: clientTaskId,
      prompt,
      model,
      messages,
    },
  });
}
