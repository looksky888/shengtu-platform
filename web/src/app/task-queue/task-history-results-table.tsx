import { Copy, History, LoaderCircle } from "lucide-react";

import { formatTaskDateTime, taskModeLabel, taskStatusLabel, taskStatusVariant } from "@/app/task-queue/task-history-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CreationTask } from "@/lib/api";

type TaskHistoryResultsTableProps = {
  items: CreationTask[];
  isLoading: boolean;
  onCopyTroubleshooting: (item: CreationTask) => void | Promise<void>;
};

export function TaskHistoryResultsTable({
  items,
  isLoading,
  onCopyTroubleshooting,
}: TaskHistoryResultsTableProps) {
  if (isLoading && items.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center gap-2 text-xs text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin text-foreground" />
        正在加载任务历史…
      </div>
    );
  }

  if (!isLoading && items.length === 0) {
    return (
      <EmptyState
        compact
        icon={History}
        title="暂无任务历史记录"
        description="调整筛选条件，或等待任务执行完成后归档显示。"
        className="border-0 bg-transparent py-12"
      />
    );
  }

  return (
    <div className="max-w-full overflow-x-auto thin-scrollbar">
      <Table className="min-w-[1040px]">
        <TableHeader className="bg-surface-muted/45 text-[11px] font-medium tracking-wide text-muted-foreground">
          <TableRow className="hover:bg-transparent">
            <TableHead>任务</TableHead>
            <TableHead>用户</TableHead>
            <TableHead>模型 / 尺寸</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>错误与排错</TableHead>
            <TableHead>时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className="text-muted-foreground transition-colors hover:bg-surface-hover/60">
              <TableCell>
                <div className="space-y-1 tabular-nums">
                  <code className="font-mono text-xs text-foreground">{item.id}</code>
                  <div className="text-xs">{taskModeLabel(item.mode)} · {item.count || 1} 张</div>
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <div className="text-xs text-foreground">{item.owner_name || "—"}</div>
                  <code className="font-mono text-[11px] tabular-nums">{item.owner_id || "—"}</code>
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1 text-xs">
                  <div className="text-foreground">{item.effective_model || item.model || "—"}</div>
                  <div className="tabular-nums">{item.size || "—"} / {item.quality || "—"}</div>
                  <div>{item.effective_provider || "—"} · {item.upstream_host || "—"}</div>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={taskStatusVariant(item.status)} className="rounded-md">{taskStatusLabel(item.status)}</Badge>
              </TableCell>
              <TableCell className="max-w-[340px]">
                <div className="space-y-1 text-xs tabular-nums">
                  <div className="line-clamp-2 text-foreground">{item.error || "—"}</div>
                  <div>错误码：{item.error_code || "—"} · HTTP {item.upstream_http_status || "—"}</div>
                  <div className="font-mono text-[11px]">Request ID：{item.upstream_request_id || "—"}</div>
                  <div>重试：{typeof item.retry_index === "number" ? item.retry_index : "—"} / {typeof item.attempt_count === "number" ? item.attempt_count : "—"}</div>
                  <div className="line-clamp-2">{item.troubleshooting || "—"}</div>
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-1 font-mono text-[11px] tabular-nums">
                  <div>创建 {formatTaskDateTime(item.created_at)}</div>
                  <div>更新 {formatTaskDateTime(item.updated_at)}</div>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button type="button" variant="outline" size="xs" onClick={() => void onCopyTroubleshooting(item)}>
                  <Copy className="size-3.5" />
                  复制排错
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
