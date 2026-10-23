import { Check, Eye, Globe2, LoaderCircle, Lock, Plus, WandSparkles } from "lucide-react";

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
  onOpenLightbox: (images: ImageLightboxItem[], index: number) => void;
  onContinueEdit: (conversationId: string, image: StoredImage | StoredReferenceImage) => void;
  onLocalEdit: (conversationId: string, image: StoredImage) => void;
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
  onOpenLightbox,
  onContinueEdit,
  onLocalEdit,
  onToggleSelection,
  onImageLoad,
  onEnsureImageSizeLabel,
  onVisibilityChange,
}: ImageSuccessResultCardProps) {
  const sizeLabel = image.b64_json ? formatBase64ImageFileSize(image.b64_json) : imageSizeLabel || "";
  const dimensions = imageResolutionLabel(image, imageDimensions);
  const imageMeta = [dimensions, sizeLabel].filter(Boolean).join(" · ");
  const formatLabel = getImageFormatLabel(image, imageSrc);
  const visibility = image.visibility || fallbackVisibility;
  const nextVisibility = visibility === "public" ? "private" : "public";
  const canUpdateVisibility = Boolean(image.path || image.url);

  return (
    <figure
      className={cn(
        "group relative mb-3 inline-block w-full break-inside-avoid overflow-hidden rounded-xl border border-border/75 bg-surface-muted shadow-2xs transition-all duration-200 hover:shadow-md sm:mb-4",
        selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
      )}
    >
      <button
        type="button"
        onClick={() => onOpenLightbox(lightboxImages, lightboxIndex)}
        className="block w-full cursor-zoom-in overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/40"
        aria-label={`预览第 ${imageIndex + 1} 张生成图片`}
      >
        <img
          src={imageSrc}
          alt={`生成结果 ${imageIndex + 1}`}
          className="block h-auto w-full transition duration-300 ease-out group-hover:scale-[1.01]"
          onLoad={(event) => {
            onImageLoad(image.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
            if (!image.b64_json) {
              onEnsureImageSizeLabel(image.id, imageSrc);
            }
          }}
        />
      </button>
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
      <div className="pointer-events-none absolute top-2.5 right-2.5 z-10 flex items-center gap-1 opacity-0 transition duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenLightbox(lightboxImages, lightboxIndex);
          }}
          className="inline-flex h-7 items-center gap-1 rounded-full border border-white/15 bg-black/55 px-2.5 text-[11px] font-medium text-white shadow-sm backdrop-blur-md transition hover:bg-black/75"
          aria-label="查看原图"
          title="查看原图"
        >
          <Eye className="size-3" />
          <span>查看原图</span>
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onLocalEdit(conversationId, image);
          }}
          className="inline-flex size-7 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-sm backdrop-blur-md transition hover:bg-black/75"
          aria-label="局部修改"
          title="局部修改"
        >
          <WandSparkles className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onContinueEdit(conversationId, image);
          }}
          className="inline-flex size-7 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-sm backdrop-blur-md transition hover:bg-black/75"
          aria-label="加入参考继续编辑"
          title="加入参考继续编辑"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="absolute right-2.5 bottom-2.5 z-20 flex items-center gap-1">
        {canUpdateVisibility ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void onVisibilityChange(conversationId, turnId, imageIndex, nextVisibility);
            }}
            disabled={isVisibilityMutating}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-2.5 text-[11px] font-medium text-white opacity-0 shadow-sm backdrop-blur-md transition hover:bg-black/75 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 disabled:cursor-not-allowed disabled:opacity-70"
            aria-label={visibility === "public" ? "取消公开图片" : "公开图片"}
            title={visibility === "public" ? "取消公开" : "公开"}
          >
            {isVisibilityMutating ? (
              <LoaderCircle className="size-3 animate-spin" />
            ) : visibility === "public" ? (
              <Lock className="size-3" />
            ) : (
              <Globe2 className="size-3" />
            )}
            {visibility === "public" ? "取消公开" : "公开"}
          </button>
        ) : null}
        <div
          className={cn(
            "pointer-events-none inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] font-medium shadow-sm backdrop-blur-md",
            visibility === "public"
              ? "border-emerald-400/30 bg-black/55 text-emerald-300"
              : "border-white/15 bg-black/55 text-white/90",
          )}
        >
          {visibility === "public" ? <Globe2 className="size-3" /> : <Lock className="size-3" />}
          {imageVisibilityLabel(visibility)}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent px-3 pt-8 pb-11 opacity-0 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <div className="text-left text-white drop-shadow-sm">
          <div className="font-mono text-[10px] font-semibold tracking-wider">{formatLabel}</div>
          {imageMeta ? <div className="mt-0.5 truncate font-mono text-[11px] text-white/85">{imageMeta}</div> : null}
        </div>
      </div>
    </figure>
  );
}
