import { CUSTOM_IMAGE_ASPECT_RATIO, parseImageRatio, type ImageAspectRatio, type ImageResolution, type ImageSizeMode } from "@/app/image/image-options";
import { isGrokImageModel, supportsImageQuality, type ImageModel, type ImageOutputFormat, type ImageQuality } from "@/lib/api";
import type { ImageConversationMode, ImageTurn, StoredReferenceImage } from "@/store/image-conversations";

import { usesResponseImageTaskModel } from "./creation-task-route";
import { DEFAULT_IMAGE_CREDIT_COSTS, MISSING_RECOVERABLE_TASK_ID_ERROR, type ComposerMode, type ImageCreditCosts } from "./image-page-types";

export { usesResponseImageTaskModel, resolveCreationTaskRoute } from "./creation-task-route";
export type { CreationTaskRouteKind } from "./creation-task-route";

export function normalizeRequestedImageCount(value: string | number) {
  return Math.max(1, Math.min(10, Number(value) || 1));
}

export function estimatedCreditsPerImage(resolution: ImageResolution, costs: ImageCreditCosts = DEFAULT_IMAGE_CREDIT_COSTS) {
  switch (resolution) {
    case "2k":
      return costs["2k"];
    case "4k":
      return costs["4k"];
    case "auto":
    case "1k":
    case "1080p":
    default:
      return costs["1080p"];
  }
}

/**
 * Map studio size presets to Grok pixel sizes for credit preview.
 * Grok generation goes through grok-runtime / 号池 (not external relay).
 */
export function mapGrokImageSize(size: string): string {
  const raw = String(size || "").trim();
  if (!raw || raw.toLowerCase() === "auto") return "1024x1024";
  const lower = raw.toLowerCase();
  switch (lower) {
    case "1:1":
    case "1k":
    case "1080p":
    case "2k":
      return "1024x1024";
    case "16:9":
    case "21:9":
      return "1792x1024";
    case "9:16":
      return "1024x1792";
    case "3:2":
    case "4:3":
      return "1536x1024";
    case "2:3":
    case "3:4":
      return "1024x1536";
    case "4k":
      return "1792x1792";
    default:
      break;
  }
  const match = lower.replace("×", "x").match(/^(\d+)\s*x\s*(\d+)$/);
  if (match) {
    let w = Number(match[1]);
    let h = Number(match[2]);
    const maxSide = 1792;
    const minSide = 512;
    w = Math.max(minSide, w);
    h = Math.max(minSide, h);
    if (w > maxSide || h > maxSide) {
      const scale = Math.min(maxSide / w, maxSide / h);
      w = Math.max(minSide, Math.round(w * scale));
      h = Math.max(minSide, Math.round(h * scale));
    }
    return `${w}x${h}`;
  }
  return "1024x1024";
}

/** Legacy size-based estimator retained for non-resolution callers. */
export function estimatedCreditsForGrokSize(size: string, costs: ImageCreditCosts = DEFAULT_IMAGE_CREDIT_COSTS) {
  const mapped = mapGrokImageSize(size);
  const match = mapped.match(/^(\d+)x(\d+)$/i);
  if (!match) return costs["1080p"];
  const pixels = Number(match[1]) * Number(match[2]);
  if (pixels >= 7_000_000) return costs["4k"];
  if (pixels >= 3_000_000) return costs["2k"];
  return costs["1080p"];
}

export function estimatedCreditsPerImageForModel(
  model: string,
  resolution: ImageResolution,
  size: string,
  costs: ImageCreditCosts = DEFAULT_IMAGE_CREDIT_COSTS,
) {
  if (isGrokImageModel(model)) {
    return resolution === "2k" ? costs.grok2k : costs.grok1k;
  }
  return estimatedCreditsPerImage(resolution, costs);
}

export function isInvalidCustomRatioSelection(sizeMode: ImageSizeMode, aspectRatio: ImageAspectRatio, customRatio: string) {
  return sizeMode === "ratio" && aspectRatio === CUSTOM_IMAGE_ASPECT_RATIO && !parseImageRatio(customRatio);
}

export function normalizeOutputCompressionValue(value: unknown): number | undefined {
  if (value === undefined || value === null || String(value).trim() === "") {
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return undefined;
  }
  return Math.min(100, Math.round(numeric));
}

export function imageOutputCompressionForFormat(format: ImageOutputFormat, value: unknown) {
  if (format === "png") {
    return undefined;
  }
  return normalizeOutputCompressionValue(value);
}

export function buildTurnOutcomeMessage(successCount: number, failedCount: number, cancelledCount: number) {
  const parts = [`成功 ${successCount} 张`];
  if (failedCount > 0) {
    parts.push(`失败 ${failedCount} 张`);
  }
  if (cancelledCount > 0) {
    parts.push(`终止 ${cancelledCount} 张`);
  }
  return parts.join("，");
}

export function formatCreationTaskErrorMessage(message: string) {
  const trimmed = String(message || "").trim();
  if (!trimmed) {
    return "生成图片失败";
  }

  const normalized = trimmed.toLowerCase();
  const safetyRequestId = trimmed.match(/request id\s+([a-z0-9-]+)/i)?.[1];
  // OpenAI: "We're so sorry, but the prompt may violate our content policies..."
  // Note: "content policies" does not contain the substring "content policy".
  const isSafetySystemReject =
    normalized.includes("request was rejected by the safety system") ||
    normalized.includes("safety system") ||
    normalized.includes("content policies") ||
    normalized.includes("content policy") ||
    normalized.includes("policy violation") ||
    normalized.includes("prompt may violate") ||
    normalized.includes("we're so sorry") ||
    normalized.includes("we are so sorry") ||
    (normalized.includes("violate") && (normalized.includes("polic") || normalized.includes("content"))) ||
    (normalized.includes("refused") && normalized.includes("safety")) ||
    (normalized.includes("blocked") && (normalized.includes("safety") || normalized.includes("moderation")));
  if (isSafetySystemReject) {
    return [
      "提示词可能违反了内容安全政策，本次未能生成图片。",
      "请修改提示词后重试；若您认为误判，可调整表述或去掉敏感描述后再试。",
      "建议把人物、身体、姿态、暴力、未成年、名人/版权角色等敏感描述改成中性表达，或更换参考图后重试。",
      safetyRequestId ? `请求 ID：${safetyRequestId}` : "",
    ].filter(Boolean).join("\n");
  }
  if (
    normalized.includes("<tool_calls>") ||
    normalized.includes("<tool_call>") ||
    normalized.includes("image_generation_call") ||
    normalized.includes("<function_call") ||
    normalized.includes("tool output adapter")
  ) {
    return "图片生成流程返回了异常的工具调用文本，请重试；若持续出现，建议切换模型或降低分辨率后再试。";
  }

  if (normalized.includes("stream id 1") && normalized.includes("internal_error") && normalized.includes("received from peer")) {
    return "上游图片流连接被中途重置，请稍后重试；若持续出现，建议先切换模型或降低分辨率后再试。";
  }
  if (normalized.includes("an error occurred while processing your request")) {
    const requestId = trimmed.match(/request id\s+([a-z0-9-]+)/i)?.[1];
    return [
      "提示词内容过多，或当前分辨率/质量组合过高。",
      "建议减少提示词内容，或降低分辨率、质量后重试。",
      requestId ? `请求 ID：${requestId}` : "",
    ].filter(Boolean).join("\n");
  }
  if (normalized.includes("no images generated") && normalized.includes("model may have refused")) {
    return "没有生成图片，模型可能检测到敏感内容并拒绝了这次请求，请调整提示词后重试。";
  }
  if (normalized.includes("timed out waiting for async image generation")) {
    return "图片生成等待超时，建议稍后重试，或降低分辨率、质量后再试。";
  }
  if (
    normalized.includes("cloudflare") ||
    normalized.includes("人机验证") ||
    normalized.includes("clearance")
  ) {
    return "上游触发 Cloudflare 拦截，请检查代理 / WARP / FlareSolverr 配置后重试。";
  }
  if (normalized.includes("探测次数过多") || normalized.includes("probe_exhausted")) {
    return "号池连续探测多个账号均不可用（常见于 Cloudflare 或代理异常），请稍后重试。";
  }
  if (
    normalized.includes("usage limit") ||
    normalized.includes("usage_limit") ||
    normalized.includes("生图用量上限")
  ) {
    return "当前 Grok 账号已达到上游生图用量上限。系统会在本次请求内轮换号池；若全部触顶请继续注册 Grok 账号或稍后再试。";
  }
  if (
    normalized.includes("no available accounts for image generation") ||
    normalized.includes("no available accounts")
  ) {
    return "当前没有可用于生图的 Grok 账号（号池为空、未同步，或可轮换号均已触达上游上限）。请确认 Grok 号池有 active 账号且模型为 grok-imagine-image。";
  }
  if (
    normalized.includes("gpt 号池为空") ||
    normalized.includes("gpt 号池暂无可用") ||
    normalized.includes("没有匹配筛选条件的 gpt")
  ) {
    return "当前没有可用的 ChatGPT 图片账号。gpt-image 走 GPT 号池，刚注册的 Grok 不会进入该池；请切换到 grok-imagine-image，或先注册/导入 ChatGPT 账号。";
  }
  if (
    normalized.includes("no available image account slot") ||
    normalized.includes("account slot") ||
    normalized.includes("pool slot") ||
    normalized.includes("并发槽")
  ) {
    return "当前号池账号都在忙碌（并发槽已满），请稍后重试，或减少一次生成张数。";
  }
  if (normalized.includes("no available image quota") || normalized.includes("没有可用图片额度")) {
    return "当前没有可用的图片额度，请检查账号额度或稍后重试。";
  }

  return trimmed;
}

export function formatCreationTaskError(error: unknown, fallback = "生成图片失败") {
  return formatCreationTaskErrorMessage(error instanceof Error ? error.message : String(error || fallback));
}

export function deriveTurnStatus(turn: ImageTurn): Pick<ImageTurn, "status" | "error"> {
  const loadingCount = turn.images.filter((image) => image.status === "loading").length;
  const failedCount = turn.images.filter((image) => image.status === "error").length;
  const successCount = turn.images.filter((image) => image.status === "success").length;
  const cancelledCount = turn.images.filter((image) => image.status === "cancelled").length;
  const messageCount = turn.images.filter((image) => image.status === "message").length;
  if (loadingCount > 0) {
    return { status: turn.status === "queued" ? "queued" : "generating", error: undefined };
  }
  if (failedCount > 0) {
    return { status: "error", error: buildTurnOutcomeMessage(successCount, failedCount, cancelledCount) };
  }
  if (cancelledCount > 0) {
    return { status: "cancelled", error: buildTurnOutcomeMessage(successCount, failedCount, cancelledCount) };
  }
  if (successCount > 0) {
    return { status: "success", error: undefined };
  }
  if (messageCount > 0) {
    return { status: "message", error: undefined };
  }
  return { status: "queued", error: undefined };
}

export function usesReferenceImages(mode: ImageConversationMode) {
  return mode === "image" || mode === "edit";
}

export function isMissingBatchImageDataError(error?: string) {
  return typeof error === "string" && error.startsWith("未返回第 ") && error.endsWith(" 张图片数据");
}

export function isMissingRecoverableTaskIdError(error?: string) {
  return error === MISSING_RECOVERABLE_TASK_ID_ERROR;
}

export function getComposerConversationMode(composerMode: ComposerMode, referenceImages: StoredReferenceImage[]): ImageConversationMode {
  if (composerMode === "chat") {
    return "chat";
  }
  if (referenceImages.length === 0) {
    return "generate";
  }
  return referenceImages.some((image) => image.source === "conversation") ? "edit" : "image";
}

export function imageQualityForModel(model: ImageModel, quality: ImageQuality) {
  return supportsImageQuality(model) ? quality : undefined;
}
