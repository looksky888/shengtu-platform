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
export type ImageDownloadOptions = {
  getToken?: () => Promise<string> | string;
  apiUrl?: string;
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

function readRuntimeApiUrl(overrideApiUrl?: string): string {
  if (overrideApiUrl !== undefined) {
    return overrideApiUrl.trim().replace(/\/+$/, "");
  }
  const metaEnv = (import.meta as { env?: { VITE_API_URL?: string; DEV?: boolean } }).env;
  if (metaEnv) {
    return String(metaEnv.VITE_API_URL || (metaEnv.DEV ? "http://127.0.0.1:8000" : ""))
      .trim()
      .replace(/\/+$/, "");
  }
  return "";
}

function isRelativeUrl(value: string): boolean {
  return !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value) && !value.startsWith("//");
}

function resolveTrustedOrigins(baseHref: string, configuredApiUrl?: string) {
  const base = new URL(baseHref);
  const apiBase = readRuntimeApiUrl(configuredApiUrl);
  let apiOrigin = base.origin;
  let apiBaseUrl: URL | null = null;
  if (apiBase) {
    try {
      apiBaseUrl = new URL(apiBase, base);
      apiOrigin = apiBaseUrl.origin;
    } catch {
      apiBaseUrl = null;
    }
  }
  return { base, apiBase, apiOrigin, apiBaseUrl };
}

function resolveManagedImageUrl(
  src: string,
  baseHref: string,
  configuredApiUrl?: string,
): URL | null {
  if (!src || /^(data|blob):/i.test(src)) {
    return null;
  }
  try {
    const { base, apiOrigin, apiBaseUrl } = resolveTrustedOrigins(baseHref, configuredApiUrl);
    if (isRelativeUrl(src)) {
      const normalizedPath = src.startsWith("/") ? src : `/${src}`;
      const probe = new URL(normalizedPath, base);
      if (!probe.pathname.startsWith("/images/")) {
        return null;
      }
      if (apiBaseUrl) {
        const basePath = apiBaseUrl.pathname.replace(/\/+$/, "");
        return new URL(`${apiBaseUrl.origin}${basePath}${probe.pathname}${probe.search}${probe.hash}`);
      }
      return probe;
    }

    const parsed = new URL(src, base);
    const isTrustedOrigin = parsed.origin === base.origin || parsed.origin === apiOrigin;
    if (!isTrustedOrigin || !parsed.pathname.startsWith("/images/")) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function buildImageDownloadHref(src: string, baseHref: string, configuredApiUrl?: string) {
  if (!src) return "";
  const managed = resolveManagedImageUrl(src, baseHref, configuredApiUrl);
  if (!managed) {
    return src;
  }
  managed.searchParams.set("download", "1");
  return managed.toString();
}

export function buildImageDownloadFetchHref(src: string, baseHref: string, configuredApiUrl?: string) {
  if (!src) return "";
  const managed = resolveManagedImageUrl(src, baseHref, configuredApiUrl);
  if (!managed) {
    return src;
  }
  managed.searchParams.set("download", "1");
  managed.searchParams.set("proxy", "1");
  return managed.toString();
}

function extensionFromDataUrl(src: string): string | null {
  const trimmed = src.trim();
  if (!/^data:/i.test(trimmed)) {
    return null;
  }
  if (/^data:image\/gif(?:[;,]|$)/i.test(trimmed)) return "gif";
  if (/^data:image\/webp(?:[;,]|$)/i.test(trimmed)) return "webp";
  if (/^data:image\/jpe?g(?:[;,]|$)/i.test(trimmed)) return "jpg";
  if (/^data:image\/png(?:[;,]|$)/i.test(trimmed)) return "png";
  return "png";
}

export function imageDownloadFileName(src: string, fallbackId: string) {
  const safeId = fallbackId.trim().replace(/[^a-z0-9_-]+/gi, "-") || "download";
  const dataUrlExt = extensionFromDataUrl(src);
  if (dataUrlExt) {
    return `image-${safeId}.${dataUrlExt}`;
  }
  try {
    const sourceName = decodeURIComponent(new URL(src, "https://download.invalid").pathname.split("/").pop() || "");
    if (/\.[a-z0-9]{1,5}$/i.test(sourceName)) {
      return sourceName;
    }
  } catch {
    // Use the deterministic fallback below.
  }
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

/** Fetch through the application/API origin (or save `data:` inline), then save a local Blob URL. */
export async function downloadImageSrc(
  src: string,
  fileName: string,
  options?: ImageDownloadOptions,
) {
  if (!src) {
    throw new Error("图片地址为空");
  }
  if (/^data:/i.test(src.trim())) {
    triggerImageDownload(src, fileName);
    return;
  }
  await downloadImageBlob(src, fileName, options);
}

/** Fetch through the application origin, then save a local Blob URL. */
export async function downloadImageBlob(
  src: string,
  fileName: string,
  options?: ImageDownloadOptions,
) {
  const blob = await fetchImageDownloadBlob(src, options);
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
  options?: ImageDownloadOptions,
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
        const blob = await fetchImageDownloadBlob(item.src, options);
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
      await downloadImageBlob(item.src, item.fileName, options);
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

async function resolveDownloadSessionToken(getToken?: () => Promise<string> | string): Promise<string> {
  if (getToken) {
    return String((await getToken()) || "").trim();
  }
  try {
    const authModule = await import("@/store/auth");
    return String((await authModule.getStoredSessionToken()) || "").trim();
  } catch {
    if (typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage?.getItem("chatgpt2api_auth_session") || "";
        if (raw) {
          const parsed = JSON.parse(raw) as { token?: unknown };
          if (typeof parsed.token === "string") {
            return parsed.token.trim();
          }
        }
      } catch {
        // Ignore storage read errors in minimal test environments.
      }
    }
    return "";
  }
}

export async function fetchImageDownloadBlob(src: string, options?: ImageDownloadOptions) {
  if (!src) {
    throw new Error("图片地址为空");
  }
  if (/^(data|blob):/i.test(src)) {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`图片下载失败（HTTP ${response.status}）`);
    }
    return response.blob();
  }

  const baseHref = typeof window !== "undefined" && window.location?.href
    ? window.location.href
    : "http://localhost";
  const managedTarget = resolveManagedImageUrl(src, baseHref, options?.apiUrl);
  const href = buildImageDownloadFetchHref(src, baseHref, options?.apiUrl);

  let response: Response;
  if (managedTarget) {
    const headers = new Headers();
    const token = await resolveDownloadSessionToken(options?.getToken);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    response = await fetch(href, {
      credentials: "include",
      headers,
    });
  } else {
    response = await fetch(href, {
      credentials: "omit",
    });
  }

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
