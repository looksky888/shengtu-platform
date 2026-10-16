export const PROMPT_AREA_MIN_HEIGHT = 74;
export const PROMPT_AREA_DEFAULT_HEIGHT = 104;
export const PROMPT_AREA_MAX_HEIGHT = 320;
export const PROMPT_AREA_KEYBOARD_STEP = 16;

const IMAGE_FILE_EXTENSION_PATTERN = /\.(avif|bmp|gif|heic|heif|jpeg|jpg|png|svg|webp)$/i;

export function getPromptAreaMaxHeight() {
  if (typeof window === "undefined") {
    return PROMPT_AREA_MAX_HEIGHT;
  }
  return Math.max(PROMPT_AREA_MIN_HEIGHT, Math.min(PROMPT_AREA_MAX_HEIGHT, Math.floor(window.innerHeight * 0.42)));
}

export function clampPromptAreaHeight(height: number) {
  return Math.min(Math.max(height, PROMPT_AREA_MIN_HEIGHT), getPromptAreaMaxHeight());
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || IMAGE_FILE_EXTENSION_PATTERN.test(file.name);
}

export function getImageFiles(files: FileList | File[]) {
  return Array.from(files).filter(isImageFile);
}

export function hasDraggedFiles(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes("Files");
}

export function hasDraggedImage(dataTransfer: DataTransfer) {
  if (!hasDraggedFiles(dataTransfer)) {
    return false;
  }

  const items = Array.from(dataTransfer.items);
  if (items.length === 0) {
    return true;
  }

  return items.some((item) => item.kind === "file" && (item.type === "" || item.type.startsWith("image/")));
}
