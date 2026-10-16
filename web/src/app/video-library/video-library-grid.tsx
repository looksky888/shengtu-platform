import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Clock3,
  Download,
  Film,
  LoaderCircle,
  Play,
  Trash2,
  UserRound,
  Globe2,
  Lock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateTime } from "@/lib/datetime";
import { videoDownloadURL, type VideoAsset } from "@/lib/video-task-api";

import type { VideoLibraryController } from "./use-video-library";

export function VideoLibraryGrid({
  controller,
  canDeleteVideos,
  canUpdateVisibility,
  onRetry,
}: {
  controller: VideoLibraryController;
  canDeleteVideos: boolean;
  canUpdateVisibility: boolean;
  onRetry: () => void;
}) {
  if (controller.loading && controller.assets.length === 0) {
    return <LibraryState icon={<LoaderCircle className="animate-spin" />} title="正在读取视频库" />;
  }
  if (controller.error) {
    return <LibraryState icon={<AlertCircle />} title="视频库加载失败" detail={controller.error} action={<Button type="button" variant="outline" size="sm" onClick={onRetry}>重新加载</Button>} />;
  }
  if (controller.filteredAssets.length === 0) {
    const filtered = controller.searchKeyword.trim() || controller.visibilityFilter !== "all";
    return <LibraryState icon={<Film />} title={filtered ? "没有符合筛选条件的视频" : "还没有生成视频"} detail={filtered ? "调整关键词或公开状态后重试。" : "视频生成成功后会自动归档到这里。"} action={!filtered ? <Button asChild size="sm"><Link to="/video">创作第一个视频</Link></Button> : undefined} />;
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
  const deleting = controller.deletingTaskID === asset.id;
  const updatingVisibility = controller.visibilityMutatingID === asset.id;
  return (
    <article className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_10px_30px_-24px_rgba(44,30,116,0.32)]">
      <div className="group relative aspect-video w-full bg-black text-white">
        <Checkbox
          checked={Boolean(controller.selectedIDs[asset.id])}
          onCheckedChange={() => controller.toggleSelected(asset.id)}
          onClick={(event) => event.stopPropagation()}
          className="absolute left-3 top-3 z-10 border-white bg-black/45 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-500"
          aria-label={controller.selectedIDs[asset.id] ? "取消选择视频" : "选择视频"}
        />
        <button type="button" className="absolute inset-0 block w-full" onClick={() => controller.selectAsset(asset)} aria-label={`播放视频 ${asset.task_id}`}>
          <video preload="metadata" src={asset.url} muted className="size-full object-cover" />
          <span className="absolute inset-0 grid place-items-center bg-black/15 transition group-hover:bg-black/25">
            <span className="grid size-11 place-items-center rounded-full bg-white/90 text-stone-900 shadow-lg">
              <Play className="ml-0.5 size-5" />
            </span>
          </span>
        </button>
      </div>
      <div className="space-y-3 p-4">
        <p className="line-clamp-2 min-h-10 text-sm font-medium leading-5">{asset.prompt || "未记录提示词"}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" />{asset.seconds || "—"} 秒 · {asset.resolution_name || "—"}</span>
          {controller.scope !== "mine" ? <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" />{asset.owner_name || asset.owner_id}</span> : null}
        </div>
        <p className="text-xs text-muted-foreground">{formatDateTime(asset.created_at, { compact: true })}</p>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline" className="flex-1">
            <a href={videoDownloadURL(asset)} download><Download />下载</a>
          </Button>
          {canDeleteVideos ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-rose-600 hover:text-rose-700"
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

function LibraryState({ icon, title, detail, action }: { icon: ReactNode; title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed px-4 text-center text-muted-foreground">
      <span>{icon}</span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {detail ? <p className="max-w-lg text-xs leading-5">{detail}</p> : null}
      {action}
    </div>
  );
}
