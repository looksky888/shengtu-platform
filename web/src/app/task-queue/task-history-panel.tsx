"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";

import { buildTaskTroubleshootingText } from "@/app/task-queue/task-history-display";
import { TaskHistoryResultsTable } from "@/app/task-queue/task-history-results-table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { copyText } from "@/lib/clipboard";
import { clearAdminImageTasks, fetchAdminImageTaskLogs, type CreationTask } from "@/lib/api";

const FILTER_DEBOUNCE_MS = 250;

/** Historical / diagnostic task list (paginated) in 任务中心「任务历史」Tab. */
export function TaskHistoryPanel({
  reloadKey = 0,
  canManageTasks = false,
}: {
  reloadKey?: number;
  canManageTasks?: boolean;
}) {
  const [items, setItems] = useState<CreationTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [user, setUser] = useState("");
  const [model, setModel] = useState("");
  const [size, setSize] = useState("");
  const [debouncedFilters, setDebouncedFilters] = useState({
    q: "",
    user: "",
    model: "",
    size: "",
  });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [reloadRevision, setReloadRevision] = useState(0);
  const requestIdRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const pageSize = 10;
  const hasFilters = q.trim() || status !== "all" || user.trim() || model.trim() || size.trim();

  useEffect(() => {
    const next = {
      q: q.trim(),
      user: user.trim(),
      model: model.trim(),
      size: size.trim(),
    };
    const timer = window.setTimeout(() => {
      setDebouncedFilters((prev) => {
        if (
          prev.q === next.q &&
          prev.user === next.user &&
          prev.model === next.model &&
          prev.size === next.size
        ) {
          return prev;
        }
        setPage(1);
        return next;
      });
    }, FILTER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [model, q, size, user]);

  const load = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    try {
      // 后端已按 created_at 新→旧排序 + 分页
      const data = await fetchAdminImageTaskLogs(
        {
          q: debouncedFilters.q,
          status,
          user: debouncedFilters.user,
          model: debouncedFilters.model,
          size: debouncedFilters.size,
          limit: pageSize,
          offset: (page - 1) * pageSize,
          summary: true,
        },
        { signal: controller.signal },
      );
      if (requestId !== requestIdRef.current) return;
      setItems(data.items);
      setTotal(data.total);
    } catch (error) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      toast.error(error instanceof Error ? error.message : "加载任务历史失败");
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [debouncedFilters, page, status]);

  useEffect(() => () => loadAbortRef.current?.abort(), []);

  const clearFinished = async () => {
    if (!canManageTasks) {
      toast.error("没有清理任务权限");
      return;
    }
    setClearing(true);
    try {
      const result = await clearAdminImageTasks("finished");
      toast.success(`已清理 ${result.removed} 条，剩余 ${result.remaining} 条`);
      setClearConfirmOpen(false);
      setPage(1);
      setReloadRevision((value) => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "清理失败");
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => { void load(); }, [load, reloadRevision, reloadKey]);

  const summary = useMemo(() => ({
    total,
    failed: items.filter((item) => item.status === "error").length,
    running: items.filter((item) => item.status === "queued" || item.status === "running").length,
  }), [items, total]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const copyTroubleshooting = async (item: CreationTask) => {
    try {
      await copyText(buildTaskTroubleshootingText(item));
      toast.success("已复制排错信息");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const resetAllFilters = () => {
    setQ("");
    setUser("");
    setModel("");
    setSize("");
    setDebouncedFilters({ q: "", user: "", model: "", size: "" });
    setStatus("all");
    setPage(1);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[14px] border border-border/80 bg-surface p-3.5 shadow-2xs">
          <div className="text-xs font-medium text-muted-foreground">匹配结果</div>
          <div className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{summary.total}</div>
        </div>
        <div className="rounded-[14px] border border-border/80 bg-surface p-3.5 shadow-2xs">
          <div className="text-xs font-medium text-muted-foreground">本页失败</div>
          <div className="mt-1.5 text-2xl font-semibold tracking-tight text-rose-600 dark:text-rose-400 tabular-nums">{summary.failed}</div>
        </div>
        <div className="rounded-[14px] border border-border/80 bg-surface p-3.5 shadow-2xs">
          <div className="text-xs font-medium text-muted-foreground">本页处理中</div>
          <div className="mt-1.5 text-2xl font-semibold tracking-tight text-amber-600 dark:text-amber-400 tabular-nums">{summary.running}</div>
        </div>
      </div>

      <Card className="overflow-hidden rounded-[14px] border border-border/80 bg-surface shadow-2xs">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/75 p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="搜索任务历史" value={q} onChange={(event) => setQ(event.target.value)} placeholder="搜索任务 ID、错误码、Request ID…" className="h-9 rounded-lg pl-8 text-xs" />
            </div>
            <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
              <SelectTrigger aria-label="任务历史状态筛选" className="h-9 w-32 rounded-lg text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="queued">排队中</SelectItem>
                <SelectItem value="running">处理中</SelectItem>
                <SelectItem value="success">成功</SelectItem>
                <SelectItem value="error">失败</SelectItem>
                <SelectItem value="cancelled">已终止</SelectItem>
              </SelectContent>
            </Select>
            <Input aria-label="任务历史用户筛选" value={user} onChange={(event) => setUser(event.target.value)} placeholder="用户" className="h-9 w-32 rounded-lg text-xs" />
            <Input aria-label="任务历史模型筛选" value={model} onChange={(event) => setModel(event.target.value)} placeholder="模型" className="h-9 w-36 rounded-lg text-xs" />
            <Input aria-label="任务历史尺寸筛选" value={size} onChange={(event) => setSize(event.target.value)} placeholder="尺寸" className="h-9 w-28 rounded-lg text-xs" />
            {hasFilters ? (
              <Button type="button" variant="ghost" size="sm" onClick={resetAllFilters}>
                <X className="size-3.5" />清除
              </Button>
            ) : null}
            {canManageTasks ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setClearConfirmOpen(true)} disabled={clearing || isLoading} className="ml-auto">
                清理已完成
              </Button>
            ) : null}
          </div>
          <TaskHistoryResultsTable items={items} isLoading={isLoading} onCopyTroubleshooting={copyTroubleshooting} />
          {items.length > 0 || total > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
              <span>共 {total} 条记录 · 第 {safePage} / {totalPages} 页（每页 {pageSize} 条）</span>
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="outline" size="xs" disabled={safePage <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button>
                <Button type="button" variant="outline" size="xs" disabled={safePage >= totalPages || isLoading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {canManageTasks ? (
        <ConfirmDialog
          open={clearConfirmOpen}
          title="清理已完成任务"
          description="确定清理任务历史中已完成的记录（成功、失败、已取消）吗？运行中和排队中的任务不会删除。"
          confirmLabel="确认清理"
          pendingLabel="清理中…"
          destructive
          pending={clearing}
          onClose={() => setClearConfirmOpen(false)}
          onConfirm={() => void clearFinished()}
        />
      ) : null}
    </div>
  );
}
