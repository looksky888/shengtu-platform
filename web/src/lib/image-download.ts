export const MAX_IMAGE_BATCH_DOWNLOAD_ITEMS = 100;
export const DIRECT_IMAGE_DOWNLOAD_DELAY_MS = 180;

export type ImageDownloadItem = { src: string; fileName: string };
export type ImageDownloadProgress = { completed: number; total: number; fileName: string };
export type ImageDownloadResult = {
  mode: "directory" | "browser";
  completed: number;
  total: number;
  failed: string[];
};

type WritableFile = {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
};

type DownloadFileHandle = { createWritable(): Promise<WritableFile> };
type DownloadDirectoryHandle = {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<DownloadFileHandle>;
};

type DirectoryPickerWindow = Window & typeof globalThis & {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<DownloadDirectoryHandle>;
};

export function buildImageDownloadHref(src: string, baseHref: string) {
  if (!src) return "";
  try {
    const base = new URL(baseHref);
    const url = new URL(src, base);
    if (url.origin === base.origin && url.pathname.startsWith("/images/")) {
      url.searchParams.set("download", "1");
      return url.toString();
    }
  } catch {
    return src;
  }
  return src;
}

export function imageDownloadFileName(src: string, fallbackId: string) {
  try {
    const sourceName = decodeURIComponent(new URL(src, "https://download.invalid").pathname.split("/").pop() || "");
    if (/\.[a-z0-9]{1,5}$/i.test(sourceName)) {
      return sourceName;
    }
  } catch {
    // Use the deterministic fallback below.
  }
  const safeId = fallbackId.trim().replace(/[^a-z0-9_-]+/gi, "-") || "download";
  return `image-${safeId}.png`;
}

export async function triggerImageDownloads(
  items: ImageDownloadItem[],
  delayMs = DIRECT_IMAGE_DOWNLOAD_DELAY_MS,
) {
  for (const [index, item] of items.entries()) {
    if (item.src) triggerImageDownload(item.src, item.fileName);
    if (index < items.length - 1 && delayMs > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
    }
  }
}

/** Fetch through the application origin, then save a local Blob URL. */
export async function downloadImageBlob(src: string, fileName: string) {
  const blob = await fetchImageDownloadBlob(src);
  downloadBlob(blob, fileName);
}

/**
 * Save an in-memory blob (export JSON / txt) through a temporary anchor.
 * The anchor must be attached for the click to be treated as a download, and the
 * object URL has to outlive the click before it is revoked.
 */
export function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  try {
    triggerImageDownload(objectUrl, fileName);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

export async function downloadImageFiles(
  items: ImageDownloadItem[],
  onProgress?: (progress: ImageDownloadProgress) => void,
): Promise<ImageDownloadResult> {
  const pending = makeUniqueDownloadNames(items.filter((item) => item.src));
  if (pending.length === 0) {
    throw new Error("没有可下载的图片");
  }
  const pickerWindow = window as DirectoryPickerWindow;
  if (pending.length > 1 && window.isSecureContext && pickerWindow.showDirectoryPicker) {
    // Invoke the picker before the first await that could consume user activation.
    const directory = await pickerWindow.showDirectoryPicker({ mode: "readwrite" });
    const failed: string[] = [];
    for (const [index, item] of pending.entries()) {
      try {
        const blob = await fetchImageDownloadBlob(item.src);
        await writeImageToDirectory(directory, item.fileName, blob);
      } catch {
        // Keep processing the rest of the batch: one unavailable object must
        // not prevent the remaining selected images from being saved.
        failed.push(item.fileName);
      }
      onProgress?.({ completed: index + 1, total: pending.length, fileName: item.fileName });
    }
    return { mode: "directory", completed: pending.length - failed.length, total: pending.length, failed };
  }

  const failed: string[] = [];
  for (const [index, item] of pending.entries()) {
    try {
      await downloadImageBlob(item.src, item.fileName);
    } catch {
      failed.push(item.fileName);
    }
    onProgress?.({ completed: index + 1, total: pending.length, fileName: item.fileName });
    if (index < pending.length - 1) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, DIRECT_IMAGE_DOWNLOAD_DELAY_MS));
    }
  }
  return { mode: "browser", completed: pending.length - failed.length, total: pending.length, failed };
}

export function isImageDownloadCanceled(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function fetchImageDownloadBlob(src: string) {
  if (!src) {
    throw new Error("图片地址为空");
  }
  const href = buildImageDownloadHref(src, window.location.href);
  const response = await fetch(href, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`图片下载失败（HTTP ${response.status}）`);
  }
  return response.blob();
}

async function writeImageToDirectory(directory: DownloadDirectoryHandle, requestedName: string, blob: Blob) {
  const fileName = sanitizeDownloadFileName(requestedName);
  const handle = await directory.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    if (writable.abort) {
      await writable.abort().catch(() => undefined);
    }
    throw error;
  }
}

function sanitizeDownloadFileName(value: string) {
  const normalized = value
    .trim()
    .replace(/[<>:"/\\|?*]/g, "-")
    .split("")
    .filter((character) => character.charCodeAt(0) >= 0x20)
    .join("")
    .replace(/[. ]+$/g, "");
  return normalized || "image.png";
}

function makeUniqueDownloadNames(items: ImageDownloadItem[]) {
  const used = new Set<string>();
  return items.map((item) => {
    const baseName = sanitizeDownloadFileName(item.fileName);
    const extensionIndex = baseName.lastIndexOf(".");
    const stem = extensionIndex > 0 ? baseName.slice(0, extensionIndex) : baseName;
    const extension = extensionIndex > 0 ? baseName.slice(extensionIndex) : "";
    let fileName = baseName;
    let suffix = 2;
    while (used.has(fileName.toLowerCase())) {
      fileName = `${stem}-${suffix}${extension}`;
      suffix += 1;
    }
    used.add(fileName.toLowerCase());
    return { ...item, fileName };
  });
}

export function triggerImageDownload(src: string, fileName: string) {
  const link = document.createElement("a");
  link.href = buildImageDownloadHref(src, window.location.href);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
