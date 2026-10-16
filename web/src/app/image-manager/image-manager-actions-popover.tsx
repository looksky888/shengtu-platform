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
  selectedItems,
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
    <Popover open={open} onOpenChange={onOpenChange}>
      <div className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-40 sm:right-6 sm:bottom-6">
        <PopoverTrigger asChild>
          <Button type="button" className="h-12 rounded-full px-4 shadow-[0_18px_50px_-24px_rgba(15,23,42,0.65)]" aria-label="打开图片操作">
            <MoreHorizontal className="size-5" />
            <span>操作</span>
            {selectedCount > 0 ? (
              <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-xs font-semibold text-white">
                {selectedCount}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" side="top" sideOffset={10} className="w-[min(calc(100vw-2rem),20rem)] p-2">
          <div className="flex flex-col gap-1">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {hasLocalFilters ? `显示 ${filteredCount} / ${totalCount} 张` : `共 ${totalCount} 张`}
            </div>
            <Button type="button" variant="ghost" className="h-10 justify-start rounded-lg px-3 text-sm" disabled={filteredCount === 0 || isMutatingImages} onClick={onToggleAll}>
              <Check className="size-4" />
              {allSelected ? "取消全选" : "全选"}
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
              <Button type="button" variant="ghost" className="h-10 justify-start rounded-lg px-3 text-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700" disabled={selectedCount === 0 || isMutatingImages} onClick={onDeleteSelected}>
                <Trash2 className="size-4" />
                删除已选 ({selectedCount})
              </Button>
            ) : null}
            <ActionButton label={`下载全部 (${filteredCount})`} loading={downloadingKey === "all"} disabled={filteredCount === 0 || isMutatingImages} onClick={onDownloadAll} />
            <Button type="button" variant="ghost" className="h-10 justify-start rounded-lg px-3 text-sm" disabled={isLoading || isMutatingImages} onClick={onRefresh}>
              <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
              刷新
            </Button>
          </div>
        </PopoverContent>
      </div>
    </Popover>
  );
}

function ActionButton({ label, loading, disabled, onClick }: { label: string; loading: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" className="h-10 justify-start rounded-lg px-3 text-sm" disabled={disabled} onClick={onClick}>
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
      {label}
    </Button>
  );
}

function VisibilityButton({ label, loading, disabled, icon, onClick }: { label: string; loading: boolean; disabled: boolean; icon: "public" | "private"; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" className="h-10 justify-start rounded-lg px-3 text-sm" disabled={disabled} onClick={onClick}>
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : icon === "public" ? <Globe2 className="size-4" /> : <Lock className="size-4" />}
      {label}
    </Button>
  );
}
