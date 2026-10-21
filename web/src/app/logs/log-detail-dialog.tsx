import { Copy } from "lucide-react";

import { ImageLightbox } from "@/components/image-lightbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SystemLog } from "@/lib/api";
import {
  actorText,
  detailJSON,
  detailLabel,
  formatDetailValue,
  formatDuration,
  getExtraDetailEntries,
  getPrimaryDetailEntries,
  getUrls,
  levelBadgeVariant,
  logLevel,
  moduleText,
  pathText,
  statusBadgeVariant,
  statusText,
} from "@/app/logs/logs-utils";

type LogDetailDialogProps = {
  detailLog: SystemLog | null;
  open: boolean;
  lightboxIndex: number;
  lightboxOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCopyJSON: () => void;
  onLightboxOpenChange: (open: boolean) => void;
  onLightboxIndexChange: (index: number) => void;
  onOpenLightboxImage: (index: number) => void;
};

export function LogDetailDialog({
  detailLog,
  open,
  lightboxIndex,
  lightboxOpen,
  onOpenChange,
  onCopyJSON,
  onLightboxOpenChange,
  onLightboxIndexChange,
  onOpenLightboxImage,
}: LogDetailDialogProps) {
  const detailUrls = getUrls(detailLog);
  const detailImages = detailUrls.map((url, index) => ({ id: `${index}`, src: url }));
  const primaryEntries = getPrimaryDetailEntries(detailLog);
  const extraEntries = getExtraDetailEntries(detailLog);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] w-[min(94vw,980px)] grid-rows-none flex-col gap-0 overflow-hidden rounded-xl p-0">
          <DialogHeader className="border-b border-border px-6 py-5 pr-12">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                <DialogTitle>{"日志详情"}</DialogTitle>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary" className="rounded-md">{moduleText(detailLog)}</Badge>
                  <Badge variant={statusBadgeVariant(detailLog)} className="rounded-md">{statusText(detailLog)}</Badge>
                  <Badge variant={levelBadgeVariant(logLevel(detailLog))} className="rounded-md">{logLevel(detailLog)}</Badge>
                  <span>{detailLog?.time || "-"}</span>
                </div>
              </div>
              <Button type="button" variant="outline" className="h-9 rounded-lg px-3" onClick={onCopyJSON}>
                <Copy className="size-4" />
                {"复制 JSON"}
              </Button>
            </div>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-6 py-5">
            <div className="space-y-5">
              <section className="space-y-3">
                <div className="text-sm font-semibold text-foreground">{"摘要"}</div>
                <div className="rounded-xl border border-border bg-muted/35 p-4">
                  <div className="text-sm font-medium text-foreground">{detailLog?.summary || "-"}</div>
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                    <SummaryItem label={"操作人"} value={actorText(detailLog)} />
                    <SummaryItem label={"模块"} value={moduleText(detailLog)} />
                    <SummaryItem label={"接口"} value={pathText(detailLog)} />
                    <SummaryItem label={"耗时"} value={formatDuration(detailLog)} />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-sm font-semibold text-foreground">{"关键字段"}</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {[...primaryEntries, ...extraEntries].map(([key, value]) => (
                    <div key={key} className="flex min-w-0 items-start justify-between gap-4 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                      <span className="shrink-0 text-muted-foreground">{detailLabel(key)}</span>
                      <span className="min-w-0 break-words text-right font-medium text-foreground">{formatDetailValue(key, value)}</span>
                    </div>
                  ))}
                  {primaryEntries.length === 0 && extraEntries.length === 0 ? (
                    <div className="rounded-lg border border-border bg-background px-3 py-6 text-center text-sm text-muted-foreground md:col-span-2">
                      {"没有可展示的字段"}
                    </div>
                  ) : null}
                </div>
              </section>

              {typeof detailLog?.detail?.error === "string" && detailLog.detail.error ? (
                <section className="space-y-3">
                  <div className="text-sm font-semibold text-foreground">{"错误信息"}</div>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs leading-6 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                    {detailLog.detail.error}
                  </pre>
                </section>
              ) : null}

              {detailUrls.length ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">{"图片预览"}</div>
                    <Badge variant="secondary" className="rounded-md">{detailUrls.length}{" 张"}</Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {detailUrls.map((url, index) => (
                      <button
                        key={url}
                        type="button"
                        className="group overflow-hidden rounded-xl border border-border bg-muted text-left"
                        onClick={() => onOpenLightboxImage(index)}
                      >
                        <div className="aspect-square overflow-hidden bg-muted">
                          <img src={url} alt="" className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]" />
                        </div>
                        <div className="truncate border-t border-border px-3 py-2 text-xs text-muted-foreground">{url}</div>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="space-y-3">
                <div className="text-sm font-semibold text-foreground">{"详情 JSON"}</div>
                <pre className="max-h-72 overflow-auto rounded-xl border border-border bg-muted/40 p-4 text-xs leading-6 text-foreground">
                  {detailJSON(detailLog)}
                </pre>
              </section>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ImageLightbox
        images={detailImages}
        currentIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={onLightboxOpenChange}
        onIndexChange={onLightboxIndexChange}
      />
    </>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-medium text-foreground">{value}</div>
    </div>
  );
}
