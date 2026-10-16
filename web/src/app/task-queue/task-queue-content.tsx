"use client";

import { History, Radio, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { TaskHistoryPanel } from "@/app/task-queue/task-history-panel";
import { TaskQueueLivePanel } from "@/app/task-queue/task-queue-live-panel";
import { buildTroubleshoot } from "@/app/task-queue/task-queue-utils";
import { useTaskQueueLive } from "@/app/task-queue/use-task-queue-live";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { CreationTask } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { StoredAuthSession } from "@/store/auth";

export function TaskQueueContent({ session }: { session: StoredAuthSession }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "history" ? "history" : "live";
  const live = useTaskQueueLive(tab === "live", session);
  const [historyReloadKey, setHistoryReloadKey] = useState(0);

  const setTab = (next: "live" | "history") => {
    const params = new URLSearchParams(searchParams);
    if (next === "history") params.set("tab", "history");
    else params.delete("tab");
    setSearchParams(params, { replace: true });
  };

  const copyTroubleshoot = async (item: CreationTask) => {
    try {
      await copyText(buildTroubleshoot(item));
      toast.success("已复制排错信息");
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <section className="min-w-0 space-y-4">
      <PageHeader
        eyebrow="运维"
        title="任务中心"
        description="实时查看生成队列、执行资源和失败原因；历史页用于筛选、排错与清理。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="h-9 rounded-lg" onClick={() => tab === "live" ? void live.load() : setHistoryReloadKey((value) => value + 1)} disabled={tab === "live" && live.isLoading}>
              <RefreshCw className={cn("size-4", tab === "live" && live.isLoading ? "animate-spin" : "")} />
              刷新
            </Button>
            {tab === "live" && live.canManageTasks ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-lg"
                  title="删除成功/失败/已取消的任务记录，不影响运行中"
                  disabled={live.clearing}
                  onClick={() => void live.clearDone("finished")}
                >
                  清理已完成
                </Button>
                <Button type="button" variant="outline" className="h-9 rounded-lg text-rose-600" disabled={live.clearing} onClick={() => void live.clearDone("failed")}>
                  清理失败
                </Button>
                <Button type="button" variant="outline" className="h-9 rounded-lg" disabled={!live.selectedIds.length} onClick={() => void live.cancelSelected()}>
                  批量取消 ({live.selectedIds.length})
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="inline-flex w-fit gap-1 rounded-xl border border-border bg-muted/40 p-1" role="tablist" aria-label="任务中心分组">
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
            tab === "live" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
          role="tab"
          aria-selected={tab === "live"}
          onClick={() => setTab("live")}
        >
          <Radio className="size-3.5" />
          实时队列
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
            tab === "history" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
          role="tab"
          aria-selected={tab === "history"}
          onClick={() => setTab("history")}
        >
          <History className="size-3.5" />
          任务历史
        </button>
      </div>

      {tab === "history" ? (
        <TaskHistoryPanel embedded reloadKey={historyReloadKey} />
      ) : (
        <TaskQueueLivePanel live={live} onCopyTroubleshoot={copyTroubleshoot} />
      )}
    </section>
  );
}
