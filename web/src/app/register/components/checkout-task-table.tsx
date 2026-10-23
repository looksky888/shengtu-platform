"use client";

import { Copy, ExternalLink, Link2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { CheckoutTask } from "@/lib/register-types";

import { getCheckoutTaskPresentation } from "./checkout-task-presentation";

type Props = {
  tasks?: CheckoutTask[];
  onCopyPaymentLink?: (link: string) => void;
};

export function CheckoutTaskTable({ tasks = [], onCopyPaymentLink }: Props) {
  if (!tasks.length) {
    return (
      <EmptyState
        compact
        icon={Link2}
        title="暂无提链任务"
        description="注册账号后会在这里显示最终支付链接的提取进度。"
        className="rounded-xl border border-dashed border-border/70 bg-surface-muted/25 py-10"
      />
    );
  }

  return (
    <div className="max-h-[min(38rem,52vh)] overflow-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[40rem] text-left text-xs">
        <thead className="sticky top-0 border-b border-border bg-surface-subtle/90 text-[11px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur">
          <tr>
            <th className="px-3 py-2.5 font-medium">账号</th>
            <th className="px-3 py-2.5 font-medium">进度</th>
            <th className="px-3 py-2.5 font-medium">结果链接</th>
            <th className="px-3 py-2.5 font-medium">失败原因</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, rowIndex) => {
            const key = String(task.task_id || `${task.index ?? rowIndex}-${task.email || "checkout"}`);
            const display = getCheckoutTaskPresentation(task);
            return (
              <tr key={key} className="border-t border-border/70 align-top transition-colors hover:bg-surface-hover/60">
                <td className="px-3 py-2.5">
                  <p className="font-medium text-foreground" title={String(task.email || "")}>
                    {String(task.email || "").trim() || `任务 ${Number(task.index) || rowIndex + 1}`}
                  </p>
                  {Number(task.index) > 0 ? (
                    <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">任务 {Number(task.index)}</p>
                  ) : null}
                  {display.channel ? <p className="mt-0.5 text-[11px] text-muted-foreground">{display.channel}</p> : null}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant={display.status.tone === "default" ? "outline" : display.status.tone}>
                    {display.status.text}
                  </Badge>
                  {display.retryAt ? <p className="mt-1 text-[11px] tabular-nums text-amber-700 dark:text-amber-300">{display.retryAt}</p> : null}
                  {display.stage ? <p className="mt-1 text-[11px] text-muted-foreground">{display.stage}</p> : null}
                  {display.detail ? (
                    <p className="mt-1 max-w-[16rem] truncate text-[11px] text-muted-foreground" title={display.detail}>
                      {display.detail}
                    </p>
                  ) : null}
                  {display.updatedAt ? (
                    <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">{display.updatedAt}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  {display.link ? (
                    <div className="flex min-w-0 items-center gap-1">
                      <a
                        href={display.link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-w-0 max-w-[14rem] items-center gap-1 truncate font-medium text-foreground underline-offset-4 hover:underline"
                        title={display.link}
                      >
                        <span className="truncate">{display.linkText}</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 p-0"
                        title="复制链接"
                        onClick={() => onCopyPaymentLink?.(display.link)}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {display.error ? (
                    <p className="max-w-[14rem] break-words text-rose-600 dark:text-rose-400" title={display.error}>
                      {display.error}
                    </p>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
