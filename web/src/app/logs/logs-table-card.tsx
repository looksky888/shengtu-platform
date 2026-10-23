import { ChevronLeft, ChevronRight, LoaderCircle, ScrollText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SystemLog } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  actorText,
  detailText,
  formatDuration,
  levelBadgeVariant,
  logLevel,
  moduleText,
  pathText,
  statusBadgeVariant,
  statusText,
} from "@/app/logs/logs-utils";

function resolveLogMethodClass(method: string) {
  switch (method.toUpperCase()) {
    case "GET":
      return "border-border/80 bg-surface-muted text-foreground";
    case "POST":
      return "border-foreground/20 bg-foreground/[0.06] text-foreground dark:bg-white/[0.08]";
    case "PUT":
    case "PATCH":
      return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "DELETE":
      return "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    default:
      return "border-border bg-surface-muted text-muted-foreground";
  }
}

type LogsTableCardProps = {
  items: SystemLog[];
  currentRows: SystemLog[];
  safePage: number;
  pageCount: number;
  isLoading: boolean;
  onRefresh?: () => void;
  onOpenDetail: (item: SystemLog) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

export function LogsTableCard({
  items,
  currentRows,
  safePage,
  pageCount,
  isLoading,
  onOpenDetail,
  onPreviousPage,
  onNextPage,
}: LogsTableCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xs">
      <div className="overflow-x-auto">
        <Table className="min-w-[1040px]">
          <TableHeader className="bg-surface-subtle/80 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <TableRow className="border-border/70 hover:bg-transparent">
              <TableHead>时间</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead>模块</TableHead>
              <TableHead>接口</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>耗时</TableHead>
              <TableHead>摘要</TableHead>
              <TableHead className="w-28 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && currentRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="h-28 text-center text-sm text-muted-foreground">
                  <LoaderCircle className="mr-2 inline size-4 animate-spin" />
                  正在加载日志...
                </TableCell>
              </TableRow>
            ) : !isLoading && items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="p-0">
                  <EmptyState
                    compact
                    icon={ScrollText}
                    title="暂无日志记录"
                    description="没有匹配的审计或请求日志，请调整筛选条件或时间范围。"
                    className="border-0 bg-transparent py-10"
                  />
                </TableCell>
              </TableRow>
            ) : (
              currentRows.map((item, index) => {
                const method = detailText(item, "method");
                const level = logLevel(item);
                return (
                  <TableRow key={`${item.time}-${index}`} className="border-border/70 text-muted-foreground transition-colors hover:bg-surface-hover/60">
                    <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">{item.time}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-foreground">{actorText(item)}</TableCell>
                    <TableCell><Badge variant="secondary" className="rounded-md">{moduleText(item)}</Badge></TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="flex min-w-0 items-center gap-2">
                        {method ? (
                          <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none", resolveLogMethodClass(method))}>
                            {method}
                          </span>
                        ) : null}
                        <span className="truncate font-mono text-xs">{pathText(item)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusBadgeVariant(item)} className="rounded-md font-mono tabular-nums">{statusText(item)}</Badge>
                        <Badge variant={levelBadgeVariant(level)} className="rounded-md">{level}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">{formatDuration(item)}</TableCell>
                    <TableCell className="max-w-[300px] truncate text-muted-foreground">{item.summary || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" className="h-8 rounded-md px-3 text-xs" onClick={() => onOpenDetail(item)}>
                        查看详情
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/70 px-4 py-3 text-xs tabular-nums text-muted-foreground">
        <span>共 {items.length} 条</span>
        <div className="flex items-center gap-2">
          <span>第 {safePage} / {pageCount} 页，共 {items.length} 条</span>
          <Button variant="outline" size="icon-sm" aria-label="上一页日志" title="上一页" className="rounded-lg" disabled={safePage <= 1} onClick={onPreviousPage}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="下一页日志" title="下一页" className="rounded-lg" disabled={safePage >= pageCount} onClick={onNextPage}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
