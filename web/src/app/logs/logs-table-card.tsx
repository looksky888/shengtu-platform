import { ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SystemLog } from "@/lib/api";
import {
  actorText,
  detailText,
  formatDuration,
  levelBadgeVariant,
  logLevel,
  methodBadgeVariant,
  moduleText,
  pathText,
  statusBadgeVariant,
  statusText,
} from "@/app/logs/logs-utils";

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
          <TableHeader className="bg-muted/40">
            <TableRow className="border-border/70 hover:bg-transparent">
              <TableHead className="bg-muted/40">{"时间"}</TableHead>
              <TableHead className="bg-muted/40">{"操作人"}</TableHead>
              <TableHead className="bg-muted/40">{"模块"}</TableHead>
              <TableHead className="bg-muted/40">{"接口"}</TableHead>
              <TableHead className="bg-muted/40">{"状态"}</TableHead>
              <TableHead className="bg-muted/40">{"耗时"}</TableHead>
              <TableHead className="bg-muted/40">{"摘要"}</TableHead>
              <TableHead className="w-28 bg-muted/40">{"操作"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentRows.map((item, index) => {
              const method = detailText(item, "method");
              const level = logLevel(item);
              return (
                <TableRow key={`${item.time}-${index}`} className="border-border/70 text-muted-foreground">
                  <TableCell className="whitespace-nowrap">{item.time}</TableCell>
                  <TableCell className="max-w-[150px] truncate text-foreground">{actorText(item)}</TableCell>
                  <TableCell><Badge variant="secondary" className="rounded-md">{moduleText(item)}</Badge></TableCell>
                  <TableCell className="max-w-[260px]">
                    <div className="flex min-w-0 items-center gap-2">
                      {method ? <Badge variant={methodBadgeVariant(method)} className="rounded-md">{method}</Badge> : null}
                      <span className="truncate">{pathText(item)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusBadgeVariant(item)} className="rounded-md">{statusText(item)}</Badge>
                      <Badge variant={levelBadgeVariant(level)} className="rounded-md">{level}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>{formatDuration(item)}</TableCell>
                  <TableCell className="max-w-[300px] truncate text-muted-foreground">{item.summary || "-"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" className="h-8 rounded-md px-3" onClick={() => onOpenDetail(item)}>
                      {"查看详情"}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {!isLoading && items.length === 0 ? (
        <div className="px-6 py-14 text-center text-sm text-muted-foreground">{"没有找到日志"}</div>
      ) : null}
      <div className="flex items-center justify-between gap-2 border-t border-border/70 px-4 py-3 text-sm text-muted-foreground">
        <span>{"共 "}{items.length}{" 条"}</span>
        <div className="flex items-center gap-2">
          <span>{"第 "}{safePage}{" / "}{pageCount}{" 页，共 "}{items.length}{" 条"}</span>
          <Button variant="outline" size="icon" aria-label="上一页日志" title="上一页" className="size-9 rounded-lg" disabled={safePage <= 1} onClick={onPreviousPage}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="下一页日志" title="下一页" className="size-9 rounded-lg" disabled={safePage >= pageCount} onClick={onNextPage}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
