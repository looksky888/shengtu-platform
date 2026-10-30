import type { CreationTask, ImageVisibility } from "@/lib/api";
import { getManagedImagePathFromUrl } from "@/lib/image-path";
import type { ImageConversationMode, StoredImage } from "@/store/image-conversations";

import { isRetryableSubmitCapacityError } from "./image-count-utils";
import { formatCreationTaskErrorMessage } from "./image-turn-utils";

export { isRetryableSubmitCapacityError };

const IMAGE_TASK_IMAGE_COUNT = 1;

type CreationTaskDataItem = NonNullable<CreationTask["data"]>[number];

export function positiveDimension(value: unknown) {
  const dimension = Number(value);
  return Number.isFinite(dimension) && dimension > 0 ? Math.round(dimension) : undefined;
}

export async function submitCreationTaskGroupsSequentially<T>(
  groups: Array<{ taskId: string; count: number }>,
  submit: (group: { taskId: string; count: number }) => Promise<T>,
  delayMs = 150,
) {
  const results: T[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    results.push(await submit(groups[index]));
    if (index < groups.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }
  return results;
}

export function imageTaskBatchId(turnId: string, imageIndex: number) {
  return `${turnId}-task-${Math.floor(imageIndex / IMAGE_TASK_IMAGE_COUNT)}`;
}

export function imageTaskIdForImage(turnId: string, images: StoredImage[], imageIndex: number) {
  return images[imageIndex]?.taskId || imageTaskBatchId(turnId, imageIndex);
}

export function imageDataIndexForTask(images: StoredImage[], imageIndex: number) {
  const taskId = images[imageIndex]?.taskId || images[imageIndex]?.id;
  if (!taskId) {
    return 0;
  }
  return images.slice(0, imageIndex + 1).filter((image) => (image.taskId || image.id) === taskId).length - 1;
}

const STORED_IMAGE_FIELDS: Array<keyof StoredImage> = [
  "id",
  "taskId",
  "status",
  "path",
  "visibility",
  "b64_json",
  "url",
  "width",
  "height",
  "resolution",
  "outputFormat",
  "revised_prompt",
  "error",
  "text_response",
];

export function updateStoredImage(image: StoredImage, updates: Partial<StoredImage>): StoredImage {
  const next = { ...image, ...updates };
  return STORED_IMAGE_FIELDS.every((field) => image[field] === next[field]) ? image : next;
}

export function taskDataToStoredImage(image: StoredImage, task: CreationTask, turnMode: ImageConversationMode, dataIndex = 0, fallbackVisibility?: ImageVisibility): StoredImage {
  const taskVisibility = task.visibility || fallbackVisibility || image.visibility || "private";
  const successUpdates = (item: CreationTaskDataItem) => {
    const width = positiveDimension(item.width);
    const height = positiveDimension(item.height);
    return {
      taskId: task.id,
      status: "success" as const,
      b64_json: item.b64_json,
      url: item.url,
      path: item.url ? getManagedImagePathFromUrl(item.url) || image.path : image.path,
      visibility: taskVisibility,
      width,
      height,
      resolution: item.resolution || (width && height ? `${width}x${height}` : image.resolution),
      outputFormat: item.output_format || task.output_format || image.outputFormat,
      revised_prompt: item.revised_prompt,
      text_response: undefined,
      error: undefined,
    };
  };
  if (task.status === "success") {
    if (task.output_type === "text") {
      const fallbackText = task.data?.[dataIndex]?.text_response || task.error || "生成图片失败";
      if (turnMode !== "chat") {
        return updateStoredImage(image, {
          taskId: task.id,
          status: "error",
          text_response: undefined,
          error: formatCreationTaskErrorMessage(fallbackText),
        });
      }
      return updateStoredImage(image, {
        taskId: task.id,
        status: "message",
        text_response: fallbackText,
        b64_json: undefined,
        url: undefined,
        path: undefined,
        visibility: undefined,
        revised_prompt: undefined,
        error: undefined,
      });
    }
    const item = task.data?.[dataIndex];
    if (!item?.b64_json && !item?.url) {
      if (dataIndex > 0 && image.taskId !== image.id) {
        return updateStoredImage(image, { taskId: image.id, status: "loading", error: undefined });
      }
      return updateStoredImage(image, { taskId: task.id, status: "error", error: `未返回第 ${dataIndex + 1} 张图片数据` });
    }
    return updateStoredImage(image, successUpdates(item));
  }

  if (task.status === "error") {
    if (task.output_type === "text") {
      if (turnMode !== "chat") {
        return updateStoredImage(image, { taskId: task.id, status: "error", text_response: undefined, error: formatCreationTaskErrorMessage(task.error || "生成失败") });
      }
      return updateStoredImage(image, { taskId: task.id, status: "message", text_response: task.error || "", b64_json: undefined, url: undefined, path: undefined, visibility: undefined, revised_prompt: undefined, error: undefined });
    }
    const item = task.data?.[dataIndex];
    if (item?.b64_json || item?.url) {
      return updateStoredImage(image, successUpdates(item));
    }
    return updateStoredImage(image, { taskId: task.id, status: "error", text_response: undefined, error: formatCreationTaskErrorMessage(task.error || "生成失败") });
  }

  if (task.status === "cancelled") {
    const item = task.data?.[dataIndex];
    if (item?.b64_json || item?.url) {
      return updateStoredImage(image, successUpdates(item));
    }
    return updateStoredImage(image, { taskId: task.id, status: "cancelled", error: task.error || "任务已终止" });
  }

  return updateStoredImage(image, { taskId: task.id, status: "loading", text_response: undefined, error: undefined });
}

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
