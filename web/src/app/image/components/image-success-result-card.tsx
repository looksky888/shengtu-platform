import { Check, Eye, Globe2, LoaderCircle, Lock, Plus, WandSparkles } from "lucide-react";

import type { ImageLightboxItem } from "@/app/image/components/image-results-types";
import {
  blurFocusedElementInContainer,
  getImageFormatLabel,
  imageResolutionLabel,
  imageVisibilityActionClass,
  imageVisibilityLabel,
  imageVisibilityPillClass,
} from "@/app/image/components/image-results-utils";
import type { ImageVisibility } from "@/lib/api";
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
  const imageMeta = [dimensions, sizeLabel].filter(Boolean).join(" | ");
  const formatLabel = getImageFormatLabel(image, imageSrc);
  const visibility = image.visibility || fallbackVisibility;
  const nextVisibility = visibility === "public" ? "private" : "public";
  const canUpdateVisibility = Boolean(image.path || image.url);

  return (
    <figure
      className={cn(
        "group relative mb-3 inline-block w-full break-inside-avoid overflow-hidden rounded-[22px] bg-[#f0f0f0] shadow-[0_0_15px_rgba(44,30,116,0.16)] sm:mb-4",
        selected && "ring-2 ring-[#1456f0]/90 ring-offset-2",
      )}
      onMouseLeave={(event) => blurFocusedElementInContainer(event.currentTarget)}
    >
      <button
        type="button"
        onClick={(event) => {
          onToggleSelection(selectionKey);
          event.currentTarget.blur();
        }}
        className="block w-full cursor-pointer overflow-hidden text-left"
        aria-label={selected ? "取消选择图片" : "选择图片"}
      >
        <img
          src={imageSrc}
          alt={`Generated result ${imageIndex + 1}`}
          className="block h-auto w-full transition duration-200 group-hover:brightness-95"
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
          onToggleSelection(selectionKey);
          event.currentTarget.blur();
        }}
        className={cn(
          "absolute top-2 left-2 z-10 inline-flex size-6 items-center justify-center rounded-full border transition duration-150",
          selected
            ? "border-[#1456f0] bg-[#1456f0] text-white opacity-100 shadow-sm"
            : "pointer-events-none border-white/90 bg-black/20 text-transparent opacity-0 shadow-sm group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:bg-black/30",
        )}
        aria-label={selected ? "取消选择图片" : "选择图片"}
      >
        {selected ? <Check className="size-3.5" /> : null}
      </button>
      <div className="pointer-events-none absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 transition duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.blur();
            onOpenLightbox(lightboxImages, lightboxIndex);
          }}
          className="inline-flex h-7 items-center gap-1 rounded-full bg-white/95 px-2 text-[11px] font-medium text-stone-800 shadow-sm transition hover:bg-white hover:text-stone-950"
          aria-label="View Original"
          title="View Original"
        >
          <Eye className="size-3" />
          View Original
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.blur();
            onLocalEdit(conversationId, image);
          }}
          className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-stone-800 shadow-sm transition hover:bg-white hover:text-stone-950"
          aria-label="局部修改"
          title="局部修改"
        >
          <WandSparkles className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.blur();
            onContinueEdit(conversationId, image);
          }}
          className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-stone-800 shadow-sm transition hover:bg-white hover:text-stone-950"
          aria-label="加入编辑"
          title="加入编辑"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <div className="absolute right-2 bottom-2 z-20 flex items-center gap-1">
        {canUpdateVisibility ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              event.currentTarget.blur();
              void onVisibilityChange(conversationId, turnId, imageIndex, nextVisibility);
            }}
            disabled={isVisibilityMutating}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100 disabled:cursor-not-allowed disabled:opacity-70",
              imageVisibilityActionClass(visibility),
            )}
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
            "pointer-events-none inline-flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-medium shadow-sm backdrop-blur-sm",
            imageVisibilityPillClass(visibility),
          )}
        >
          {visibility === "public" ? <Globe2 className="size-3" /> : <Lock className="size-3" />}
          {imageVisibilityLabel(visibility)}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/20 to-transparent px-2.5 pt-8 pb-11 opacity-0 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <div className="text-left text-white drop-shadow-sm">
          <div className="text-[10px] font-bold tracking-wide">{formatLabel}</div>
          {imageMeta ? <div className="mt-0.5 truncate text-[11px] text-white/90">{imageMeta}</div> : null}
        </div>
      </div>
    </figure>
  );
}
