import { useState } from "react";
import {
  Check,
  Clock3,
  CloudOff,
  Copy,
  Download,
  Film,
  Globe2,
  Image as ImageIcon,
  LoaderCircle,
  Lock,
  Play,
  Trash2,
  Wand2,
} from "lucide-react";

import {
  isImageRetentionExpired,
  resolveImageExpiryBadge,
  type AssetsScope,
} from "@/app/assets/assets-cloud-policy";
import type { ImageVisibility, ManagedImage } from "@/lib/api-types";
import {
  imageDownloadFileName,
  triggerImageDownload,
} from "@/lib/image-download";
import { cn } from "@/lib/utils";
import { videoDownloadURL, type VideoAsset } from "@/lib/video-task-api";

export type UnifiedAssetItem =
  | {
      kind: "image";
      key: string;
      timestamp: number;
      image: ManagedImage;
      prompt?: string;
    }
  | {
      kind: "video";
      key: string;
      timestamp: number;
      video: VideoAsset;
    };

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveMediaAspectRatio(input: {
  width?: number;
  height?: number;
  size?: string;
  aspectRatio?: string;
}): string | undefined {
  if (
    typeof input.width === "number" &&
    typeof input.height === "number" &&
    input.width > 0 &&
    input.height > 0
  ) {
    return `${input.width} / ${input.height}`;
  }
  const sizeMatch = /^(\d+)x(\d+)$/i.exec((input.size || "").trim());
  if (sizeMatch) {
    const w = Number(sizeMatch[1]);
    const h = Number(sizeMatch[2]);
    if (w > 0 && h > 0) return `${w} / ${h}`;
  }
  const ratioMatch = /^(\d+(?:\.\d+)?)[:/](\d+(?:\.\d+)?)$/.exec(
    (input.aspectRatio || "").trim(),
  );
  if (ratioMatch) {
    const w = Number(ratioMatch[1]);
    const h = Number(ratioMatch[2]);
    if (w > 0 && h > 0) return `${w} / ${h}`;
  }
  return undefined;
}

export function AssetsImageCard({
  item,
  scope,
  cloudStorageEnabled,
  canDelete,
  canToggleVisibility,
  selected,
  mutating,
  naturalAspect = false,
  resolvedPrompt,
  onToggleSelect,
  onPreviewImage,
  onToggleVisibility,
  onRequestDelete,
  onCopyPrompt,
  onRemixImage,
  onImageLoadError,
}: {
  item: Extract<UnifiedAssetItem, { kind: "image" }>;
  scope: AssetsScope;
  cloudStorageEnabled: boolean;
  canDelete: boolean;
  canToggleVisibility: boolean;
  selected: boolean;
  mutating: boolean;
  naturalAspect?: boolean;
  resolvedPrompt?: string;
  onToggleSelect: (key: string) => void;
  onPreviewImage: (image: ManagedImage) => void;
  onToggleVisibility: (item: UnifiedAssetItem, next: ImageVisibility) => void;
  onRequestDelete: (item: UnifiedAssetItem) => void;
  onCopyPrompt?: (prompt: string) => void;
  onRemixImage?: (image: ManagedImage, prompt?: string) => void;
  onImageLoadError?: (path: string) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  const img = item.image;
  const expiryBadge = resolveImageExpiryBadge({
    cloudStorageEnabled,
    scope,
    expiresAt: img.expires_at,
  });
  const retention = {
    expired: isImageRetentionExpired({
      cloudStorageEnabled,
      scope,
      expiresAt: img.expires_at,
    }),
  };
  const unavailable = imgFailed || Boolean(retention?.expired) || !img.url;

  const promptText = (
    resolvedPrompt ??
    item.prompt ??
    (img as ManagedImage & { prompt?: string }).prompt ??
    ""
  ).trim();
  const captionText = promptText || img.name;

  const nextVisibility: ImageVisibility =
    img.visibility === "public" ? "private" : "public";
  const metaText = [
    img.resolution ||
      (img.width && img.height ? `${img.width}×${img.height}` : ""),
    formatFileSize(img.size),
  ]
    .filter(Boolean)
    .join(" · ");

  const naturalRatio = naturalAspect
    ? resolveMediaAspectRatio({
        width: img.width,
        height: img.height,
        size: img.requested_size || img.resolution,
        aspectRatio: img.aspect_ratio,
      })
    : undefined;

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl bg-surface transition-transform duration-200 hover:-translate-y-0.5 dark:bg-[#17181c]",
        naturalAspect && "break-inside-avoid",
        selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
      )}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden bg-surface-muted",
          (!naturalAspect || imgFailed || !img.url) && "aspect-[4/3]",
        )}
        style={
          naturalAspect && !imgFailed && img.url && naturalRatio
            ? { aspectRatio: naturalRatio }
            : undefined
        }
      >
        {imgFailed || !img.url ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-4 text-center text-muted-foreground">
            <CloudOff className="size-5 opacity-70" />
            <span className="text-[11px]">云端预览已不可用</span>
          </div>
        ) : (
          <button
            type="button"
            disabled={unavailable}
            onClick={() => {
              if (unavailable) return;
              onPreviewImage(img);
            }}
            title={unavailable ? "素材已过期，无法预览原图" : undefined}
            className={cn(
              "block h-full w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/35",
              unavailable ? "cursor-not-allowed opacity-70" : "cursor-zoom-in",
            )}
            aria-label={`预览图片 ${captionText}`}
          >
            <img
              src={img.thumbnail_url || img.url}
              alt={captionText}
              loading="lazy"
              decoding="async"
              onError={() => {
                setImgFailed(true);
                onImageLoadError?.(img.path);
              }}
              className={cn(
                "w-full object-cover transition-transform duration-300 ease-out",
                !unavailable && "group-hover:scale-[1.03]",
                naturalAspect && !naturalRatio ? "h-auto max-h-[540px]" : "h-full",
              )}
            />
          </button>
        )}

        {/* Top-Left Selection + Media Kind */}
        <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect(item.key);
            }}
            aria-label={selected ? "取消选择素材" : "选择素材"}
            className={cn(
              "inline-flex size-6.5 items-center justify-center rounded-full border transition duration-150",
              selected
                ? "border-foreground bg-foreground text-background opacity-100 shadow-xs"
                : "border-white/75 bg-black/50 text-transparent opacity-0 backdrop-blur-md group-hover:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-black/70",
            )}
          >
            {selected ? <Check className="size-3.5" /> : null}
          </button>
          <span className="pointer-events-none inline-flex items-center gap-1 rounded-full bg-black/62 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-md">
            <ImageIcon className="size-2.5" />
            <span>图片</span>
          </span>
        </div>

        {/* Conditional Expiry Countdown Badge (STRICTLY only when cloudStorageEnabled && scope === "mine" && expires_at) */}
        {expiryBadge ? (
          <span
            className={cn(
              "pointer-events-none absolute top-2.5 right-2.5 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-md",
              expiryBadge.urgent
                ? "border border-amber-400/40 bg-black/72 text-amber-300"
                : "border border-white/15 bg-black/62 text-zinc-200",
            )}
          >
            <Clock3 className="size-2.5" />
            <span>{expiryBadge.label}</span>
          </span>
        ) : null}

        {/* Bottom Hover Action Bar */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2.5 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-black/58 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-md">
            {img.visibility === "public" ? (
              <>
                <Globe2 className="size-2.5 text-emerald-300" />
                <span>已公开</span>
              </>
            ) : (
              <>
                <Lock className="size-2.5" />
                <span>私密</span>
              </>
            )}
          </span>

          <div className="flex items-center gap-1">
            {onRemixImage ? (
              <button
                type="button"
                disabled={unavailable}
                onClick={(event) => {
                  event.stopPropagation();
                  if (unavailable) return;
                  onRemixImage(img, promptText || undefined);
                }}
                title={
                  unavailable
                    ? "素材已过期或云端预览不可用，无法二创"
                    : "以此图作为参考图去二创"
                }
                aria-label="去二创"
                className="inline-flex h-7 items-center gap-1 rounded-full bg-white/92 px-2.5 text-[11px] font-semibold text-zinc-950 shadow-xs backdrop-blur-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Wand2 className="size-3" />
                <span>去二创</span>
              </button>
            ) : null}

            {promptText && onCopyPrompt ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCopyPrompt(promptText);
                }}
                title="复制提示词"
                aria-label="复制提示词"
                className="inline-flex size-7 items-center justify-center rounded-full bg-black/62 text-white backdrop-blur-md transition hover:bg-black/82"
              >
                <Copy className="size-3.5" />
              </button>
            ) : null}

            <button
              type="button"
              disabled={unavailable}
              onClick={(event) => {
                event.stopPropagation();
                if (unavailable) return;
                triggerImageDownload(
                  img.url,
                  imageDownloadFileName(img.url, img.name || "image"),
                );
              }}
              title={
                unavailable
                  ? "素材已过期或云端预览不可用，无法下载"
                  : "下载原图"
              }
              aria-label="下载原图"
              className="inline-flex size-7 items-center justify-center rounded-full bg-black/62 text-white backdrop-blur-md transition hover:bg-black/82 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download className="size-3.5" />
            </button>

            {canToggleVisibility ? (
              <button
                type="button"
                disabled={mutating}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleVisibility(item, nextVisibility);
                }}
                title={img.visibility === "public" ? "设为私密" : "设为公开"}
                aria-label={
                  img.visibility === "public" ? "设为私密" : "设为公开"
                }
                className="inline-flex size-7 items-center justify-center rounded-full bg-black/62 text-white backdrop-blur-md transition hover:bg-black/82 disabled:opacity-50"
              >
                {mutating ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : img.visibility === "public" ? (
                  <Lock className="size-3.5" />
                ) : (
                  <Globe2 className="size-3.5" />
                )}
              </button>
            ) : null}

            {canDelete ? (
              <button
                type="button"
                disabled={mutating}
                onClick={(event) => {
                  event.stopPropagation();
                  onRequestDelete(item);
                }}
                title="删除图片"
                aria-label="删除图片"
                className="inline-flex size-7 items-center justify-center rounded-full bg-black/62 text-rose-300 backdrop-blur-md transition hover:bg-rose-500/80 hover:text-white disabled:opacity-50"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className="truncate text-xs font-medium text-foreground"
            title={captionText}
          >
            {captionText}
          </span>
          {scope !== "mine" && img.owner_name ? (
            <span className="shrink-0 text-[10.5px] text-muted-foreground">
              @{img.owner_name}
            </span>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate font-mono tabular-nums">
            {metaText || img.date}
          </span>
          <span className="shrink-0 font-mono text-[10.5px] tabular-nums">
            {img.date}
          </span>
        </div>
      </div>
    </article>
  );
}

export function AssetsVideoCard({
  item,
  scope,
  canDelete,
  canToggleVisibility,
  selected,
  mutating,
  naturalAspect = false,
  onToggleSelect,
  onPreviewVideo,
  onToggleVisibility,
  onRequestDelete,
  onCopyPrompt,
}: {
  item: Extract<UnifiedAssetItem, { kind: "video" }>;
  scope: AssetsScope;
  canDelete: boolean;
  canToggleVisibility: boolean;
  selected: boolean;
  mutating: boolean;
  naturalAspect?: boolean;
  onToggleSelect: (key: string) => void;
  onPreviewVideo: (video: VideoAsset) => void;
  onToggleVisibility: (item: UnifiedAssetItem, next: ImageVisibility) => void;
  onRequestDelete: (item: UnifiedAssetItem) => void;
  onCopyPrompt?: (prompt: string) => void;
}) {
  const vid = item.video;
  const videoPromptText = (vid.prompt || "").trim();
  const nextVisibility: ImageVisibility =
    vid.visibility === "public" ? "private" : "public";
  const metaText = [
    vid.resolution_name?.toUpperCase(),
    vid.size,
    formatFileSize(vid.size_bytes),
  ]
    .filter(Boolean)
    .join(" · ");
  const videoNaturalRatio = naturalAspect
    ? resolveMediaAspectRatio({ size: vid.size })
    : undefined;

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl bg-surface transition-transform duration-200 hover:-translate-y-0.5 dark:bg-[#17181c]",
        naturalAspect && "break-inside-avoid",
        selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
      )}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden bg-zinc-950",
          (!naturalAspect || !videoNaturalRatio) && "aspect-[4/3]",
        )}
        style={videoNaturalRatio ? { aspectRatio: videoNaturalRatio } : undefined}
      >
        <button
          type="button"
          onClick={() => onPreviewVideo(vid)}
          className="relative block h-full w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/35"
          aria-label={`播放视频 ${vid.prompt || vid.task_id}`}
        >
          <video
            src={vid.url}
            muted
            playsInline
            loop
            preload="metadata"
            onMouseEnter={(e) => {
              void e.currentTarget.play().catch(() => undefined);
            }}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
            }}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity group-hover:opacity-0">
            <span className="flex size-10 items-center justify-center rounded-full bg-black/62 text-white backdrop-blur-md">
              <Play className="ml-0.5 size-4 fill-current" />
            </span>
          </span>
        </button>

        {/* Top-Left Selection + Video Duration Pill */}
        <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelect(item.key);
            }}
            aria-label={selected ? "取消选择视频" : "选择视频"}
            className={cn(
              "inline-flex size-6.5 items-center justify-center rounded-full border transition duration-150",
              selected
                ? "border-foreground bg-foreground text-background opacity-100 shadow-xs"
                : "border-white/75 bg-black/50 text-transparent opacity-0 backdrop-blur-md group-hover:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-black/70",
            )}
          >
            {selected ? <Check className="size-3.5" /> : null}
          </button>
          <span className="pointer-events-none inline-flex items-center gap-1 rounded-full bg-black/68 px-2 py-0.5 text-[10px] font-medium text-sky-300 backdrop-blur-md">
            <Film className="size-2.5" />
            <span>视频{vid.seconds ? ` · ${vid.seconds}s` : ""}</span>
          </span>
        </div>

        {/* Bottom Hover Action Bar */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-2.5 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/58 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-md">
            {vid.visibility === "public" ? (
              <>
                <Globe2 className="size-2.5 text-emerald-300" />
                <span>已公开</span>
              </>
            ) : (
              <>
                <Lock className="size-2.5" />
                <span>私密</span>
              </>
            )}
          </span>

          <div className="flex items-center gap-1">
            {videoPromptText && onCopyPrompt ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCopyPrompt(videoPromptText);
                }}
                title="复制提示词"
                aria-label="复制提示词"
                className="inline-flex size-7 items-center justify-center rounded-full bg-black/62 text-white backdrop-blur-md transition hover:bg-black/82"
              >
                <Copy className="size-3.5" />
              </button>
            ) : null}

            <a
              href={videoDownloadURL(vid)}
              download={`video-${vid.task_id}.mp4`}
              onClick={(event) => event.stopPropagation()}
              title="下载视频"
              aria-label="下载视频"
              className="inline-flex size-7 items-center justify-center rounded-full bg-black/62 text-white backdrop-blur-md transition hover:bg-black/82"
            >
              <Download className="size-3.5" />
            </a>

            {canToggleVisibility ? (
              <button
                type="button"
                disabled={mutating}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleVisibility(item, nextVisibility);
                }}
                title={vid.visibility === "public" ? "设为私密" : "设为公开"}
                aria-label={
                  vid.visibility === "public" ? "设为私密" : "设为公开"
                }
                className="inline-flex size-7 items-center justify-center rounded-full bg-black/62 text-white backdrop-blur-md transition hover:bg-black/82 disabled:opacity-50"
              >
                {mutating ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : vid.visibility === "public" ? (
                  <Lock className="size-3.5" />
                ) : (
                  <Globe2 className="size-3.5" />
                )}
              </button>
            ) : null}

            {canDelete ? (
              <button
                type="button"
                disabled={mutating}
                onClick={(event) => {
                  event.stopPropagation();
                  onRequestDelete(item);
                }}
                title="删除视频"
                aria-label="删除视频"
                className="inline-flex size-7 items-center justify-center rounded-full bg-black/62 text-rose-300 backdrop-blur-md transition hover:bg-rose-500/80 hover:text-white disabled:opacity-50"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className="truncate text-xs font-medium text-foreground"
            title={vid.prompt || vid.model || vid.task_id}
          >
            {vid.prompt || vid.model || `视频 #${vid.task_id.slice(0, 8)}`}
          </span>
          {scope !== "mine" && vid.owner_name ? (
            <span className="shrink-0 text-[10.5px] text-muted-foreground">
              @{vid.owner_name}
            </span>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate font-mono tabular-nums">
            {metaText || vid.model}
          </span>
          <span className="shrink-0 font-mono text-[10.5px] tabular-nums">
            {vid.created_at.slice(0, 10)}
          </span>
        </div>
      </div>
    </article>
  );
}

export function AssetsMediaCard({
  item,
  scope,
  cloudStorageEnabled,
  canManage = false,
  canDelete = canManage,
  canToggleVisibility = canManage,
  selected,
  mutating,
  naturalAspect = false,
  resolvedPrompt,
  onToggleSelect,
  onPreviewImage,
  onPreviewVideo,
  onToggleVisibility,
  onRequestDelete,
  onCopyPrompt,
  onRemixImage,
  onImageLoadError,
}: {
  item: UnifiedAssetItem;
  scope: AssetsScope;
  cloudStorageEnabled: boolean;
  canManage?: boolean;
  canDelete?: boolean;
  canToggleVisibility?: boolean;
  selected: boolean;
  mutating: boolean;
  naturalAspect?: boolean;
  resolvedPrompt?: string;
  onToggleSelect: (key: string) => void;
  onPreviewImage: (image: ManagedImage) => void;
  onPreviewVideo: (video: VideoAsset) => void;
  onToggleVisibility: (item: UnifiedAssetItem, next: ImageVisibility) => void;
  onRequestDelete: (item: UnifiedAssetItem) => void;
  onCopyPrompt?: (prompt: string) => void;
  onRemixImage?: (image: ManagedImage, prompt?: string) => void;
  onImageLoadError?: (path: string) => void;
}) {
  if (item.kind === "image") {
    return (
      <AssetsImageCard
        item={item}
        scope={scope}
        cloudStorageEnabled={cloudStorageEnabled}
        canDelete={canDelete}
        canToggleVisibility={canToggleVisibility}
        selected={selected}
        mutating={mutating}
        naturalAspect={naturalAspect}
        resolvedPrompt={resolvedPrompt}
        onToggleSelect={onToggleSelect}
        onPreviewImage={onPreviewImage}
        onToggleVisibility={onToggleVisibility}
        onRequestDelete={onRequestDelete}
        onCopyPrompt={onCopyPrompt}
        onRemixImage={onRemixImage}
        onImageLoadError={onImageLoadError}
      />
    );
  }

  return (
    <AssetsVideoCard
      item={item}
      scope={scope}
      canDelete={canDelete}
      canToggleVisibility={canToggleVisibility}
      selected={selected}
      mutating={mutating}
      naturalAspect={naturalAspect}
      onToggleSelect={onToggleSelect}
      onPreviewVideo={onPreviewVideo}
      onToggleVisibility={onToggleVisibility}
      onRequestDelete={onRequestDelete}
      onCopyPrompt={onCopyPrompt}
    />
  );
}
