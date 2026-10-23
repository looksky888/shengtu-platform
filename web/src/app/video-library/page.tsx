"use client";

import { CheckSquare, Filter, Globe2, LoaderCircle, Lock, Plus, RefreshCw, RotateCcw, Search, Square, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";

import { VideoLibraryGrid } from "@/app/video-library/video-library-grid";
import { VideoLibraryTabs } from "@/app/video-library/video-library-tabs";
import { useVideoLibrary } from "@/app/video-library/use-video-library";
import { MediaDeleteDialog } from "@/components/media-delete-dialog";
import { MediaAssetTypeSwitcher } from "@/components/media-library-tabs";
import { PageHeader } from "@/components/page-header";
import { VideoPreviewDialog } from "@/components/video-preview-dialog";
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
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedAsset = controller.selectedAsset;
  const selectedVideo = selectedAsset ? {
    url: selectedAsset.url,
    prompt: selectedAsset.prompt,
    seconds: selectedAsset.seconds,
    resolution: selectedAsset.resolution_name,
    size: selectedAsset.size,
  } : null;
  const canDeleteVideos = hasAPIPermission(session, "DELETE", "/api/videos");
  const canUpdateVisibility = hasAPIPermission(session, "PATCH", "/api/videos/visibility");
  const hasActiveFilters = Boolean(controller.searchKeyword.trim() || controller.visibilityFilter !== "all");
  const clearFilters = () => {
    controller.setSearchKeyword("");
    controller.setVisibilityFilter("all");
  };

  return (
    <section className="flex flex-col gap-4 pb-20 sm:pb-24">
      <PageHeader
        eyebrow="创作资产库"
        title="素材中心"
        actions={(
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void controller.load()}
              disabled={controller.loading}
            >
              {controller.loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              刷新
            </Button>
            <Button asChild size="sm">
              <Link to="/video">
                <Plus className="size-3.5" />
                创作视频
              </Link>
            </Button>
          </>
        )}
      />
      <div className="flex flex-wrap items-center gap-2.5">
        <MediaAssetTypeSwitcher current="video" />
        <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
        <VideoLibraryTabs
          scope={controller.scope}
          isAdmin={Boolean(isAdmin)}
          total={controller.total}
          onChange={controller.changeScope}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-border/80 bg-surface p-3 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="搜索视频"
            value={controller.searchKeyword}
            onChange={(event) => controller.setSearchKeyword(event.target.value)}
            placeholder="搜索提示词、任务 ID、模型或用户…"
            className="h-9 rounded-lg pr-8 pl-8 text-xs"
          />
          {controller.searchKeyword ? (
            <button
              type="button"
              className="absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onClick={() => controller.setSearchKeyword("")}
              aria-label="清空搜索"
              title="清空搜索"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <Select value={controller.visibilityFilter} onValueChange={(value) => controller.setVisibilityFilter(value as "all" | "private" | "public")}>
          <SelectTrigger aria-label="视频公开状态筛选" className="h-9 w-[140px] rounded-lg text-xs">
            <Filter className="size-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="private">私有</SelectItem>
            <SelectItem value="public">已公开</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-lg px-2.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={clearFilters}
          >
            <RotateCcw className="size-3.5" />
            重置筛选
          </Button>
        ) : null}
        {controller.filteredAssets.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Button
              type="button"
              variant="ghost"
              className="h-9 rounded-lg px-2.5 text-xs"
              onClick={controller.toggleAllFiltered}
            >
              {controller.allFilteredSelected ? <Square className="size-3.5" /> : <CheckSquare className="size-3.5" />}
              {controller.allFilteredSelected ? "取消全选" : "全选当前"}
            </Button>
            {controller.selectedAssets.length ? (
              <>
                <span className="rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-foreground tabular-nums">
                  已选 {controller.selectedAssets.length}
                </span>
                {controller.scope === "mine" && canUpdateVisibility ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void controller.setSelectedVisibility("public")} disabled={Boolean(controller.visibilityMutatingID)}>
                    <Globe2 className="size-3.5" />公开
                  </Button>
                ) : null}
                {controller.scope === "mine" && canUpdateVisibility ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void controller.setSelectedVisibility("private")} disabled={Boolean(controller.visibilityMutatingID)}>
                    <Lock className="size-3.5" />设为私有
                  </Button>
                ) : null}
                {canDeleteVideos ? (
                  <Button type="button" variant="destructive-outline" size="sm" onClick={() => controller.setDeleteTargets(controller.selectedAssets)}>
                    <Trash2 className="size-3.5" />删除
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      {hasActiveFilters && controller.assets.length > 0 ? (
        <p className="-mt-2 px-1 text-xs text-muted-foreground tabular-nums">
          当前筛选显示 {controller.filteredAssets.length} / {controller.assets.length} 个已加载视频
        </p>
      ) : null}
      <VideoLibraryGrid
        controller={controller}
        canDeleteVideos={canDeleteVideos}
        canUpdateVisibility={canUpdateVisibility}
        onRetry={() => void controller.load()}
        onClearFilters={clearFilters}
      />
      {controller.hasMore ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => void controller.loadMore()} disabled={controller.loadingMore}>
            {controller.loadingMore ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            加载更多视频
          </Button>
        </div>
      ) : null}
      <VideoPreviewDialog video={selectedVideo} onOpenChange={(open) => { if (!open) controller.selectAsset(null); }} />
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
