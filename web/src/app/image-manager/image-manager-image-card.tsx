import { Check, Copy, Eye, Globe2, LoaderCircle, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  blurFocusedElementInContainer,
  formatManagedImageMegapixels,
  getManagedImageAspectRatio,
  getManagedImageFormatLabel,
  getManagedImageResolution,
  imageOwnerLabel,
  imageVisibilityActionClass,
  imageVisibilityLabel,
  imageVisibilityPillClass,
  managedImageKey,
} from "@/app/image-manager/image-manager-utils";
import type { ImageVisibility, ManagedImage } from "@/lib/api";
import type { ImageGalleryView } from "@/lib/image-manager-cache";
import { formatImageFileSize } from "@/lib/image-size";

type ImageManagerImageCardProps = {
  item: ManagedImage;
  index: number;
  galleryView: ImageGalleryView;
  selected: boolean;
  focused: boolean;
  canDeleteImages: boolean;
  isAdmin: boolean;
  isDeleting: boolean;
  deleteTargetPaths: string[];
  visibilityMutatingPath: string | null;
  onToggleSelection: (item: ManagedImage) => void;
  onFocusPathChange: (path: string | null) => void;
  onOpenLightbox: (index: number) => void;
  onDelete: (items: ManagedImage[]) => void;
  onVisibilityChange: (item: ManagedImage, visibility: ImageVisibility) => void;
};

export function ImageManagerImageCard({
  item,
  index,
  galleryView,
  selected,
  focused,
  canDeleteImages,
  isAdmin,
  isDeleting,
  deleteTargetPaths,
  visibilityMutatingPath,
  onToggleSelection,
  onFocusPathChange,
  onOpenLightbox,
  onDelete,
  onVisibilityChange,
}: ImageManagerImageCardProps) {
  const imageKey = managedImageKey(item);
  const dimensions = getManagedImageResolution(item);
  const ratioLabel = getManagedImageAspectRatio(item);
  const megapixelsLabel = formatManagedImageMegapixels(item);
  const sizeLabel = formatImageFileSize(item.size);
  const imageMeta = [dimensions, ratioLabel, megapixelsLabel, sizeLabel].filter(Boolean).join(" | ");
  const ownerLabel = imageOwnerLabel(item);
  const canUpdateVisibility = galleryView === "mine";
  // Admins see visibility badge on public/all listings; only "mine" can toggle it.
  const showVisibilityStatus = canUpdateVisibility || (isAdmin && (galleryView === "public" || galleryView === "all"));

  const toggleSelection = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!window.matchMedia("(hover: hover)").matches) {
      onFocusPathChange(selected ? null : imageKey);
    }
    onToggleSelection(item);
    if (window.matchMedia("(hover: hover)").matches) {
      event.currentTarget.blur();
    }
  };

  return (
    <figure
      className={`group relative w-full overflow-hidden rounded-[22px] bg-background shadow-[0_0_15px_rgba(44,30,116,0.16)] ${selected ? "ring-2 ring-[#1456f0]/80 ring-offset-2" : ""}`}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: (() => {
          const w = Number(item.width);
          const h = Number(item.height);
          if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "320px 320px";
          return `${Math.min(360, w)}px ${Math.min(480, h)}px`;
        })(),
      }}
      onMouseLeave={(event) => blurFocusedElementInContainer(event.currentTarget)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onFocusPathChange(focused ? null : imageKey);
        }
      }}
    >
      <button type="button" onClick={toggleSelection} className="block w-full cursor-pointer overflow-hidden text-left" onFocus={() => onFocusPathChange(imageKey)} aria-label={selected ? "取消选择图片" : "选择图片"}>
        <img
          src={item.thumbnail_url || item.url}
          alt={item.name}
          width={item.width || undefined}
          height={item.height || undefined}
          loading="lazy"
          decoding="async"
          sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="block h-auto w-full transition duration-200 group-hover:brightness-95"
        />
      </button>
      <button type="button" onClick={toggleSelection} className={`absolute top-2 left-2 z-10 inline-flex size-6 items-center justify-center rounded-full border transition duration-150 ${selected ? "border-[#1456f0] bg-[#1456f0] text-white opacity-100 shadow-sm" : "pointer-events-none border-white/90 bg-black/20 text-transparent opacity-0 shadow-sm group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 hover:bg-black/30"}`} aria-label={selected ? "取消选择图片" : "选择图片"}>
        {selected ? <Check className="size-3.5" /> : null}
      </button>
      <ImageCardTopActions
        item={item}
        index={index}
        focused={focused}
        galleryView={galleryView}
        canDeleteImages={canDeleteImages}
        isDeleting={isDeleting}
        isDeletingItem={deleteTargetPaths.includes(item.path)}
        onOpenLightbox={onOpenLightbox}
        onDelete={onDelete}
      />
      <div className="absolute right-2 bottom-2 left-2 z-20 flex items-center justify-between gap-2">
        <div className="pointer-events-none inline-flex h-7 min-w-0 max-w-[min(58%,13rem)] items-center rounded-full bg-white/15 px-2.5 text-[11px] font-medium text-white shadow-sm ring-1 ring-white/25 backdrop-blur-md" title={`作者：${ownerLabel}`}>
          <span className="min-w-0 truncate">{ownerLabel}</span>
        </div>
        {showVisibilityStatus ? (
          <ImageCardVisibility
            item={item}
            focused={focused}
            canUpdateVisibility={canUpdateVisibility}
            visibilityMutatingPath={visibilityMutatingPath}
            isDeleting={isDeleting}
            onVisibilityChange={onVisibilityChange}
          />
        ) : null}
      </div>
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent px-2.5 pt-8 pb-11 transition duration-150 ${focused ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
        <div className="text-left text-white drop-shadow-sm">
          <div className="text-[10px] font-bold tracking-wide">{getManagedImageFormatLabel(item)}</div>
          <div className="mt-0.5 truncate text-[11px] text-white/90">{item.created_at}</div>
          {imageMeta ? <div className="mt-0.5 truncate text-[11px] text-white/90">{imageMeta}</div> : null}
        </div>
      </div>
    </figure>
  );
}

function ImageCardTopActions({ item, index, focused, galleryView, canDeleteImages, isDeleting, isDeletingItem, onOpenLightbox, onDelete }: {
  item: ManagedImage; index: number; focused: boolean; galleryView: ImageGalleryView; canDeleteImages: boolean; isDeleting: boolean; isDeletingItem: boolean; onOpenLightbox: (index: number) => void; onDelete: (items: ManagedImage[]) => void;
}) {
  return (
    <div className={`absolute top-2 right-2 z-10 flex items-center gap-1 transition duration-150 ${focused ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"}`}>
      <button type="button" onClick={(event) => { event.currentTarget.blur(); onOpenLightbox(index); }} className="inline-flex h-7 items-center gap-1 rounded-full bg-white/95 px-2 text-[11px] font-medium text-stone-800 shadow-sm transition hover:bg-white hover:text-stone-950" aria-label="View Original" title="View Original">
        <Eye className="size-3" />View Original
      </button>
      {galleryView !== "mine" ? (
        <button type="button" onClick={(event) => { event.currentTarget.blur(); void navigator.clipboard.writeText(item.url); toast.success("图片地址已复制"); }} className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-stone-800 shadow-sm transition hover:bg-white hover:text-stone-950" aria-label="复制图片地址" title="复制图片地址">
          <Copy className="size-3.5" />
        </button>
      ) : null}
      {canDeleteImages ? (
        <button type="button" onClick={(event) => { event.currentTarget.blur(); onDelete([item]); }} disabled={isDeleting} className="inline-flex size-7 items-center justify-center rounded-full bg-white/95 text-rose-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60" aria-label="删除图片" title="删除图片">
          {isDeleting && isDeletingItem ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </button>
      ) : null}
    </div>
  );
}

function ImageCardVisibility({ item, focused, canUpdateVisibility, visibilityMutatingPath, isDeleting, onVisibilityChange }: { item: ManagedImage; focused: boolean; canUpdateVisibility: boolean; visibilityMutatingPath: string | null; isDeleting: boolean; onVisibilityChange: (item: ManagedImage, visibility: ImageVisibility) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {canUpdateVisibility ? (
        <button type="button" onClick={(event) => { event.stopPropagation(); event.currentTarget.blur(); onVisibilityChange(item, item.visibility === "public" ? "private" : "public"); }} disabled={visibilityMutatingPath !== null || isDeleting} className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-70 ${focused ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"} ${imageVisibilityActionClass(item.visibility)}`}>
          {visibilityMutatingPath === item.path ? <LoaderCircle className="size-3 animate-spin" /> : item.visibility === "public" ? <Lock className="size-3" /> : <Globe2 className="size-3" />}
          {item.visibility === "public" ? "取消公开" : "公开"}
        </button>
      ) : null}
      <div className={`pointer-events-none inline-flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-medium shadow-sm backdrop-blur-sm ${imageVisibilityPillClass(item.visibility)}`}>
        {item.visibility === "public" ? <Globe2 className="size-3" /> : <Lock className="size-3" />}
        {imageVisibilityLabel(item.visibility)}
      </div>
    </div>
  );
}
