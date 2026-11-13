"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Copy, LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { LogDetailDialog } from "@/app/logs/log-detail-dialog";
import { LogsFilterCard } from "@/app/logs/logs-filter-card";
import { LogsTableCard } from "@/app/logs/logs-table-card";
import {
  actorText,
  detailJSON,
  detailLabel,
  emptyFilters,
  formatDetailValue,
  formatDuration,
  getExtraDetailEntries,
  getPrimaryDetailEntries,
  getUrls,
  levelBadgeVariant,
  logLevel,
  moduleText,
  normalizeFilters,
  pathText,
  statusBadgeVariant,
  statusText,
} from "@/app/logs/logs-utils";
import { AdminSlideDrawer } from "@/components/admin";
import { ImageLightbox } from "@/components/image-lightbox";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchSystemLogs, type SystemLog, type SystemLogFilters } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { useAuthGuard } from "@/lib/use-auth-guard";

export function LogsContent({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState<SystemLog[]>([]);
  const [filters, setFilters] = useState<SystemLogFilters>(emptyFilters);
  const [query, setQuery] = useState<SystemLogFilters>(emptyFilters);
  const [detailLog, setDetailLog] = useState<SystemLog | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const logsRequestSeq = useRef(0);
  const logsAbortRef = useRef<AbortController | null>(null);
  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const currentRows = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  const loadLogs = useCallback(async (nextQuery: SystemLogFilters) => {
    logsAbortRef.current?.abort();
    const controller = new AbortController();
    logsAbortRef.current = controller;
    const seq = ++logsRequestSeq.current;
    setIsLoading(true);
    try {
      const data = await fetchSystemLogs(nextQuery, { signal: controller.signal });
      if (seq !== logsRequestSeq.current) return;
      setItems(data.items);
      setPage(1);
    } catch (error) {
      if (controller.signal.aborted || seq !== logsRequestSeq.current) return;
      toast.error(error instanceof Error ? error.message : "加载日志失败");
    } finally {
      if (seq === logsRequestSeq.current) setIsLoading(false);
    }
  }, []);

  const updateFilter = (key: keyof SystemLogFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuery(normalizeFilters(filters));
  };

  const clearFilters = () => {
    setFilters(emptyFilters);
    setQuery(emptyFilters);
  };

  const openDetail = (item: SystemLog) => {
    setDetailLog(item);
    setDetailOpen(true);
  };

  const handleCopyDetailJSON = async () => {
    try {
      await copyText(detailJSON(detailLog));
      toast.success("日志详情已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  useEffect(() => {
    void loadLogs(query);
  }, [loadLogs, query]);

  useEffect(
    () => () => {
      logsAbortRef.current?.abort();
    },
    [],
  );

  const hasActiveFilters = useMemo(() => {
    const normalized = normalizeFilters(filters);
    const activeQuery = normalizeFilters(query);
    return [normalized, activeQuery].some(
      (f) =>
        Boolean(f.summary) ||
        Boolean(f.module) ||
        Boolean(f.username) ||
        Boolean(f.operation_type) ||
        Boolean(f.ip_address) ||
        (f.method && f.method !== "all") ||
        (f.status && f.status !== "all") ||
        (f.log_level && f.log_level !== "all") ||
        Boolean(f.start_date) ||
        Boolean(f.end_date),
    );
  }, [filters, query]);

  const detailUrls = getUrls(detailLog);
  const detailImages = detailUrls.map((url, index) => ({ id: `${index}`, src: url }));
  const primaryEntries = getPrimaryDetailEntries(detailLog);
  const extraEntries = getExtraDetailEntries(detailLog);

  return (
    <section className="flex flex-col gap-4 pb-6">
      {!embedded ? (
        <PageHeader
          eyebrow="系统与治理"
          title="系统日志"
          description="检索审计轨迹、接口响应耗时与异常事件，点击任意记录即可查看完整请求上下文。"
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadLogs(query)}
              disabled={isLoading}
            >
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
              刷新
            </Button>
          }
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[12px] text-[var(--admin-text-muted)]">
            共检索到 <span className="font-mono font-semibold text-[var(--admin-text)]">{items.length}</span> 条请求与审计记录 · 点击任意记录打开右侧详情抽屉查看完整 JSON
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadLogs(query)}
            disabled={isLoading}
          >
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>
      )}

      <LogsFilterCard
        filters={filters}
        isLoading={isLoading}
        hasActiveFilters={hasActiveFilters}
        onSubmit={handleSearch}
        onUpdateFilter={updateFilter}
        onClearFilters={clearFilters}
      />
      <LogsTableCard
        items={items}
        currentRows={currentRows}
        safePage={safePage}
        pageCount={pageCount}
        isLoading={isLoading}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        onOpenDetail={openDetail}
        onPreviousPage={() => setPage((value) => Math.max(1, value - 1))}
        onNextPage={() => setPage((value) => Math.min(pageCount, value + 1))}
      />

      {embedded ? (
        <>
          <AdminSlideDrawer
            open={detailOpen}
            onOpenChange={setDetailOpen}
            title="系统日志详情"
            description={detailLog?.time || "-"}
            widthClassName="w-[min(560px,100vw)]"
            footer={
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] text-[var(--admin-text-muted)]">
                  {moduleText(detailLog)} · {pathText(detailLog)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopyDetailJSON()}
                >
                  <Copy className="size-3.5" />
                  复制 JSON
                </Button>
              </div>
            }
          >
            {detailLog ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="rounded-md">{moduleText(detailLog)}</Badge>
                  <Badge variant={statusBadgeVariant(detailLog)} className="rounded-md">{statusText(detailLog)}</Badge>
                  <Badge variant={levelBadgeVariant(logLevel(detailLog))} className="rounded-md">{logLevel(detailLog)}</Badge>
                  <span className="font-mono text-[11.5px] text-[var(--admin-text-muted)]">{formatDuration(detailLog)}</span>
                </div>

                <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)] p-3">
                  <div className="text-[13px] font-medium text-[var(--admin-text)]">
                    {detailLog.summary || "-"}
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-2.5 text-[12px]">
                    <div>
                      <span className="text-[var(--admin-text-muted)]">操作人：</span>
                      <span className="font-medium text-[var(--admin-text)]">
                        {actorText(detailLog).trim().toLowerCase() === "anonymous"
                          ? "匿名访客 (anonymous)"
                          : actorText(detailLog)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--admin-text-muted)]">接口：</span>
                      <span className="font-mono text-[var(--admin-text)]">{pathText(detailLog)}</span>
                    </div>
                  </div>
                </div>

                {typeof detailLog.detail?.error === "string" && detailLog.detail.error ? (
                  <div className="space-y-1.5">
                    <div className="text-[12px] font-semibold text-[var(--admin-danger)]">错误信息</div>
                    <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-[11.5px] leading-5 text-rose-700 dark:text-rose-300">
                      {detailLog.detail.error}
                    </pre>
                  </div>
                ) : null}

                {primaryEntries.length > 0 || extraEntries.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="text-[12px] font-semibold text-[var(--admin-text)]">关键字段</div>
                    <div className="divide-y divide-[var(--admin-border)] rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)]">
                      {[...primaryEntries, ...extraEntries].map(([key, value]) => (
                        <div key={key} className="flex items-start justify-between gap-3 px-3 py-2 text-[12px]">
                          <span className="shrink-0 text-[var(--admin-text-muted)]">{detailLabel(key)}</span>
                          <span className="min-w-0 break-all text-right font-mono text-[var(--admin-text)]">
                            {formatDetailValue(key, value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {detailUrls.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-[var(--admin-text)]">关联图片预览</span>
                      <span className="text-[11px] text-[var(--admin-text-muted)]">{detailUrls.length} 张</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {detailUrls.map((url, index) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => {
                            setLightboxIndex(index);
                            setLightboxOpen(true);
                          }}
                          className="overflow-hidden rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-2)]"
                        >
                          <img src={url} alt="" className="aspect-square h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <div className="text-[12px] font-semibold text-[var(--admin-text)]">完整 JSON</div>
                  <pre className="max-h-72 overflow-auto rounded-lg border border-[var(--admin-border)] bg-[var(--admin-bg)] p-3 font-mono text-[11.5px] leading-5 text-[var(--admin-text)]">
                    {detailJSON(detailLog)}
                  </pre>
                </div>
              </div>
            ) : null}
          </AdminSlideDrawer>
          <ImageLightbox
            images={detailImages}
            currentIndex={lightboxIndex}
            open={lightboxOpen}
            onOpenChange={setLightboxOpen}
            onIndexChange={setLightboxIndex}
          />
        </>
      ) : (
        <LogDetailDialog
          detailLog={detailLog}
          open={detailOpen}
          lightboxIndex={lightboxIndex}
          lightboxOpen={lightboxOpen}
          onOpenChange={setDetailOpen}
          onCopyJSON={() => void handleCopyDetailJSON()}
          onLightboxOpenChange={setLightboxOpen}
          onLightboxIndexChange={setLightboxIndex}
          onOpenLightboxImage={(index) => {
            setLightboxIndex(index);
            setLightboxOpen(true);
          }}
        />
      )}
    </section>
  );
}

export default function LogsPage() {
  const { isCheckingAuth, session } = useAuthGuard(undefined, "/logs");
  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <LogsContent />;
}
