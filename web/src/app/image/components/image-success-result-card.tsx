import {
  Check,
  Copy,
  Download,
  Eye,
  Globe2,
  ImagePlus,
  LoaderCircle,
  Lock,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import type { ImageLightboxItem } from "@/app/image/components/image-results-types";
import {
  getImageFormatLabel,
  imageResolutionLabel,
} from "@/app/image/components/image-results-utils";
import type { ImageVisibility } from "@/lib/api";
import { imageVisibilityLabel } from "@/lib/image-card-utils";
import { formatBase64ImageFileSize } from "@/lib/image-size";
import { cn } from "@/lib/utils";
import type { StoredImage, StoredReferenceImage } from "@/store/image-conversations";

type ImageSuccessResultCardProps = {
  conversationId: string;
  turnId: string;
  prompt?: string;
  modelLabel?: string;
  image: StoredImage;
  imageIndex: number;
  imageSrc: string;
  lightboxImages: ImageLightboxItem[];
  lightboxIndex: number;
  selected: boolean;
  selectionKey: string;
  imageDimensions?: string;
  imageSizeLabel?: string;
  fallbackVisibility: ImageVisibility;
  isVisibilityMutating: boolean;
  isDownloading?: boolean;
  onOpenLightbox: (images: ImageLightboxItem[], index: number) => void;
  onContinueEdit: (conversationId: string, image: StoredImage | StoredReferenceImage) => void;
  onLocalEdit: (conversationId: string, image: StoredImage) => void;
  onDownload?: () => void;
  onToggleSelection: (selectionKey: string) => void;
  onImageLoad: (id: string, width: number, height: number) => void;
  onEnsureImageSizeLabel: (id: string, src: string) => void;
  onVisibilityChange: (
    conversationId: string,
    turnId: string,
    imageIndex: number,
    visibility: ImageVisibility,
  ) => void | Promise<void>;
};

export function ImageSuccessResultCard({
  conversationId,
  turnId,
  prompt = "",
  modelLabel = "",
  image,
  imageIndex,
  imageSrc,
  lightboxImages,
  lightboxIndex,
  selected,
  selectionKey,
  imageDimensions,
  imageSizeLabel,
  fallbackVisibility,
  isVisibilityMutating,
  isDownloading = false,
  onOpenLightbox,
  onContinueEdit,
  onLocalEdit,
  onDownload,
  onToggleSelection,
  onImageLoad,
  onEnsureImageSizeLabel,
  onVisibilityChange,
}: ImageSuccessResultCardProps) {
  const sizeLabel = image.b64_json ? formatBase64ImageFileSize(image.b64_json) : imageSizeLabel || "";
  const dimensions = imageResolutionLabel(image, imageDimensions);
  const formatLabel = getImageFormatLabel(image, imageSrc);
  const visibility = image.visibility || fallbackVisibility;
  const nextVisibility = visibility === "public" ? "private" : "public";
  const canUpdateVisibility = Boolean(image.path || image.url);
  const compactMeta = [dimensions, formatLabel, sizeLabel].filter(Boolean).join(" · ");

  const handleCopyPrompt = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast.info("当前结果暂无可复制提示词");
      return;
    }
    try {
      await navigator.clipboard.writeText(trimmed);
      toast.success("提示词已复制到剪贴板");
    } catch {
      toast.error("复制提示词失败");
    }
  };

  return (
    <figure
      className={cn(
        "group mb-3 inline-block w-full break-inside-avoid overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-2xs transition-all duration-200 hover:border-border-strong hover:shadow-md sm:mb-4",
        selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
      )}
    >
      {/* Artwork Stage + Hover Glass Controls */}
      <div className="relative overflow-hidden bg-surface-muted">
        <button
          type="button"
          onClick={() => onOpenLightbox(lightboxImages, lightboxIndex)}
          className="block w-full cursor-zoom-in overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/40"
          aria-label={`预览第 ${imageIndex + 1} 张生成图片`}
        >
          <img
            src={imageSrc}
            alt={`生成结果 ${imageIndex + 1}`}
            className="block h-auto w-full transition duration-300 ease-out group-hover:scale-[1.015]"
            onLoad={(event) => {
              onImageLoad(image.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
              if (!image.b64_json) {
                onEnsureImageSizeLabel(image.id, imageSrc);
              }
            }}
          />
        </button>

        {/* Top-Left Selection Checkbox */}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelection(selectionKey);
          }}
          className={cn(
            "absolute top-2.5 left-2.5 z-10 inline-flex size-7 items-center justify-center rounded-full border transition duration-150 focus-visible:pointer-events-auto focus-visible:opacity-100",
            selected
              ? "border-foreground bg-foreground text-background opacity-100 shadow-sm"
              : "pointer-events-none border-white/80 bg-black/45 text-transparent opacity-0 shadow-sm backdrop-blur-md group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100 hover:bg-black/65",
          )}
          aria-label={selected ? "取消选择图片" : "选择图片"}
          title={selected ? "取消选择" : "选择图片"}
        >
          {selected ? <Check className="size-3.5" /> : null}
        </button>

        {/* Top-Right Hover Glass Quick Overlay */}
        <div className="pointer-events-none absolute top-2.5 right-2.5 z-10 flex items-center gap-1 opacity-0 transition duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenLightbox(lightboxImages, lightboxIndex);
            }}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-white/15 bg-black/58 px-2.5 text-[11px] font-medium text-white shadow-sm backdrop-blur-md transition hover:bg-black/78"
            aria-label="查看原图"
            title="全屏查看原图"
          >
            <Eye className="size-3" />
            <span>预览</span>
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onLocalEdit(conversationId, image);
            }}
            className="inline-flex size-7 items-center justify-center rounded-full border border-white/15 bg-black/58 text-white shadow-sm backdrop-blur-md transition hover:bg-black/78"
            aria-label="局部蒙版重绘"
            title="局部蒙版重绘"
          >
            <WandSparkles className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onContinueEdit(conversationId, image);
            }}
            className="inline-flex size-7 items-center justify-center rounded-full border border-white/15 bg-black/58 text-white shadow-sm backdrop-blur-md transition hover:bg-black/78"
            aria-label="作为参考图继续创作"
            title="作为参考图继续创作"
          >
            <ImagePlus className="size-3.5" />
          </button>
          {onDownload ? (
            <button
              type="button"
              disabled={isDownloading}
              onClick={(event) => {
                event.stopPropagation();
                onDownload();
              }}
              className="inline-flex size-7 items-center justify-center rounded-full border border-white/15 bg-black/58 text-white shadow-sm backdrop-blur-md transition hover:bg-black/78 disabled:opacity-60"
              aria-label="下载原图"
              title="下载原图"
            >
              {isDownloading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            </button>
          ) : null}
        </div>

        {/* Bottom-Right Visibility Pill Overlay */}
        <div className="absolute right-2.5 bottom-2.5 z-10 flex items-center gap-1">
          {canUpdateVisibility ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void onVisibilityChange(conversationId, turnId, imageIndex, nextVisibility);
              }}
              disabled={isVisibilityMutating}
              className="inline-flex h-6.5 items-center gap-1 rounded-full border border-white/15 bg-black/58 px-2 text-[10.5px] font-medium text-white opacity-0 shadow-sm backdrop-blur-md transition hover:bg-black/78 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 disabled:cursor-not-allowed disabled:opacity-70"
              aria-label={visibility === "public" ? "设为私密" : "设为公开"}
              title={visibility === "public" ? "点击设为私密" : "点击公开到灵感库"}
            >
              {isVisibilityMutating ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : visibility === "public" ? (
                <Lock className="size-3" />
              ) : (
                <Globe2 className="size-3" />
              )}
              <span>{visibility === "public" ? "设为私密" : "公开"}</span>
            </button>
          ) : null}
          <div
            className={cn(
              "pointer-events-none inline-flex h-6.5 items-center gap-1 rounded-full border px-2 text-[10.5px] font-medium shadow-sm backdrop-blur-md",
              visibility === "public"
                ? "border-emerald-400/30 bg-black/58 text-emerald-300"
                : "border-white/15 bg-black/58 text-white/90",
            )}
          >
            {visibility === "public" ? <Globe2 className="size-3" /> : <Lock className="size-3" />}
            <span>{imageVisibilityLabel(visibility)}</span>
          </div>
        </div>
      </div>

      {/* Persistent open-ai-canvas Style Bottom Metadata & Quick-Action Bar */}
      <figcaption className="flex items-center justify-between gap-2 border-t border-border/65 bg-surface px-2.5 py-2 text-[11px]">
        <div className="flex min-w-0 items-center gap-1.5">
          {modelLabel ? (
            <span
              className="max-w-[9.5rem] truncate rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground/80"
              title={modelLabel}
            >
              {modelLabel}
            </span>
          ) : null}
          {compactMeta ? (
            <span className="truncate font-mono text-[10.5px] text-muted-foreground tabular-nums">
              {compactMeta}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {prompt.trim() ? (
            <button
              type="button"
              onClick={() => void handleCopyPrompt()}
              className="inline-flex size-6.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
              aria-label="复制提示词"
              title="复制提示词"
            >
              <Copy className="size-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onLocalEdit(conversationId, image)}
            className="inline-flex size-6.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="局部重绘"
            title="局部蒙版重绘"
          >
            <WandSparkles className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onContinueEdit(conversationId, image)}
            className="inline-flex size-6.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
            aria-label="加入参考"
            title="作为参考图继续创作"
          >
            <ImagePlus className="size-3.5" />
          </button>
          {onDownload ? (
            <button
              type="button"
              disabled={isDownloading}
              onClick={onDownload}
              className="inline-flex size-6.5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
              aria-label="下载图片"
              title="下载原图"
            >
              {isDownloading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            </button>
          ) : null}
        </div>
      </figcaption>
    </figure>
  );
}
