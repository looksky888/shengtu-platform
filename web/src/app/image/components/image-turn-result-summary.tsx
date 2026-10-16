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
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#45515e] sm:gap-2 sm:text-xs">
        <span className="font-medium text-[#222222]">生成结果</span>
        <span className="rounded-full bg-[#f0f0f0] px-3 py-1">{resultCount} 张</span>
        {turn.count !== resultCount ? <span className="rounded-full bg-[#f0f0f0] px-3 py-1">目标 {turn.count} 张</span> : null}
        {resultSizeLabel ? <span className="rounded-full bg-[#f0f0f0] px-3 py-1">{resultSizeLabel}</span> : null}
        {turn.quality ? <span className="rounded-full bg-[#f0f0f0] px-3 py-1">Quality {turn.quality}</span> : null}
        {turn.outputFormat ? <span className="rounded-full bg-[#f0f0f0] px-3 py-1">{turn.outputFormat.toUpperCase()}</span> : null}
        {turn.outputCompression != null && turn.outputFormat && turn.outputFormat !== "png" ? (
          <span className="rounded-full bg-[#f0f0f0] px-3 py-1">压缩 {turn.outputCompression}</span>
        ) : null}
        {outcomeLabel ? <span className="rounded-full bg-[#f0f0f0] px-3 py-1">{outcomeLabel}</span> : null}
        <span className={cn("rounded-full px-3 py-1", getStatusChipClass(turn.status))}>{getTurnStatusLabel(turn.status)}</span>
      </div>
      {turnBusy || downloadableImages.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {turnBusy ? (
            <span className="w-fit whitespace-nowrap rounded-full bg-amber-50 px-3 py-1 text-[11px] text-amber-700 sm:text-xs">
              {progressMessage}
            </span>
          ) : null}
          {downloadableImages.length > 0 ? (
            <>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-full bg-[#1456f0] px-2.5 text-[11px] text-white shadow-sm hover:bg-[#2563eb]"
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
                className="h-8 rounded-full border-[#e5e7eb] bg-white px-2.5 text-[11px] text-[#45515e] shadow-sm hover:bg-black/[0.05]"
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
