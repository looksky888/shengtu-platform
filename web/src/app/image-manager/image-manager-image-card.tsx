import { Check, Copy, Eye, Globe2, LoaderCircle, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  formatManagedImageMegapixels,
  getManagedImageAspectRatio,
  getManagedImageFormatLabel,
  getManagedImageResolution,
  imageOwnerLabel,
  managedImageKey,
} from "@/app/image-manager/image-manager-utils";
import type { ImageVisibility, ManagedImage } from "@/lib/api";
import { imageVisibilityLabel } from "@/lib/image-card-utils";
import type { ImageGalleryView } from "@/lib/image-manager-cache";
import { copyText } from "@/lib/clipboard";
import { formatImageFileSize } from "@/lib/image-size";
import { cn } from "@/lib/utils";

function resolveManagedImageVisibilityPillClass(visibility?: ImageVisibility) {
  return visibility === "public"
    ? "bg-white/92 text-zinc-900 ring-1 ring-black/10"
    : "bg-black/65 text-white ring-1 ring-white/20";
}

function resolveManagedImageVisibilityActionClass(visibility?: ImageVisibility) {
  return visibility === "public"
    ? "bg-white/95 text-zinc-900 hover:bg-white"
    : "bg-white/95 text-zinc-900 hover:bg-white";
}

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
  const imageMeta = [dimensions, ratioLabel, megapixelsLabel, sizeLabel].filter(Boolean).join(" · ");
  const ownerLabel = imageOwnerLabel(item);
  const canUpdateVisibility = galleryView === "mine";
  // Admins see visibility badge on public/all listings; only "mine" can toggle it.
  const showVisibilityStatus = canUpdateVisibility || (isAdmin && (galleryView === "public" || galleryView === "all"));

  const toggleSelection = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!window.matchMedia("(hover: hover)").matches) {
      onFocusPathChange(selected ? null : imageKey);
    }
    onToggleSelection(item);
  };

  return (
    <figure
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border border-border/60 bg-surface-muted shadow-2xs transition-shadow hover:shadow-md",
        selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
      )}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: (() => {
          const w = Number(item.width);
          const h = Number(item.height);
          if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "320px 320px";
          return `${Math.min(360, w)}px ${Math.min(480, h)}px`;
        })(),
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onFocusPathChange(focused ? null : imageKey);
        }
      }}
    >
      <button
        type="button"
        onClick={() => onOpenLightbox(index)}
        className="block w-full cursor-zoom-in overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground"
        onFocus={() => onFocusPathChange(imageKey)}
        aria-label={`预览图片 ${item.name}`}
      >
        <img
          src={item.thumbnail_url || item.url}
          alt={item.name}
          width={item.width || undefined}
          height={item.height || undefined}
          loading="lazy"
          decoding="async"
          sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="block h-auto w-full transition duration-200 group-hover:scale-[1.01] group-hover:brightness-95"
        />
      </button>
      <button
        type="button"
        onClick={toggleSelection}
        className={cn(
          "absolute top-2.5 left-2.5 z-10 inline-flex size-7 items-center justify-center rounded-md border transition duration-150 focus-visible:pointer-events-auto focus-visible:opacity-100",
          selected
            ? "border-foreground bg-foreground text-background opacity-100 shadow-sm"
            : "pointer-events-none border-white/90 bg-black/30 text-transparent opacity-0 shadow-sm group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100 hover:bg-black/45",
        )}
        aria-label={selected ? "取消选择图片" : "选择图片"}
        title={selected ? "取消选择" : "选择图片"}
      >
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
      <div className="absolute right-2.5 bottom-2.5 left-2.5 z-20 flex items-center justify-between gap-2">
        <div
          className="pointer-events-none inline-flex h-7 min-w-0 max-w-[min(58%,13rem)] items-center rounded-md bg-black/45 px-2.5 text-[11px] font-medium text-white shadow-sm ring-1 ring-white/20 backdrop-blur-md"
          title={`作者：${ownerLabel}`}
        >
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
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/25 to-transparent px-3 pt-8 pb-11 transition duration-150",
          focused ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
        )}
      >
        <div className="text-left text-white drop-shadow-sm">
          <div className="text-[10px] font-bold tracking-wide">{getManagedImageFormatLabel(item)}</div>
          <div className="mt-0.5 truncate text-[11px] text-white/90 tabular-nums">{item.created_at}</div>
          {imageMeta ? <div className="mt-0.5 truncate text-[11px] text-white/90 tabular-nums">{imageMeta}</div> : null}
        </div>
      </div>
    </figure>
  );
}

function ImageCardTopActions({
  item,
  index,
  focused,
  galleryView,
  canDeleteImages,
  isDeleting,
  isDeletingItem,
  onOpenLightbox,
  onDelete,
}: {
  item: ManagedImage;
  index: number;
  focused: boolean;
  galleryView: ImageGalleryView;
  canDeleteImages: boolean;
  isDeleting: boolean;
  isDeletingItem: boolean;
  onOpenLightbox: (index: number) => void;
  onDelete: (items: ManagedImage[]) => void;
}) {
  return (
    <div
      className={cn(
        "absolute top-2.5 right-2.5 z-10 flex items-center gap-1 transition duration-150 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100",
        focused
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
      )}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenLightbox(index);
        }}
        className="inline-flex h-7 items-center gap-1 rounded-lg bg-black/65 px-2.5 text-[11px] font-medium text-white shadow-sm backdrop-blur-md transition hover:bg-black/80"
        aria-label="查看原图"
        title="查看原图"
      >
        <Eye className="size-3" />
        <span>查看原图</span>
      </button>
      {galleryView !== "mine" ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void copyText(item.url)
              .then(() => toast.success("图片地址已复制"))
              .catch(() => toast.error("复制失败，请手动复制"));
          }}
          className="inline-flex size-7 items-center justify-center rounded-lg bg-black/65 text-white shadow-sm backdrop-blur-md transition hover:bg-black/80"
          aria-label="复制图片地址"
          title="复制图片地址"
        >
          <Copy className="size-3.5" />
        </button>
      ) : null}
      {canDeleteImages ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete([item]);
          }}
          disabled={isDeleting}
          className="inline-flex size-7 items-center justify-center rounded-lg bg-white/95 text-rose-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="删除图片"
          title="删除图片"
        >
          {isDeleting && isDeletingItem ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </button>
      ) : null}
    </div>
  );
}

function ImageCardVisibility({
  item,
  focused,
  canUpdateVisibility,
  visibilityMutatingPath,
  isDeleting,
  onVisibilityChange,
}: {
  item: ManagedImage;
  focused: boolean;
  canUpdateVisibility: boolean;
  visibilityMutatingPath: string | null;
  isDeleting: boolean;
  onVisibilityChange: (item: ManagedImage, visibility: ImageVisibility) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {canUpdateVisibility ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onVisibilityChange(item, item.visibility === "public" ? "private" : "public");
          }}
          disabled={visibilityMutatingPath !== null || isDeleting}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-70 [@media(hover:none)]:opacity-100",
            focused ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
            resolveManagedImageVisibilityActionClass(item.visibility),
          )}
        >
          {visibilityMutatingPath === item.path ? (
            <LoaderCircle className="size-3 animate-spin" />
          ) : item.visibility === "public" ? (
            <Lock className="size-3" />
          ) : (
            <Globe2 className="size-3" />
          )}
          {item.visibility === "public" ? "取消公开" : "公开"}
        </button>
      ) : null}
      <div
        className={cn(
          "pointer-events-none inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium shadow-sm backdrop-blur-sm",
          resolveManagedImageVisibilityPillClass(item.visibility),
        )}
      >
        {item.visibility === "public" ? <Globe2 className="size-3" /> : <Lock className="size-3" />}
        {imageVisibilityLabel(item.visibility)}
      </div>
    </div>
  );
}
