import { CheckSquare, Download, Globe2, Lock, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ImageVisibility } from "@/lib/api-types";
import { cn } from "@/lib/utils";

type AssetsBatchBarProps = {
  selectedCount: number;
  totalFilteredCount: number;
  downloadableCount: number;
  updatableVisibilityCount: number;
  deletableCount: number;
  onSelectAllVisible: () => void;
  onBatchDownload: () => void;
  onBatchVisibility: (next: ImageVisibility) => void;
  onRequestBatchDelete: () => void;
};

export function AssetsBatchBar({
  selectedCount,
  totalFilteredCount,
  downloadableCount,
  updatableVisibilityCount,
  deletableCount,
  onSelectAllVisible,
  onBatchDownload,
  onBatchVisibility,
  onRequestBatchDelete,
}: AssetsBatchBarProps) {
  if (selectedCount <= 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface px-3.5 py-2.5 shadow-xs dark:border-white/[0.08] dark:bg-[#17181c]">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        <button
          type="button"
          onClick={onSelectAllVisible}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-surface-hover"
        >
          <CheckSquare className="size-3.5" />
          <span>
            {selectedCount === totalFilteredCount ? "取消全选" : "全选当前"}
          </span>
        </button>
        <span className="text-muted-foreground">
          已选 <strong className="text-foreground">{selectedCount}</strong> 项
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          title={
            downloadableCount === 0 ? "所选素材均已过期或不可用" : undefined
          }
          className={cn(
            "h-7.5 text-xs",
            downloadableCount === 0 && "opacity-60",
          )}
          onClick={onBatchDownload}
        >
          <Download className="size-3.5" />
          <span>批量下载</span>
        </Button>

        {updatableVisibilityCount > 0 ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7.5 text-xs"
              onClick={() => onBatchVisibility("public")}
            >
              <Globe2 className="size-3.5" />
              <span>设为公开</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7.5 text-xs"
              onClick={() => onBatchVisibility("private")}
            >
              <Lock className="size-3.5" />
              <span>设为私密</span>
            </Button>
          </>
        ) : null}

        {deletableCount > 0 ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-7.5 text-xs"
            onClick={onRequestBatchDelete}
          >
            <Trash2 className="size-3.5" />
            <span>
              {deletableCount < selectedCount
                ? `删除可删项 (${deletableCount})`
                : "批量删除"}
            </span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
