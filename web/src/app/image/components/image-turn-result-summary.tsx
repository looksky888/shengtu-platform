import { Download, LoaderCircle } from "lucide-react";

import type { DownloadableImage } from "@/app/image/components/image-results-types";
import { getStatusChipClass, getTurnStatusLabel } from "@/app/image/components/image-results-utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ImageTurn } from "@/store/image-conversations";

type ImageTurnResultSummaryProps = {
  turn: ImageTurn;
  turnBusy: boolean;
  resultCount: number;
  resultSizeLabel: string;
  outcomeLabel: string;
  progressMessage: string;
  downloadableImages: DownloadableImage[];
  selectedDownloadableImages: DownloadableImage[];
  downloadingKey: string | null;
  selectedDownloadKey: string;
  allDownloadKey: string;
  onDownloadItems: (key: string, items: DownloadableImage[]) => void;
};

export function ImageTurnResultSummary({
  turn,
  turnBusy,
  resultCount,
  resultSizeLabel,
  outcomeLabel,
  progressMessage,
  downloadableImages,
  selectedDownloadableImages,
  downloadingKey,
  selectedDownloadKey,
  allDownloadKey,
  onDownloadItems,
}: ImageTurnResultSummaryProps) {
  if (turn.mode === "chat" || (resultCount === 0 && !turnBusy)) {
    return null;
  }

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground sm:gap-2 sm:text-xs">
        <span className="font-medium text-foreground">生成结果</span>
        <span className="rounded-md bg-surface-muted px-2.5 py-0.5 tabular-nums">{resultCount} 张</span>
        {turn.count !== resultCount ? <span className="rounded-md bg-surface-muted px-2.5 py-0.5 tabular-nums">目标 {turn.count} 张</span> : null}
        {resultSizeLabel ? <span className="rounded-md bg-surface-muted px-2.5 py-0.5 font-mono">{resultSizeLabel}</span> : null}
        {turn.quality ? <span className="rounded-md bg-surface-muted px-2.5 py-0.5 font-mono">Quality {turn.quality}</span> : null}
        {turn.outputFormat ? <span className="rounded-md bg-surface-muted px-2.5 py-0.5 font-mono">{turn.outputFormat.toUpperCase()}</span> : null}
        {turn.outputCompression != null && turn.outputFormat && turn.outputFormat !== "png" ? (
          <span className="rounded-md bg-surface-muted px-2.5 py-0.5 font-mono">压缩 {turn.outputCompression}</span>
        ) : null}
        {outcomeLabel ? <span className="rounded-md bg-surface-muted px-2.5 py-0.5">{outcomeLabel}</span> : null}
        <span className={cn("rounded-md px-2.5 py-0.5", getStatusChipClass(turn.status))}>{getTurnStatusLabel(turn.status)}</span>
      </div>
      {turnBusy || downloadableImages.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {turnBusy ? (
            <span className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-md border border-border/75 bg-surface-muted px-2.5 py-1 text-[11px] font-medium text-foreground/85 sm:text-xs">
              <span className="size-1.5 animate-pulse rounded-full bg-foreground" />
              {progressMessage}
            </span>
          ) : null}
          {downloadableImages.length > 0 ? (
            <>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-lg px-2.5 text-[11px]"
                disabled={selectedDownloadableImages.length === 0 || downloadingKey !== null}
                onClick={() => onDownloadItems(selectedDownloadKey, selectedDownloadableImages)}
              >
                {downloadingKey === selectedDownloadKey ? <LoaderCircle className="size-3 animate-spin" /> : <Download className="size-3" />}
                下载已选 ({selectedDownloadableImages.length})
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-lg px-2.5 text-[11px]"
                disabled={downloadingKey !== null}
                onClick={() => onDownloadItems(allDownloadKey, downloadableImages)}
              >
                {downloadingKey === allDownloadKey ? <LoaderCircle className="size-3 animate-spin" /> : <Download className="size-3" />}
                下载全部
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
