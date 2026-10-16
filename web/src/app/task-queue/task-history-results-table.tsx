import { Copy, LoaderCircle } from "lucide-react";

import { formatTaskDateTime, taskModeLabel, taskStatusLabel, taskStatusVariant } from "@/app/task-queue/task-history-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  return (
    <div className="max-w-full overflow-x-auto">
      <Table className="min-w-[1180px]">
        <TableHeader>
          <TableRow>
            <TableHead>任务</TableHead>
            <TableHead>用户</TableHead>
            <TableHead>模型/尺寸</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>错误与排错</TableHead>
            <TableHead>时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                <LoaderCircle className="mr-2 inline size-4 animate-spin" />正在加载任务历史...
              </TableCell>
            </TableRow>
          ) : null}
          {!isLoading && items.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">暂无任务历史。</TableCell></TableRow>
          ) : null}
          {!isLoading ? items.map((item) => (
            <TableRow key={item.id} className="text-muted-foreground">
              <TableCell><div className="space-y-1"><code className="font-mono text-xs text-foreground">{item.id}</code><div className="text-xs">{taskModeLabel(item.mode)} · {item.count || 1} 张</div></div></TableCell>
              <TableCell><div className="space-y-1"><div className="text-sm text-foreground">{item.owner_name || "—"}</div><code className="font-mono text-xs">{item.owner_id || "—"}</code></div></TableCell>
              <TableCell><div className="space-y-1"><div>{item.effective_model || item.model || "—"}</div><div className="text-xs">{item.size || "—"} / {item.quality || "—"}</div><div className="text-xs">{item.effective_provider || "—"} · {item.upstream_host || "—"}</div></div></TableCell>
              <TableCell><Badge variant={taskStatusVariant(item.status)} className="rounded-md">{taskStatusLabel(item.status)}</Badge></TableCell>
              <TableCell className="max-w-[360px]"><div className="space-y-1"><div className="line-clamp-2 text-sm text-foreground">{item.error || "—"}</div><div className="text-xs">错误码：{item.error_code || "—"} · HTTP {item.upstream_http_status || "—"}</div><div className="text-xs">Request ID：{item.upstream_request_id || "—"}</div><div className="text-xs">重试：{typeof item.retry_index === "number" ? item.retry_index : "—"} / {typeof item.attempt_count === "number" ? item.attempt_count : "—"}</div><div className="line-clamp-2 text-xs">{item.troubleshooting || "—"}</div></div></TableCell>
              <TableCell><div className="space-y-1 text-xs"><div>创建 {formatTaskDateTime(item.created_at)}</div><div>更新 {formatTaskDateTime(item.updated_at)}</div></div></TableCell>
              <TableCell className="text-right"><Button type="button" variant="outline" size="sm" onClick={() => void onCopyTroubleshooting(item)}><Copy className="size-4" />复制排错</Button></TableCell>
            </TableRow>
          )) : null}
        </TableBody>
      </Table>
    </div>
  );
}
