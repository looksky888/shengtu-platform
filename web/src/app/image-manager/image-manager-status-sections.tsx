import { ArrowRight, ImageIcon, LoaderCircle, RefreshCw, RotateCcw, Search, Upload } from "lucide-react";
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
  onClearFilters?: () => void;
};

export function ImageManagerStatusSections({
  showLoading,
  showError,
  showEmpty,
  showFilteredEmpty,
  loadError,
  galleryView,
  onRetry,
  onClearFilters,
}: ImageManagerStatusSectionsProps) {
  return (
    <>
      {showLoading ? <ImageLoadingCard /> : null}
      {showError ? <ImageErrorCard loadError={loadError} onRetry={onRetry} /> : null}
      {showEmpty || showFilteredEmpty ? (
        <ImageEmptyCard
          showFilteredEmpty={showFilteredEmpty}
          galleryView={galleryView}
          onClearFilters={onClearFilters}
        />
      ) : null}
    </>
  );
}

function ImageLoadingCard() {
  return (
    <Card className="overflow-hidden rounded-[14px] border border-border/80 bg-surface shadow-2xs">
      <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div className="rounded-xl bg-surface-muted p-3.5 text-foreground ring-1 ring-border/70">
          <LoaderCircle className="size-6 animate-spin" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">正在加载图片资产</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ImageErrorCard({ loadError, onRetry }: { loadError: string; onRetry: () => void }) {
  return (
    <Card className="overflow-hidden rounded-[14px] border border-border/80 bg-surface shadow-2xs">
      <CardContent className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div className="rounded-xl bg-rose-500/10 p-3.5 text-rose-600 ring-1 ring-rose-500/15 dark:text-rose-400">
          <ImageIcon className="size-6" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">图片库加载失败</p>
          <p className="max-w-[32rem] text-xs leading-5 text-muted-foreground">{loadError}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" />
          重试
        </Button>
      </CardContent>
    </Card>
  );
}

function ImageEmptyCard({
  showFilteredEmpty,
  galleryView,
  onClearFilters,
}: {
  showFilteredEmpty: boolean;
  galleryView: ImageGalleryView;
  onClearFilters?: () => void;
}) {
  return (
    <div className="rounded-[14px] border border-border/80 bg-surface shadow-2xs">
      <EmptyState
        icon={showFilteredEmpty ? Search : ImageIcon}
        title={showFilteredEmpty ? "没有匹配筛选条件的图片" : "暂无图片资产"}
        description={
          showFilteredEmpty
            ? "尝试清空搜索词，或放宽公开状态、格式、尺寸比例与日期范围条件。"
            : galleryView === "mine"
              ? "在生图工作台完成创作或垫图重绘后，图片资产将自动归档到这里。"
              : galleryView === "all"
                ? "当前站点图库还没有已归档的图片资产，可前往工作台生成或上传参考图创作。"
                : "公开图库暂无已发布的图片，可将个人作品设为公开后展示于此。"
        }
        action={
          showFilteredEmpty ? (
            onClearFilters ? (
              <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
                <RotateCcw className="size-3.5" />
                重置筛选条件
              </Button>
            ) : undefined
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button asChild size="sm">
                <Link to="/image">
                  前往创作第一张图片
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/image">
                  <Upload className="size-3.5" />
                  上传本地图片
                </Link>
              </Button>
            </div>
          )
        }
      />
    </div>
  );
}
