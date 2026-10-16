"use client";

import { CheckSquare, Filter, Globe2, LoaderCircle, Lock, Plus, RefreshCw, Square, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { VideoLibraryGrid } from "@/app/video-library/video-library-grid";
import { VideoPreviewDialog } from "@/app/video-library/video-preview-dialog";
import { VideoLibraryTabs } from "@/app/video-library/video-library-tabs";
import { useVideoLibrary } from "@/app/video-library/use-video-library";
import { PageHeader } from "@/components/page-header";
import { MediaDeleteDialog } from "@/components/media-delete-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { hasAPIPermission } from "@/store/auth";

export default function VideoLibraryPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/video");
  const isAdmin = session?.role === "admin";
  const controller = useVideoLibrary(Boolean(session), isAdmin ? "all" : "mine");

  if (isCheckingAuth || !session) {
    return <div className="flex min-h-[40vh] items-center justify-center"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>;
  }

  const canDeleteVideos = hasAPIPermission(session, "DELETE", "/api/videos");
  const canUpdateVisibility = hasAPIPermission(session, "PATCH", "/api/videos/visibility");
  return (
    <section className="flex flex-col gap-5 pb-20 pt-4 sm:pb-24 sm:pt-6">
      <PageHeader
        eyebrow="视频资产"
        title="视频库"
        actions={(
          <>
            <Button type="button" variant="outline" onClick={() => void controller.load()} disabled={controller.loading}>
              {controller.loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}刷新
            </Button>
            <Button asChild><Link to="/video"><Plus />创作视频</Link></Button>
          </>
        )}
      />
      <VideoLibraryTabs scope={controller.scope} isAdmin={Boolean(isAdmin)} total={controller.total} onChange={controller.changeScope} />
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/70 p-2">
        <Input aria-label="搜索视频" value={controller.searchKeyword} onChange={(event) => controller.setSearchKeyword(event.target.value)} placeholder="搜索提示词、任务 ID、模型或用户" className="h-9 min-w-[220px] flex-1 rounded-xl" />
        <Select value={controller.visibilityFilter} onValueChange={(value) => controller.setVisibilityFilter(value as "all" | "private" | "public")}>
          <SelectTrigger aria-label="视频公开状态筛选" className="h-9 w-[140px] rounded-xl"><Filter className="size-3.5" /><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="private">私有</SelectItem><SelectItem value="public">已公开</SelectItem></SelectContent>
        </Select>
        <Button type="button" variant="ghost" className="h-9 rounded-xl text-xs" onClick={controller.toggleAllFiltered} disabled={!controller.filteredAssets.length}>
          {controller.allFilteredSelected ? <Square className="size-3.5" /> : <CheckSquare className="size-3.5" />}{controller.allFilteredSelected ? "取消全选" : "全选当前"}
        </Button>
        {controller.selectedAssets.length ? (
          <>
            <span className="text-xs text-muted-foreground">已选 {controller.selectedAssets.length}</span>
            {controller.scope === "mine" && canUpdateVisibility ? <Button type="button" variant="outline" className="h-9 rounded-xl text-xs" onClick={() => void controller.setSelectedVisibility("public")} disabled={Boolean(controller.visibilityMutatingID)}><Globe2 className="size-3.5" />公开</Button> : null}
            {controller.scope === "mine" && canUpdateVisibility ? <Button type="button" variant="outline" className="h-9 rounded-xl text-xs" onClick={() => void controller.setSelectedVisibility("private")} disabled={Boolean(controller.visibilityMutatingID)}><Lock className="size-3.5" />设为私有</Button> : null}
            {canDeleteVideos ? <Button type="button" variant="outline" className="h-9 rounded-xl text-xs text-rose-600" onClick={() => controller.setDeleteTargets(controller.selectedAssets)}><Trash2 className="size-3.5" />删除</Button> : null}
          </>
        ) : null}
      </div>
      {controller.searchKeyword.trim() || controller.visibilityFilter !== "all" ? <p className="-mt-2 px-1 text-xs text-muted-foreground">当前筛选显示 {controller.filteredAssets.length} / {controller.assets.length} 个已加载视频</p> : null}
      <VideoLibraryGrid controller={controller} canDeleteVideos={canDeleteVideos} canUpdateVisibility={canUpdateVisibility} onRetry={() => void controller.load()} />
      {controller.hasMore ? <div className="flex justify-center"><Button type="button" variant="outline" onClick={() => void controller.loadMore()} disabled={controller.loadingMore}>{controller.loadingMore ? <LoaderCircle className="animate-spin" /> : null}加载更多视频</Button></div> : null}
      <VideoPreviewDialog asset={controller.selectedAsset} onOpenChange={(open) => { if (!open) controller.selectAsset(null); }} />
      <MediaDeleteDialog
        open={controller.deleteTargets.length > 0}
        mediaLabel="视频"
        count={controller.deleteTargets.length}
        detail="视频文件和对应索引将被移除，删除后不可恢复。"
        isDeleting={Boolean(controller.deletingTaskID)}
        onClose={() => controller.setDeleteTargets([])}
        onConfirm={() => void controller.confirmRemove()}
      />
    </section>
  );
}
