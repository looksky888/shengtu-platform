"use client";

import { History, Radio, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { TaskHistoryPanel } from "@/app/task-queue/task-history-panel";
import { TaskQueueLivePanel } from "@/app/task-queue/task-queue-live-panel";
import { buildTroubleshoot } from "@/app/task-queue/task-queue-utils";
import { useTaskQueueLive } from "@/app/task-queue/use-task-queue-live";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { LiveStatusBadge } from "@/components/ui/live-status-badge";
import { SubNav } from "@/components/ui/sub-nav";
import type { CreationTask } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { StoredAuthSession } from "@/store/auth";

const TASK_QUEUE_TABS = [
  { value: "live" as const, label: "实时队列", icon: Radio },
  { value: "history" as const, label: "任务历史", icon: History },
] as const;

export function TaskQueueContent({ session }: { session: StoredAuthSession }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "history" ? "history" : "live";
  const live = useTaskQueueLive(tab === "live", session);
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  const [confirmClearScope, setConfirmClearScope] = useState<
    "failed" | "finished" | null
  >(null);

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
        badge={
          tab === "live" ? (
            <LiveStatusBadge
              state="live"
              label="SSE 实时监听"
              refreshing={live.isLoading}
            />
          ) : undefined
        }
        description="实时查看生成队列、执行资源和失败原因；历史页用于筛选、排错与清理。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg"
              onClick={() =>
                tab === "live"
                  ? void live.load()
                  : setHistoryReloadKey((value) => value + 1)
              }
              disabled={tab === "live" && live.isLoading}
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  tab === "live" && live.isLoading ? "animate-spin" : ""
                )}
              />
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
                  onClick={() => setConfirmClearScope("finished")}
                >
                  清理已完成
                </Button>
                <Button
                  type="button"
                  variant="destructive-outline"
                  className="h-9 rounded-lg"
                  disabled={live.clearing}
                  onClick={() => setConfirmClearScope("failed")}
                >
                  清理失败
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-lg"
                  disabled={!live.selectedIds.length}
                  onClick={() => void live.cancelSelected()}
                >
                  批量取消 ({live.selectedIds.length})
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <SubNav
        ariaLabel="任务中心分组"
        items={TASK_QUEUE_TABS}
        value={tab}
        onValueChange={setTab}
        layoutId="task-queue-subnav"
      />

      {tab === "history" ? (
        <TaskHistoryPanel embedded reloadKey={historyReloadKey} />
      ) : (
        <TaskQueueLivePanel
          live={live}
          onCopyTroubleshoot={copyTroubleshoot}
        />
      )}

      <ConfirmDialog
        open={confirmClearScope !== null}
        title={
          confirmClearScope === "failed"
            ? "确认清理队列中的失败任务？"
            : "确认清理队列中的已完成任务？"
        }
        description={
          confirmClearScope === "failed"
            ? "将移除队列中所有失败状态记录，运行中与排队中的任务不会受影响。"
            : "将移除队列中所有成功、失败及已取消的任务记录，运行中与排队中的任务不会受影响。"
        }
        confirmLabel="确认清理"
        destructive
        pending={live.clearing}
        onClose={() => setConfirmClearScope(null)}
        onConfirm={() => {
          const target = confirmClearScope;
          setConfirmClearScope(null);
          if (target) {
            void live.clearDone(target);
          }
        }}
      />
    </section>
  );
}
