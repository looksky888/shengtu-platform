import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Clock3,
  Download,
  Film,
  Globe2,
  LoaderCircle,
  Lock,
  Play,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { videoDownloadURL, type VideoAsset } from "@/lib/video-task-api";

import type { VideoLibraryController } from "./use-video-library";

export function VideoLibraryGrid({
  controller,
  canDeleteVideos,
  canUpdateVisibility,
  onRetry,
  onClearFilters,
}: {
  controller: VideoLibraryController;
  canDeleteVideos: boolean;
  canUpdateVisibility: boolean;
  onRetry: () => void;
  onClearFilters?: () => void;
}) {
  if (controller.loading && controller.assets.length === 0) {
    return (
      <LibraryLoadingOrErrorState
        icon={<LoaderCircle className="size-5 animate-spin text-foreground" />}
        title="正在读取视频资产"
      />
    );
  }
  if (controller.error) {
    return (
      <LibraryLoadingOrErrorState
        icon={<AlertCircle className="size-5 text-rose-600 dark:text-rose-400" />}
        title="视频库加载失败"
        detail={controller.error}
        action={<Button type="button" variant="outline" size="sm" onClick={onRetry}>重新加载</Button>}
      />
    );
  }
  if (controller.filteredAssets.length === 0) {
    const filtered = Boolean(controller.searchKeyword.trim() || controller.visibilityFilter !== "all");
    return (
      <div className="rounded-[14px] border border-border/80 bg-surface shadow-2xs">
        <EmptyState
          icon={filtered ? Search : Film}
          title={filtered ? "没有匹配筛选条件的视频" : "暂无视频资产"}
          description={
            filtered
              ? "尝试清空搜索词，或切换公开状态筛选后再试。"
              : "在视频工作台完成生成后，视频资产会自动归档到这里。"
          }
          action={
            filtered ? (
              onClearFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
                  <RotateCcw className="size-3.5" />
                  重置筛选条件
                </Button>
              ) : undefined
            ) : (
              <Button asChild size="sm">
                <Link to="/video">
                  前往创作第一个视频
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            )
          }
        />
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {controller.filteredAssets.map((asset) => (
        <VideoAssetCard
          key={asset.id}
          asset={asset}
          controller={controller}
          canDeleteVideos={canDeleteVideos}
          canUpdateVisibility={canUpdateVisibility}
        />
      ))}
    </div>
  );
}

function VideoAssetCard({
  asset,
  controller,
  canDeleteVideos,
  canUpdateVisibility,
}: {
  asset: VideoAsset;
  controller: VideoLibraryController;
  canDeleteVideos: boolean;
  canUpdateVisibility: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activated, setActivated] = useState(false);
  const deleting = controller.deletingTaskID === asset.id;
  const updatingVisibility = controller.visibilityMutatingID === asset.id;
  const selected = Boolean(controller.selectedIDs[asset.id]);

  const handlePreviewStart = () => {
    setActivated(true);
    const element = videoRef.current;
    if (!element) return;
    if (element.preload === "none") {
      element.preload = "metadata";
    }
    void element.play().catch(() => undefined);
  };

  const handlePreviewStop = () => {
    const element = videoRef.current;
    if (!element) return;
    element.pause();
  };

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xs transition-shadow hover:shadow-md",
        selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
      )}
    >
      <div
        className="group relative aspect-video w-full bg-zinc-950 text-white"
        onMouseEnter={handlePreviewStart}
        onMouseLeave={handlePreviewStop}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={() => controller.toggleSelected(asset.id)}
          onClick={(event) => event.stopPropagation()}
          className="absolute left-3 top-3 z-10 border-white bg-black/45 data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background"
          aria-label={selected ? "取消选择视频" : "选择视频"}
        />
        <button
          type="button"
          className="absolute inset-0 block w-full"
          onFocus={handlePreviewStart}
          onBlur={handlePreviewStop}
          onClick={() => controller.selectAsset(asset)}
          aria-label={`播放视频 ${asset.task_id}`}
        >
          {!activated ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_70%)] text-zinc-500">
              <Film className="size-6 opacity-50" />
              <span className="font-mono text-[10px] tracking-wider uppercase opacity-75">
                {asset.resolution_name || "MP4"} · {asset.seconds || "—"}S
              </span>
            </div>
          ) : null}
          <video
            ref={videoRef}
            preload="none"
            playsInline
            loop
            src={activated ? asset.url : undefined}
            muted
            className="relative z-[1] size-full object-cover"
          />
          <span className="absolute inset-0 z-[2] grid place-items-center bg-black/15 transition group-hover:bg-black/25">
            <span className="grid size-11 place-items-center rounded-full bg-white/92 text-zinc-900 shadow-lg transition-transform duration-150 group-hover:scale-105">
              <Play className="ml-0.5 size-5" />
            </span>
          </span>
        </button>
      </div>
      <div className="space-y-3 p-4">
        <p className="line-clamp-2 min-h-10 text-sm font-medium leading-5">{asset.prompt || "未记录提示词"}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
          <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" />{asset.seconds || "—"} 秒 · {asset.resolution_name || "—"}</span>
          {controller.scope !== "mine" ? <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" />{asset.owner_name || asset.owner_id}</span> : null}
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">{formatDateTime(asset.created_at, { compact: true })}</p>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline" className="flex-1">
            <a href={videoDownloadURL(asset)} download><Download />下载</a>
          </Button>
          {canDeleteVideos ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
              onClick={() => void controller.remove(asset)}
              disabled={deleting}
              aria-label="删除视频"
            >
              {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
            </Button>
          ) : null}
        </div>
        {controller.scope === "mine" && canUpdateVisibility ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-full justify-center text-muted-foreground"
            disabled={updatingVisibility}
            onClick={() => void controller.setVisibility(asset, asset.visibility === "public" ? "private" : "public")}
          >
            {updatingVisibility ? <LoaderCircle className="animate-spin" /> : asset.visibility === "public" ? <Lock /> : <Globe2 />}
            {asset.visibility === "public" ? "设为私有" : "公开到视频库"}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function LibraryLoadingOrErrorState({ icon, title, detail, action }: { icon: ReactNode; title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-10 text-center text-muted-foreground shadow-2xs">
      <div className="flex size-10 items-center justify-center rounded-xl border border-border/70 bg-surface-muted">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {detail ? <p className="max-w-lg text-xs leading-5">{detail}</p> : null}
      {action}
    </div>
  );
}
