"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";

import { buildTaskTroubleshootingText } from "@/app/task-queue/task-history-display";
import { TaskHistoryResultsTable } from "@/app/task-queue/task-history-results-table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { copyText } from "@/lib/clipboard";
import { clearAdminImageTasks, fetchAdminImageTaskLogs, type CreationTask } from "@/lib/api";

/** Historical / diagnostic task list (paginated). Shared by 任务中心「历史」Tab and legacy /image-task-logs. */
export function TaskHistoryPanel({ embedded = false, reloadKey = 0 }: { embedded?: boolean; reloadKey?: number }) {
  const [items, setItems] = useState<CreationTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [user, setUser] = useState("");
  const [model, setModel] = useState("");
  const [size, setSize] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [reloadRevision, setReloadRevision] = useState(0);
  const requestIdRef = useRef(0);
  const pageSize = 10;
  const hasFilters = q.trim() || status !== "all" || user.trim() || model.trim() || size.trim();

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    try {
      // 后端已按 created_at 新→旧排序 + 分页
      const data = await fetchAdminImageTaskLogs({ q, status, user, model, size, limit: pageSize, offset: (page - 1) * pageSize, summary: true });
      if (requestId !== requestIdRef.current) return;
      setItems(data.items);
      setTotal(data.total);
    } catch (error) {
      if (requestId === requestIdRef.current) {
        toast.error(error instanceof Error ? error.message : "加载任务历史失败");
      }
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [model, page, q, size, status, user]);

  const clearFinished = async () => {
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

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {!embedded ? (
        <>
          <PageHeader
            eyebrow="诊断"
            title="任务历史"
            actions={
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void load()} disabled={isLoading} className="h-10 rounded-lg">
                  <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />刷新
                </Button>
                <Button variant="outline" onClick={() => setClearConfirmOpen(true)} disabled={clearing || isLoading} className="h-10 rounded-lg">
                  <X className={`size-4 ${clearing ? "animate-spin" : ""}`} />清理已完成
                </Button>
              </div>
            }
          />
          <p className="text-sm text-muted-foreground">按创建时间新→旧分页；实时进度请用「任务中心 → 实时队列」。</p>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">按创建时间新→旧分页；与实时队列同源数据。</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={isLoading} className="h-9 rounded-lg">
              <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />刷新
            </Button>
            <Button variant="outline" onClick={() => setClearConfirmOpen(true)} disabled={clearing || isLoading} className="h-9 rounded-lg">
              <X className="size-4" />清理已完成
            </Button>
          </div>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-5"><div className="text-sm text-muted-foreground">当前结果</div><div className="mt-1 text-2xl font-semibold">{summary.total}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-sm text-muted-foreground">失败任务</div><div className="mt-1 text-2xl font-semibold text-rose-600">{summary.failed}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-sm text-muted-foreground">处理中</div><div className="mt-1 text-2xl font-semibold text-amber-600">{summary.running}</div></CardContent></Card>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="grid gap-2 border-b border-border px-5 py-4 xl:grid-cols-[minmax(16rem,1fr)_140px_160px_160px_140px_auto]">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="搜索任务历史" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} placeholder="搜索任务 ID、错误码、Request ID" className="h-10 rounded-lg pl-9" /></div>
            <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}><SelectTrigger aria-label="任务历史状态筛选" className="h-10 rounded-lg"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部状态</SelectItem><SelectItem value="queued">排队中</SelectItem><SelectItem value="running">处理中</SelectItem><SelectItem value="success">成功</SelectItem><SelectItem value="error">失败</SelectItem><SelectItem value="cancelled">已终止</SelectItem></SelectContent></Select>
            <Input aria-label="任务历史用户筛选" value={user} onChange={(event) => { setUser(event.target.value); setPage(1); }} placeholder="用户" className="h-10 rounded-lg" />
            <Input aria-label="任务历史模型筛选" value={model} onChange={(event) => { setModel(event.target.value); setPage(1); }} placeholder="模型" className="h-10 rounded-lg" />
            <Input aria-label="任务历史尺寸筛选" value={size} onChange={(event) => { setSize(event.target.value); setPage(1); }} placeholder="尺寸" className="h-10 rounded-lg" />
            <Button type="button" variant="outline" className="h-10 rounded-lg" disabled={!hasFilters} onClick={() => { setQ(""); setStatus("all"); setUser(""); setModel(""); setSize(""); setPage(1); }}><X className="size-4" />清除</Button>
          </div>
          <TaskHistoryResultsTable items={items} isLoading={isLoading} onCopyTroubleshooting={copyTroubleshooting} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-sm text-muted-foreground">
            <span>每页 {pageSize} 条，共 {total} 条；第 {safePage} / {totalPages} 页</span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={safePage <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</Button>
              <Button type="button" variant="outline" size="sm" disabled={safePage >= totalPages || isLoading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</Button>
            </div>
          </div>
        </CardContent>
      </Card>
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
    </div>
  );
}
