import { getStoredImageSrc } from "@/app/image/components/image-results-utils";
import { formatDateTime } from "@/lib/datetime";
import { fetchAuthorizedImageBlob } from "@/lib/media-fetch";
import { createRequestId } from "@/lib/request-id";
import type { ImageOutputFormat } from "@/lib/api";
import type { StoredImage, StoredReferenceImage } from "@/store/image-conversations";

export { buildConversationTitle } from "@/app/image/lib/image-conversation-mutations";

export function formatConversationTime(value: string) {
  const text = formatDateTime(value, { compact: true });
  return text === "—" ? "" : text;
}

export function createId() {
  return createRequestId("image");
}

export function mimeTypeFromOutputFormat(format?: ImageOutputFormat | string): string {
  const normalized = String(format || "").trim().toLowerCase();
  switch (normalized) {
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "jpeg":
    case "jpg":
      return "image/jpeg";
    case "png":
    default:
      return "image/png";
  }
}

export function extensionFromOutputFormatOrUrl(
  outputFormat?: ImageOutputFormat | string,
  urlOrSrc?: string,
): "gif" | "webp" | "jpg" | "png" {
  const normalizedFormat = String(outputFormat || "").trim().toLowerCase();
  if (normalizedFormat === "gif") return "gif";
  if (normalizedFormat === "webp") return "webp";
  if (normalizedFormat === "jpeg" || normalizedFormat === "jpg") return "jpg";
  if (normalizedFormat === "png") return "png";

  const src = String(urlOrSrc || "").trim();
  if (/^data:image\/gif(?:[;,]|$)/i.test(src) || /\.gif(?:$|[?#])/i.test(src)) return "gif";
  if (/^data:image\/webp(?:[;,]|$)/i.test(src) || /\.webp(?:$|[?#])/i.test(src)) return "webp";
  if (/^data:image\/jpe?g(?:[;,]|$)/i.test(src) || /\.jpe?g(?:$|[?#])/i.test(src)) return "jpg";
  return "png";
}

export function extensionFromMimeType(mimeType?: string): "gif" | "webp" | "jpg" | "png" {
  const normalized = String(mimeType || "").trim().toLowerCase();
  if (normalized.includes("image/gif")) return "gif";
  if (normalized.includes("image/webp")) return "webp";
  if (normalized.includes("image/jpeg") || normalized.includes("image/jpg")) return "jpg";
  return "png";
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取参考图失败"));
    reader.readAsDataURL(file);
  });
}

export function dataUrlToFile(dataUrl: string, fileName: string, mimeType?: string) {
  const [header, content] = dataUrl.split(",", 2);
  const matchedMimeType = header.match(/data:(.*?);base64/)?.[1];
  const binary = atob(content || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: mimeType || matchedMimeType || "image/png" });
}

export function buildReferenceImageFromResult(image: StoredImage, fileName: string): StoredReferenceImage | null {
  if (!image.b64_json) {
    return null;
  }

  const mimeType = mimeTypeFromOutputFormat(image.outputFormat);
  return {
    name: fileName,
    type: mimeType,
    dataUrl: `data:${mimeType};base64,${image.b64_json}`,
  };
}

export async function fetchImageAsFile(url: string, fileName: string, signal?: AbortSignal) {
  const response = await fetchAuthorizedImageBlob(url, signal);
  if (!response.ok) {
    throw new Error("读取结果图失败");
  }
  const blob = await response.blob();
  const fallbackMime = mimeTypeFromOutputFormat(extensionFromOutputFormatOrUrl(undefined, fileName || url));
  return new File([blob], fileName, { type: blob.type || fallbackMime });
}

function buildReferenceFileName(url: string, index: number, fallbackPrefix: string) {
  const path = url.split(/[?#]/, 1)[0] || "";
  const rawName = path.split("/").filter(Boolean).pop() || "";
  let name = rawName;
  try {
    name = rawName ? decodeURIComponent(rawName) : "";
  } catch {
    name = rawName;
  }
  const ext = extensionFromOutputFormatOrUrl(undefined, url);
  if (name) {
    return name.includes(".") ? name : `${name}.${ext}`;
  }
  return `${fallbackPrefix}-${index + 1}.${ext}`;
}

export async function buildReferenceImageFromUrl(
  url: string,
  index: number,
  fallbackPrefix: string,
  signal?: AbortSignal,
): Promise<StoredReferenceImage> {
  const file = await fetchImageAsFile(url, buildReferenceFileName(url, index, fallbackPrefix), signal);
  return {
    name: file.name,
    type: file.type || "image/png",
    dataUrl: await readFileAsDataUrl(file),
    source: "upload",
  };
}

export async function buildReferenceImageFromStoredImage(
  image: StoredImage,
  fileName: string,
  signal?: AbortSignal,
) {
  const direct = buildReferenceImageFromResult(image, fileName);
  if (direct) {
    return {
      referenceImage: direct,
      file: dataUrlToFile(direct.dataUrl, direct.name, direct.type),
    };
  }

  const src = getStoredImageSrc(image);
  if (!src) {
    return null;
  }
  const file = await fetchImageAsFile(src, fileName, signal);
  return {
    referenceImage: {
      name: file.name,
      type: file.type || mimeTypeFromOutputFormat(image.outputFormat),
      dataUrl: await readFileAsDataUrl(file),
    },
    file,
  };
}
