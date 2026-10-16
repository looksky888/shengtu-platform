import {
  CUSTOM_IMAGE_ASPECT_RATIO,
  DEFAULT_IMAGE_CUSTOM_HEIGHT,
  DEFAULT_IMAGE_CUSTOM_RATIO,
  DEFAULT_IMAGE_CUSTOM_WIDTH,
  IMAGE_ASPECT_RATIO_OPTIONS,
  IMAGE_RESOLUTION_OPTIONS,
  IMAGE_SIZE_MODE_OPTIONS,
  type ImageAspectRatio,
  type ImageResolution,
  type ImageSizeMode,
  type ImageSizeSelection,
} from "@/app/image/image-option-values";
import {
  AUTO_RATIO_SHORT_SIDE,
  RATIO_PATTERN,
  SIZE_MULTIPLE,
  SIZE_PATTERN,
  normalizeDimensions,
  roundToMultiple,
} from "@/app/image/image-size-geometry";

export * from "@/app/image/image-option-values";

const IMAGE_ASPECT_RATIO_VALUES = new Set<string>(IMAGE_ASPECT_RATIO_OPTIONS.map((option) => option.value));
const IMAGE_SIZE_MODE_VALUES = new Set<string>(IMAGE_SIZE_MODE_OPTIONS.map((option) => option.value));
const IMAGE_RESOLUTION_VALUES = new Set<string>(IMAGE_RESOLUTION_OPTIONS.map((option) => option.value));
export function normalizeImageSize(size: string) {
  const trimmed = size.trim();
  const match = trimmed.match(SIZE_PATTERN);
  if (!match) {
    return trimmed;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "";
  }

  const normalized = normalizeDimensions(width, height);
  return `${normalized.width}x${normalized.height}`;
}

export function parseImageSizeDimensions(size: string) {
  const match = normalizeImageSize(size).match(SIZE_PATTERN);
  if (!match) {
    return null;
  }
  return { width: match[1], height: match[2] };
}

export function parseImageRatio(ratio: string) {
  const match = ratio.match(RATIO_PATTERN);
  if (!match) {
    return null;
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export function getActiveImageAspectRatio({
  aspectRatio,
  customRatio,
}: Pick<ImageSizeSelection, "aspectRatio" | "customRatio">) {
  if (aspectRatio === CUSTOM_IMAGE_ASPECT_RATIO) {
    return parseImageRatio(customRatio) ? customRatio.trim() : "";
  }
  return aspectRatio;
}

export function calculateImageSize(resolution: Exclude<ImageResolution, "auto">, ratio: string) {
  const parsed = parseImageRatio(ratio);
  if (!parsed) {
    return "";
  }

  const { width: ratioWidth, height: ratioHeight } = parsed;
  if (ratioWidth === ratioHeight) {
    const side = resolution === "1k" ? 1024 : resolution === "1080p" ? 1080 : resolution === "2k" ? 2048 : 3840;
    return normalizeImageSize(`${side}x${side}`);
  }

  if (resolution === "1k" || resolution === "1080p") {
    const shortSide = resolution === "1k" ? 1024 : 1080;
    const width =
      ratioWidth > ratioHeight
        ? roundToMultiple((shortSide * ratioWidth) / ratioHeight, SIZE_MULTIPLE)
        : shortSide;
    const height =
      ratioWidth > ratioHeight
        ? shortSide
        : roundToMultiple((shortSide * ratioHeight) / ratioWidth, SIZE_MULTIPLE);
    return normalizeImageSize(`${width}x${height}`);
  }

  const longSide = resolution === "2k" ? 2048 : 3840;
  const width =
    ratioWidth > ratioHeight
      ? longSide
      : roundToMultiple((longSide * ratioWidth) / ratioHeight, SIZE_MULTIPLE);
  const height =
    ratioWidth > ratioHeight
      ? roundToMultiple((longSide * ratioHeight) / ratioWidth, SIZE_MULTIPLE)
      : longSide;
  return normalizeImageSize(`${width}x${height}`);
}

export function calculateAutoImageSize(ratio: string) {
  const parsed = parseImageRatio(ratio);
  if (!parsed) {
    return "";
  }

  const { width: ratioWidth, height: ratioHeight } = parsed;
  if (ratioWidth === ratioHeight) {
    return normalizeImageSize(`${AUTO_RATIO_SHORT_SIDE}x${AUTO_RATIO_SHORT_SIDE}`);
  }

  const width =
    ratioWidth > ratioHeight
      ? roundToMultiple((AUTO_RATIO_SHORT_SIDE * ratioWidth) / ratioHeight, SIZE_MULTIPLE)
      : AUTO_RATIO_SHORT_SIDE;
  const height =
    ratioWidth > ratioHeight
      ? AUTO_RATIO_SHORT_SIDE
      : roundToMultiple((AUTO_RATIO_SHORT_SIDE * ratioHeight) / ratioWidth, SIZE_MULTIPLE);
  return normalizeImageSize(`${width}x${height}`);
}

export function buildCustomImageSize(width: string, height: string) {
  const parsedWidth = Number.parseInt(width, 10);
  const parsedHeight = Number.parseInt(height, 10);
  if (!Number.isFinite(parsedWidth) || !Number.isFinite(parsedHeight) || parsedWidth <= 0 || parsedHeight <= 0) {
    return "";
  }
  return normalizeImageSize(`${parsedWidth}x${parsedHeight}`);
}

export function formatImageSizeDisplay(size: string) {
  return size.replace(/x/g, "×");
}

export function isImageAspectRatio(value: unknown): value is ImageAspectRatio {
  return typeof value === "string" && IMAGE_ASPECT_RATIO_VALUES.has(value);
}

export function isImageSizeMode(value: unknown): value is ImageSizeMode {
  return typeof value === "string" && IMAGE_SIZE_MODE_VALUES.has(value);
}

export function isImageResolution(value: unknown): value is ImageResolution {
  return typeof value === "string" && IMAGE_RESOLUTION_VALUES.has(value);
}

export function buildImageSize({
  mode,
  aspectRatio,
  resolution,
  customRatio,
  customWidth,
  customHeight,
}: ImageSizeSelection) {
  if (mode === "auto") {
    return "";
  }
  if (mode === "custom") {
    return buildCustomImageSize(customWidth, customHeight);
  }
  const activeAspectRatio = getActiveImageAspectRatio({ aspectRatio, customRatio });
  if (aspectRatio === CUSTOM_IMAGE_ASPECT_RATIO && !activeAspectRatio) {
    return "";
  }
  if (resolution === "auto") {
    if (!activeAspectRatio) {
      return "";
    }
    return calculateAutoImageSize(activeAspectRatio) || activeAspectRatio;
  }
  if (!activeAspectRatio) {
    return calculateImageSize(resolution, "1:1");
  }
  return calculateImageSize(resolution, activeAspectRatio) || activeAspectRatio;
}

export function getImageAspectRatioFromSize(size: string): ImageAspectRatio {
  const normalized = normalizeImageSize(size);
  if (isImageAspectRatio(normalized) && normalized !== CUSTOM_IMAGE_ASPECT_RATIO) {
    return normalized;
  }
  const isDimensionSize = SIZE_PATTERN.test(normalized);
  for (const aspectRatio of IMAGE_ASPECT_RATIO_OPTIONS.map((option) => option.value)) {
    if (!aspectRatio || aspectRatio === CUSTOM_IMAGE_ASPECT_RATIO) {
      continue;
    }
    if (calculateAutoImageSize(aspectRatio) === normalized) {
      return aspectRatio;
    }
    for (const resolution of IMAGE_RESOLUTION_OPTIONS.map((option) => option.value)) {
      if (resolution === "auto") {
        continue;
      }
      if (calculateImageSize(resolution, aspectRatio) === normalized) {
        return aspectRatio;
      }
    }
  }
  if (!isDimensionSize && parseImageRatio(normalized)) {
    return CUSTOM_IMAGE_ASPECT_RATIO;
  }
  return "";
}

export function getImageResolutionFromSize(size: string): ImageResolution {
  const normalized = normalizeImageSize(size);
  if (isImageResolution(normalized)) {
    return normalized;
  }
  for (const aspectRatio of IMAGE_ASPECT_RATIO_OPTIONS.map((option) => option.value)) {
    if (!aspectRatio || aspectRatio === CUSTOM_IMAGE_ASPECT_RATIO) {
      continue;
    }
    for (const resolution of IMAGE_RESOLUTION_OPTIONS.map((option) => option.value)) {
      if (resolution === "auto") {
        continue;
      }
      if (calculateImageSize(resolution, aspectRatio) === normalized) {
        return resolution;
      }
    }
  }
  return "auto";
}

export function getImageSizeSelectionFromSize(size: string): ImageSizeSelection {
  const normalized = normalizeImageSize(size);
  const customSize = parseImageSizeDimensions(normalized);
  const aspectRatio = getImageAspectRatioFromSize(normalized);
  const resolution = getImageResolutionFromSize(normalized);
  const customRatio = aspectRatio === CUSTOM_IMAGE_ASPECT_RATIO ? normalized : DEFAULT_IMAGE_CUSTOM_RATIO;
  const baseSelection = {
    aspectRatio,
    resolution,
    customRatio,
    customWidth: customSize?.width ?? DEFAULT_IMAGE_CUSTOM_WIDTH,
    customHeight: customSize?.height ?? DEFAULT_IMAGE_CUSTOM_HEIGHT,
  };

  if (!normalized || normalized === "auto") {
    return {
      mode: "auto",
      aspectRatio: "",
      resolution: "auto",
      customRatio: baseSelection.customRatio,
      customWidth: baseSelection.customWidth,
      customHeight: baseSelection.customHeight,
    };
  }
  if (customSize && !aspectRatio && resolution === "auto") {
    return {
      ...baseSelection,
      mode: "custom",
    };
  }
  return {
    ...baseSelection,
    mode: "ratio",
  };
}
