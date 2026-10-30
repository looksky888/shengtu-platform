"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { LogDetailDialog } from "@/app/logs/log-detail-dialog";
import { LogsFilterCard } from "@/app/logs/logs-filter-card";
import { LogsTableCard } from "@/app/logs/logs-table-card";
import { detailJSON, emptyFilters, normalizeFilters } from "@/app/logs/logs-utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { fetchSystemLogs, type SystemLog, type SystemLogFilters } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { useAuthGuard } from "@/lib/use-auth-guard";

function LogsContent() {
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

  return (
    <section className="flex flex-col gap-5 pb-8">
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
