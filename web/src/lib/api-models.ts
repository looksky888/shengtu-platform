/**
 * Studio model catalog.
 * GPT chat ids follow gptGrok2api FALLBACK_CHAT_MODELS (canonical dash form only:
 * use `gpt-5-5`, not both `gpt-5.5` and `gpt-5-5` — that was showing as duplicates).
 */
export const IMAGE_MODEL_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "gpt-image-2.5-flare", label: "GPT Images 2.5 Flare" },
  { value: "gpt-image-2.5", label: "GPT Images 2.5" },
  { value: "gpt-image-2", label: "GPT Images 2" },
  { value: "gpt-image-2.5-sunburst", label: "GPT Images 2.5 Sunburst" },
  { value: "grok-imagine-image", label: "grok-imagine-image" },
  { value: "grok-imagine-image-lite", label: "grok-imagine-image-lite" },
  { value: "grok-imagine-image-pro", label: "grok-imagine-image-pro" },
  { value: "grok-imagine-image-edit", label: "grok-imagine-image-edit" },
  { value: "grok-imagine-video", label: "grok-imagine-video（视频创作）" },
  { value: "grok-imagine-video-1.5", label: "grok-imagine-video-1.5（Console 多参考图）" },
  // Grok text chat (SSO pool + optional OAuth 4.5)
  { value: "grok-4.5", label: "grok-4.5（需要 xAI CLI OAuth）" },
  { value: "grok-4.20-fast", label: "grok-4.20-fast（推荐·注册号池）" },
  { value: "grok-4.20-auto", label: "grok-4.20-auto" },
  { value: "grok-4.20-expert", label: "grok-4.20-expert" },
  { value: "grok-4.20-0309-super", label: "grok-4.20-0309-super" },
  // GPT chat — FALLBACK_CHAT_MODELS + 4.x pool aliases (no duplicate aliases)
  { value: "gpt-4.5", label: "gpt-4.5（ChatGPT 号池）" },
  { value: "gpt-4o", label: "gpt-4o" },
  { value: "gpt-5", label: "gpt-5" },
  { value: "gpt-5-1", label: "gpt-5-1" },
  { value: "gpt-5-2", label: "gpt-5-2" },
  { value: "gpt-5-3", label: "gpt-5-3" },
  { value: "gpt-5-3-mini", label: "gpt-5-3-mini" },
  { value: "gpt-5-5", label: "gpt-5-5" },
  { value: "gpt-5-6", label: "gpt-5-6" },
  { value: "gpt-5-6-sol", label: "gpt-5-6-sol" },
  { value: "gpt-5-6-terra", label: "gpt-5-6-terra" },
  { value: "gpt-5-6-luna", label: "gpt-5-6-luna" },
  { value: "gpt-5-mini", label: "gpt-5-mini" },
] as const;
export type ImageModel = string;
export const DEFAULT_IMAGE_MODEL: ImageModel = "gpt-image-2.5-flare";
export const DEFAULT_CHAT_MODEL: ImageModel = "auto";
export const GROK_IMAGE_MODEL: ImageModel = "grok-imagine-image";
export const GROK_VIDEO_MODEL: ImageModel = "grok-imagine-video";

/**
 * 创作台是否展示 Grok 生图模型。
 * - true：创作台模型列表展示 grok-imagine-*（3.5 默认开启，走号池+runtime）
 * - false：界面隐藏；历史会话若选过 Grok 会回退到默认 GPT 模型
 */
export const ENABLE_GROK_IMAGE_MODELS_IN_STUDIO = true;

const IMAGE_MODEL_VALUES = new Set<string>(IMAGE_MODEL_OPTIONS.map((option) => option.value));
const IMAGE_TASK_MODEL_VALUES = new Set<ImageModel>([
  "auto",
  "gpt-image-2",
  "gpt-image-2.5-flare",
  "gpt-image-2.5",
  "gpt-image-2.5-sunburst",
  "grok-imagine-image",
  "grok-imagine-image-lite",
  "grok-imagine-image-pro",
  "grok-imagine-image-edit",
]);
const RESPONSE_IMAGE_TOOL_MODEL_VALUES = new Set<ImageModel>([
  "auto",
  "gpt-image-2",
  "gpt-image-2.5-flare",
  "gpt-image-2.5",
  "gpt-image-2.5-sunburst",
  "gpt-5-mini",
  "gpt-5-3-mini",
  "gpt-5",
  "gpt-5-1",
  "gpt-5-2",
  "gpt-5-3",
  "gpt-5-5",
]);
const CHAT_MODEL_VALUES = new Set<ImageModel>([
  "auto",
  "grok-4.5",
  "grok-4.20-fast",
  "grok-4.20-auto",
  "grok-4.20-expert",
  "grok-4.20-0309-super",
  "gpt-4.5",
  "gpt-4o",
  "gpt-5",
  "gpt-5-1",
  "gpt-5-2",
  "gpt-5-3",
  "gpt-5-3-mini",
  "gpt-5-5",
  "gpt-5-6",
  "gpt-5-6-sol",
  "gpt-5-6-terra",
  "gpt-5-6-luna",
  "gpt-5-mini",
]);

/** Map historical / alias model ids to the single catalog entry shown in UI. */
export function normalizeChatModelId(model: string): string {
  const m = model.trim().toLowerCase();
  if (m === "gpt-5.5" || m === "gpt-5_5") return "gpt-5-5";
  if (m === "gpt-5.4" || m === "gpt-5_4") return "gpt-5-3"; // drop orphaned alias
  return model.trim();
}
/**
 * 创作台作画模式可选模型：
 * - 四个 GPT Images Web 兼容模型都保留为独立选项，便于按账号/上游能力切换
 * - grok-imagine-image（唯一 Grok 生图入口；lite/pro 不进菜单，edit 由参考图路径自动映射）
 */
const IMAGE_CREATION_VISIBLE_MODEL_VALUES = new Set<ImageModel>([
  "gpt-image-2",
  "gpt-image-2.5",
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
  "grok-imagine-image",
]);
const VIDEO_CREATION_VISIBLE_MODEL_VALUES = new Set<ImageModel>([GROK_VIDEO_MODEL, "grok-imagine-video-1.5"]);
export const IMAGE_TASK_MODEL_OPTIONS = IMAGE_MODEL_OPTIONS.filter((option) => IMAGE_TASK_MODEL_VALUES.has(option.value));
export const RESPONSE_IMAGE_TOOL_MODEL_OPTIONS = IMAGE_MODEL_OPTIONS.filter((option) => RESPONSE_IMAGE_TOOL_MODEL_VALUES.has(option.value));
export const IMAGE_CREATION_MODEL_OPTIONS = IMAGE_MODEL_OPTIONS.filter((option) => {
  if (!IMAGE_CREATION_VISIBLE_MODEL_VALUES.has(option.value)) {
    return false;
  }
  if (!ENABLE_GROK_IMAGE_MODELS_IN_STUDIO && isGrokImageModel(option.value)) {
    return false;
  }
  return true;
});
export const VIDEO_CREATION_MODEL_OPTIONS = IMAGE_MODEL_OPTIONS.filter((option) =>
  VIDEO_CREATION_VISIBLE_MODEL_VALUES.has(option.value),
);
export const CHAT_MODEL_OPTIONS = IMAGE_MODEL_OPTIONS.filter((option) => CHAT_MODEL_VALUES.has(option.value));

export function isGrokModel(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const model = value.trim().toLowerCase();
  return model.startsWith("grok-") || model.startsWith("grok_");
}

/** Imagine / image / video only — not text chat models like grok-4.20-fast. */
export function isGrokImageModel(value: unknown): boolean {
  if (!isGrokModel(value)) return false;
  const model = String(value).trim().toLowerCase();
  return model.includes("imagine") || model.includes("image") || model.includes("video");
}

export function isGrokChatModel(value: unknown): boolean {
  return isGrokModel(value) && !isGrokImageModel(value);
}

export function isGPTImageModel(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "gpt-image-2" || normalized === "gpt-image-2.5" || normalized === "gpt-image-2.5-flare" || normalized === "gpt-image-2.5-sunburst";
}

/** Canonical Grok studio image model (only one shown in 创作台). */
export function normalizeGrokStudioImageModel(model: string): string {
  if (!isGrokImageModel(model)) return model;
  // Keep edit model when caller already picked it (edit flow).
  if (model.trim().toLowerCase().includes("edit")) return "grok-imagine-image-edit";
  return GROK_IMAGE_MODEL;
}

export function isImageModel(value: unknown): value is ImageModel {
  if (typeof value !== "string") return false;
  if (isGrokImageModel(value)) return true;
  return IMAGE_MODEL_VALUES.has(value);
}

export function isImageTaskModel(value: unknown): value is ImageModel {
  return isImageModel(value) && (IMAGE_TASK_MODEL_VALUES.has(value) || isGrokImageModel(value));
}

export function isResponseImageToolModel(value: unknown): value is ImageModel {
  if (isGrokImageModel(value)) return false;
  return isImageModel(value) && RESPONSE_IMAGE_TOOL_MODEL_VALUES.has(value);
}

/** Models selectable in 创作台 image mode (four GPT image models plus one Grok image model). */
export function isImageCreationModel(value: unknown): value is ImageModel {
  if (typeof value !== "string") {
    return false;
  }
  const model = value.trim().toLowerCase();
  if (!model) return false;
  // Grok: only the single studio gen model counts as a creation menu option.
  // lite/pro/edit must NOT pass this filter (otherwise use-public-model-channel merges them in).
  if (isGrokImageModel(model)) {
    if (!ENABLE_GROK_IMAGE_MODELS_IN_STUDIO) return false;
    return model === GROK_IMAGE_MODEL;
  }
  return IMAGE_CREATION_VISIBLE_MODEL_VALUES.has(model);
}

/**
 * Normalize and filter ids returned by the dynamic catalog before they reach
 * the image creation selector. Catalog responses may include edit/video
 * variants, text models, duplicates, or inconsistent casing.
 */
export function filterStudioImageModelIds(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const model = normalizeChatModelId(String(value ?? "").trim().toLowerCase());
    if (!model || !isImageCreationModel(model) || seen.has(model)) {
      continue;
    }
    seen.add(model);
    result.push(model);
  }
  return result;
}

/** Video models shown in the studio model menu and handled by the dedicated video workspace. */
export function isVideoCreationModel(value: unknown): value is ImageModel {
  return typeof value === "string" && VIDEO_CREATION_VISIBLE_MODEL_VALUES.has(value.trim().toLowerCase());
}

export function isChatModel(value: unknown): value is ImageModel {
  if (typeof value !== "string") return false;
  const model = normalizeChatModelId(value);
  if (!model) return false;
  if (isGrokChatModel(model)) return true;
  return CHAT_MODEL_VALUES.has(model) || (isImageModel(model) && CHAT_MODEL_VALUES.has(model));
}

export function supportsImageQuality(model: ImageModel) {
  // Grok quality is optional/upstream-dependent; keep UI quality for GPT only for clarity.
  return !isGrokImageModel(model);
}

export type ImageQuality = "low" | "medium" | "high";
export type ImageOutputFormat = "png" | "jpeg" | "webp";
export type ImageVisibility = "private" | "public";

const IMAGE_QUALITY_VALUES = new Set<string>(["low", "medium", "high"]);
const IMAGE_OUTPUT_FORMAT_VALUES = new Set<string>(["png", "jpeg", "webp"]);

export const IMAGE_OUTPUT_FORMAT_OPTIONS = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "webp", label: "WebP" },
] as const satisfies ReadonlyArray<{ value: ImageOutputFormat; label: string }>;

export function isImageQuality(value: unknown): value is ImageQuality {
  return typeof value === "string" && IMAGE_QUALITY_VALUES.has(value);
}

export function isImageOutputFormat(value: unknown): value is ImageOutputFormat {
  return typeof value === "string" && IMAGE_OUTPUT_FORMAT_VALUES.has(value);
}
