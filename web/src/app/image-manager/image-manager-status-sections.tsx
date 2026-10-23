import { ImageIcon, LoaderCircle, Plus, RefreshCw, Search } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { ImageGalleryView } from "@/lib/image-manager-cache";

type ImageManagerStatusSectionsProps = {
  showLoading: boolean;
  showError: boolean;
  showEmpty: boolean;
  showFilteredEmpty: boolean;
  loadError: string;
  galleryView: ImageGalleryView;
  onRetry: () => void;
};

export function ImageManagerStatusSections({
  showLoading,
  showError,
  showEmpty,
  showFilteredEmpty,
  loadError,
  galleryView,
  onRetry,
}: ImageManagerStatusSectionsProps) {
  return (
    <>
      {showLoading ? <ImageLoadingCard /> : null}
      {showError ? <ImageErrorCard loadError={loadError} onRetry={onRetry} /> : null}
      {showEmpty || showFilteredEmpty ? (
        <ImageEmptyCard showFilteredEmpty={showFilteredEmpty} galleryView={galleryView} />
      ) : null}
    </>
  );
}

function ImageLoadingCard() {
  return (
    <Card className="overflow-hidden rounded-xl border border-border/70 shadow-2xs">
      <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div className="rounded-xl bg-surface-muted p-4 text-foreground ring-1 ring-border/70">
          <LoaderCircle className="size-7 animate-spin" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">正在加载图片</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ImageErrorCard({ loadError, onRetry }: { loadError: string; onRetry: () => void }) {
  return (
    <Card className="overflow-hidden rounded-xl border border-border/70 shadow-2xs">
      <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div className="rounded-xl bg-rose-500/10 p-4 text-rose-600 ring-1 ring-rose-500/15 dark:text-rose-400">
          <ImageIcon className="size-7" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">图片库加载失败</p>
          <p className="max-w-[32rem] text-sm leading-6 text-muted-foreground">{loadError}</p>
        </div>
        <Button variant="outline" className="h-9 rounded-lg px-3" onClick={onRetry}>
          <RefreshCw className="size-4" />
          重试
        </Button>
      </CardContent>
    </Card>
  );
}

function ImageEmptyCard({ showFilteredEmpty, galleryView }: { showFilteredEmpty: boolean; galleryView: ImageGalleryView }) {
  return (
    <EmptyState
      icon={showFilteredEmpty ? Search : ImageIcon}
      title={showFilteredEmpty ? "没有匹配的图片" : "暂无图片"}
      description={
        showFilteredEmpty
          ? "调整关键词、状态、格式或方向筛选后再试。"
          : galleryView === "mine"
            ? "图片生成成功后会自动进入个人图库。"
            : galleryView === "all"
              ? "当前没有可展示的图片。"
              : "公开图库暂无公开图片。"
      }
      action={
        !showFilteredEmpty && galleryView === "mine" ? (
          <Button asChild size="sm" className="rounded-lg">
            <Link to="/studio">
              <Plus className="size-3.5" />
              前往创作图片
            </Link>
          </Button>
        ) : undefined
      }
    />
  );
}
