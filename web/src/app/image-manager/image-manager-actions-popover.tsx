import { Check, Download, Globe2, LoaderCircle, Lock, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ImageVisibility, ManagedImage } from "@/lib/api";
import type { ImageGalleryView } from "@/lib/image-manager-cache";

type ImageManagerActionsPopoverProps = {
  open: boolean;
  selectedCount: number;
  totalCount: number;
  filteredCount: number;
  hasLocalFilters: boolean;
  allSelected: boolean;
  galleryView: ImageGalleryView;
  selectedItems: ManagedImage[];
  selectedPrivateItems: ManagedImage[];
  selectedPublicItems: ManagedImage[];
  canDeleteImages: boolean;
  isLoading: boolean;
  isMutatingImages: boolean;
  downloadingKey: string | null;
  visibilityMutatingPath: string | null;
  onOpenChange: (open: boolean) => void;
  onToggleAll: () => void;
  onBulkVisibilityChange: (items: ManagedImage[], visibility: ImageVisibility) => void;
  onDownloadSelected: () => void;
  onDownloadAll: () => void;
  onDeleteSelected: () => void;
  onRefresh: () => void;
};

export function ImageManagerActionsPopover({
  open,
  selectedCount,
  totalCount,
  filteredCount,
  hasLocalFilters,
  allSelected,
  galleryView,
  selectedPrivateItems,
  selectedPublicItems,
  canDeleteImages,
  isLoading,
  isMutatingImages,
  downloadingKey,
  visibilityMutatingPath,
  onOpenChange,
  onToggleAll,
  onBulkVisibilityChange,
  onDownloadSelected,
  onDownloadAll,
  onDeleteSelected,
  onRefresh,
}: ImageManagerActionsPopoverProps) {
  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="h-9 rounded-lg px-3 text-xs" aria-label="打开图片操作">
            <MoreHorizontal className="size-4" />
            <span>批量操作</span>
            {selectedCount > 0 ? (
              <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-md bg-surface-muted px-1.5 text-xs font-semibold text-foreground ring-1 ring-border/70 tabular-nums">
                {selectedCount}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-[min(calc(100vw-2rem),18rem)] rounded-xl p-1.5">
          <div className="flex flex-col gap-0.5">
            <div className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground tabular-nums">
              {hasLocalFilters ? `显示 ${filteredCount} / ${totalCount} 张` : `共 ${totalCount} 张`}
            </div>
            <Button type="button" variant="ghost" className="h-9 justify-start rounded-lg px-2.5 text-xs" disabled={filteredCount === 0 || isMutatingImages} onClick={onToggleAll}>
              <Check className="size-4" />
              {allSelected ? "取消全选" : "全选当前页"}
            </Button>
            {galleryView === "mine" ? (
              <>
                <VisibilityButton
                  label={`公开已选 (${selectedPrivateItems.length})`}
                  loading={visibilityMutatingPath === "bulk:public"}
                  disabled={selectedPrivateItems.length === 0 || isMutatingImages}
                  icon="public"
                  onClick={() => onBulkVisibilityChange(selectedPrivateItems, "public")}
                />
                <VisibilityButton
                  label={`设为私有 (${selectedPublicItems.length})`}
                  loading={visibilityMutatingPath === "bulk:private"}
                  disabled={selectedPublicItems.length === 0 || isMutatingImages}
                  icon="private"
                  onClick={() => onBulkVisibilityChange(selectedPublicItems, "private")}
                />
              </>
            ) : null}
            <ActionButton label={`下载已选 (${selectedCount})`} loading={downloadingKey === "selected"} disabled={selectedCount === 0 || isMutatingImages} onClick={onDownloadSelected} />
            {canDeleteImages ? (
              <Button type="button" variant="ghost" className="h-9 justify-start rounded-lg px-2.5 text-xs text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300" disabled={selectedCount === 0 || isMutatingImages} onClick={onDeleteSelected}>
                <Trash2 className="size-4" />
                删除已选 ({selectedCount})
              </Button>
            ) : null}
            <ActionButton label={`下载全部 (${filteredCount})`} loading={downloadingKey === "all"} disabled={filteredCount === 0 || isMutatingImages} onClick={onDownloadAll} />
            <Button type="button" variant="ghost" className="h-9 justify-start rounded-lg px-2.5 text-xs" disabled={isLoading || isMutatingImages} onClick={onRefresh}>
              <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {selectedCount > 0 ? (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-1.5 rounded-xl border border-border/80 bg-card/95 px-3 py-2 shadow-lg backdrop-blur-md">
          <span className="px-1.5 text-xs font-medium text-foreground tabular-nums">已选 {selectedCount} 项</span>
          <Button type="button" variant="outline" className="h-8 rounded-lg px-2.5 text-xs" disabled={isMutatingImages} onClick={onToggleAll}>
            <Check className="size-3.5" />
            {allSelected ? "取消全选" : "全选"}
          </Button>
          <Button type="button" variant="outline" className="h-8 rounded-lg px-2.5 text-xs" disabled={isMutatingImages || downloadingKey === "selected"} onClick={onDownloadSelected}>
            {downloadingKey === "selected" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            下载
          </Button>
          {canDeleteImages ? (
            <Button type="button" variant="destructive-outline" className="h-8 rounded-lg px-2.5 text-xs" disabled={isMutatingImages} onClick={onDeleteSelected}>
              <Trash2 className="size-3.5" />
              删除
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function ActionButton({ label, loading, disabled, onClick }: { label: string; loading: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" className="h-9 justify-start rounded-lg px-2.5 text-xs tabular-nums" disabled={disabled} onClick={onClick}>
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
      {label}
    </Button>
  );
}

function VisibilityButton({ label, loading, disabled, icon, onClick }: { label: string; loading: boolean; disabled: boolean; icon: "public" | "private"; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" className="h-9 justify-start rounded-lg px-2.5 text-xs tabular-nums" disabled={disabled} onClick={onClick}>
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : icon === "public" ? <Globe2 className="size-4" /> : <Lock className="size-4" />}
      {label}
    </Button>
  );
}
