import { formatImageFileSize } from "@/lib/image-size";
import { isTurnBusy } from "@/lib/image-turn-state";
import type { ImageTurn, ImageTurnStatus, StoredImage } from "@/store/image-conversations";
import type { DownloadableImage } from "@/app/image/components/image-results-types";
import { downloadImageBlob, downloadImageFiles, triggerImageDownload, type ImageDownloadResult } from "@/lib/image-download";

export function normalizeManagedImageUrl(url: string) {
  if (!url) return "";
  if (typeof window === "undefined") return url;
  try {
    const parsed = new URL(url, window.location.origin);
    const isManagedImage = parsed.pathname.startsWith("/images/") || parsed.pathname.startsWith("/image-thumbnails/");
    if (!isManagedImage) return url;

    const currentHostname = window.location.hostname.toLowerCase();
    const isLocalPreview = currentHostname === "localhost" || currentHostname === "127.0.0.1" || currentHostname === "::1";
    const isLegacyServerOrigin = parsed.hostname === "38.58.58.251" && parsed.port === "3004";
    const isConfiguredProductionOrigin = parsed.hostname === "www.shengtu.xyz" || parsed.hostname === "shengtu.xyz";

    if (isLocalPreview && parsed.origin !== window.location.origin) {
      return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    if ((isLegacyServerOrigin || isConfiguredProductionOrigin) && parsed.origin !== window.location.origin) {
      return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Keep the original value if it is not a valid URL.
  }
  return url;
}

export function getStoredImageSrc(image: StoredImage) {
  if (image.b64_json) {
    return `data:image/${image.outputFormat || "png"};base64,${image.b64_json}`;
  }
  if (image.url) {
    return normalizeManagedImageUrl(image.url);
  }
  if (image.path) {
    const encodedPath = image.path
      .split(/[\\/]+/)
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join("/");
    return encodedPath ? `/images/${encodedPath}` : "";
  }
  return "";
}

export function imageSelectionKey(conversationId: string, turnId: string, imageId: string) {
  return `${conversationId}:${turnId}:${imageId}`;
}

export function getImageFormatLabel(image: StoredImage, src: string) {
  const dataUrlFormat = src.match(/^data:image\/([^;,]+)/i)?.[1];
  const urlFormat = image.url ? image.url.split("?")[0]?.match(/\.([a-z0-9]+)$/i)?.[1] : "";
  const normalized = String(dataUrlFormat || urlFormat || (image.b64_json ? "png" : "png")).toLowerCase();
  const format = normalized === "jpeg" ? "jpg" : normalized;
  return `IMAGE ${format.toUpperCase()}`;
}

export function imageResolutionLabel(image: StoredImage, dimensions?: string) {
  if (image.resolution) return image.resolution.replace(/x/g, " x ");
  if (image.width && image.height) return formatImageDimensions(image.width, image.height);
  return dimensions || "";
}

export function getTurnResultSizeLabel(turn: ImageTurn, dimensionsByImageId: Record<string, string>) {
  const labels = Array.from(
    new Set(
      turn.images
        .filter((image) => image.status === "success")
        .map((image) => imageResolutionLabel(image, dimensionsByImageId[image.id]))
        .filter(Boolean),
    ),
  );
  if (labels.length === 1) return labels[0];
  if (labels.length > 1) return `${labels.length} 种尺寸`;
  return isTurnBusy(turn) && turn.size ? `请求 ${turn.size}` : "";
}

function imageExtension(outputFormat?: string) {
  return outputFormat === "jpeg" ? "jpg" : outputFormat || "png";
}

export function buildDownloadName(createdAt: string, turnId: string, index: number, outputFormat?: string) {
  const date = new Date(createdAt);
  const safeIndex = String(index + 1).padStart(2, "0");
  const extension = imageExtension(outputFormat);
  if (Number.isNaN(date.getTime())) {
    return `chatgpt-image-${turnId.slice(0, 8)}-${safeIndex}.${extension}`;
  }

  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const sec = String(date.getSeconds()).padStart(2, "0");
  return `chatgpt-image-${yyyy}${mm}${dd}-${hh}${min}${sec}-${safeIndex}.${extension}`;
}

export async function downloadImage(image: DownloadableImage) {
	if (image.src.startsWith("data:")) {
		triggerImageDownload(image.src, image.fileName);
		return;
	}
	await downloadImageBlob(image.src, image.fileName);
}

export async function downloadImages(images: DownloadableImage[]): Promise<ImageDownloadResult> {
	return downloadImageFiles(images.map((image) => ({ src: image.src, fileName: image.fileName })));
}

export async function fetchImageSizeLabel(src: string) {
  if (!src || src.startsWith("data:")) return "";
  try {
    const response = await fetch(src);
    if (!response.ok) return "";
    const blob = await response.blob();
    return formatImageFileSize(blob.size);
  } catch {
    return "";
  }
}

export function getTurnStatusLabel(status: ImageTurnStatus) {
  if (status === "queued") return "排队中";
  if (status === "generating") return "处理中";
  if (status === "success") return "已完成";
  if (status === "message") return "文本回复";
  if (status === "cancelled") return "已终止";
  return "失败";
}

export function turnProgressKey(conversationId: string, turnId: string) {
  return `${conversationId}:${turnId}`;
}

export function getStatusChipClass(status: ImageTurnStatus) {
  if (status === "queued") return "bg-amber-50 text-amber-700";
  if (status === "generating") return "bg-blue-50 text-[#1456f0]";
  if (status === "success") return "bg-emerald-50 text-emerald-700";
  if (status === "message") return "bg-stone-100 text-stone-600";
  if (status === "cancelled") return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

export function getTurnOutcomeLabel(successCount: number, failedCount: number, cancelledCount: number) {
  if (failedCount === 0 && cancelledCount === 0) return "";
  const parts = [`成功 ${successCount}`];
  if (failedCount > 0) parts.push(`失败 ${failedCount}`);
  if (cancelledCount > 0) parts.push(`终止 ${cancelledCount}`);
  return parts.join(" / ");
}

export function getTurnModeLabel(turn: ImageTurn) {
  if (turn.mode === "chat") return "对话";
  if (turn.mode === "generate") return "文生图";
  if (turn.mode === "edit" && turn.referenceImages.some((image) => image.source === "conversation")) return "编辑图";
  return "图生图";
}

export function formatImageDimensions(width: number, height: number) {
  return `${width} x ${height}`;
}
