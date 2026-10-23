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
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
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
  hasActiveFilters = false,
  onClearFilters,
  onOpenDetail,
  onPreviousPage,
  onNextPage,
}: LogsTableCardProps) {
  if (!isLoading && items.length === 0) {
    return (
      <div className="rounded-[14px] border border-border/80 bg-surface p-6 shadow-2xs">
        <EmptyState
          compact
          icon={ScrollText}
          title={hasActiveFilters ? "没有符合筛选条件的日志" : "暂无系统日志记录"}
          description={
            hasActiveFilters
              ? "请调整关键字、HTTP 状态码或时间范围后重新查询。"
              : "系统运行期间产生的审计操作与接口请求记录将在此展示。"
          }
          action={
            hasActiveFilters && onClearFilters ? (
              <Button variant="outline" size="sm" onClick={onClearFilters}>
                重置筛选条件
              </Button>
            ) : undefined
          }
          className="border-0 bg-transparent py-8"
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-border/80 bg-surface shadow-2xs">
      <div className="thin-scrollbar overflow-x-auto">
        <Table className="min-w-[980px]">
          <TableHeader className="bg-surface-subtle/80 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <TableRow className="border-border/70 hover:bg-transparent">
              <TableHead>时间</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead>模块</TableHead>
              <TableHead>接口</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>耗时</TableHead>
              <TableHead>摘要</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && currentRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
                  <LoaderCircle className="mr-2 inline size-4 animate-spin" />
                  正在加载日志…
                </TableCell>
              </TableRow>
            ) : (
              currentRows.map((item, index) => {
                const method = detailText(item, "method");
                const level = logLevel(item);
                const actor = actorText(item);
                const isAnonymous = actor.trim().toLowerCase() === "anonymous";
                return (
                  <TableRow
                    key={`${item.time}-${index}`}
                    onClick={() => onOpenDetail(item)}
                    className="cursor-pointer border-border/70 text-muted-foreground transition-colors hover:bg-surface-hover/65"
                  >
                    <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">{item.time}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-foreground">
                      {isAnonymous ? (
                        <Badge variant="secondary" title="anonymous" className="font-normal text-muted-foreground">
                          匿名访客
                        </Badge>
                      ) : (
                        <span className="text-xs font-medium">{actor}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="rounded-md">{moduleText(item)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="flex min-w-0 items-center gap-2">
                        {method ? (
                          <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none", resolveLogMethodClass(method))}>
                            {method}
                          </span>
                        ) : null}
                        <span className="truncate font-mono text-xs text-foreground/90">{pathText(item)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={statusBadgeVariant(item)} className="rounded-md font-mono tabular-nums">{statusText(item)}</Badge>
                        <Badge variant={levelBadgeVariant(level)} className="rounded-md">{level}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">{formatDuration(item)}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">{item.summary || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenDetail(item);
                        }}
                      >
                        详情
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {items.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-4 py-3 text-xs tabular-nums text-muted-foreground">
          <span>
            共 {items.length} 条记录 · 第 {safePage} / {pageCount} 页
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label="上一页日志"
              disabled={safePage <= 1}
              onClick={onPreviousPage}
            >
              <ChevronLeft className="size-3.5" />
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="下一页日志"
              disabled={safePage >= pageCount}
              onClick={onNextPage}
            >
              下一页
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
