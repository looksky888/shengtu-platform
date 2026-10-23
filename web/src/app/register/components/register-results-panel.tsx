import { useState } from "react";
import { Activity, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clearCheckoutHistory, stopCheckoutRetries } from "@/lib/register-cpa-proxy-api";
import { copyText } from "@/lib/clipboard";
import type { CheckoutTask } from "@/lib/register-types";

import { CheckoutTaskTable } from "./checkout-task-table";
import type { RegisterCardState } from "./use-register-card";
import { useSettingsStore } from "../../settings/store";
import { normalizeRegisterConfig } from "../../settings/settings-normalizers";

export function RegisterResultsPanel({ state }: { state: RegisterCardState }) {
  const { config } = state;
  if (!config) return null;
  return (
    <section className="flex min-h-0 flex-col p-5">
      <RegisterRunSummary state={state} />
      <CheckoutTasksPanel state={state} />
      <RegisterLogPanel state={state} />
    </section>
  );
}

function CheckoutTasksPanel({ state }: { state: RegisterCardState }) {
  const { config } = state;
  const setRegisterConfig = useSettingsStore((s) => s.setRegisterConfig);
  const [clearing, setClearing] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  if (!config) return null;

  const tasks = (Array.isArray(config.checkout_tasks) ? config.checkout_tasks : []) as CheckoutTask[];
  const retriesActive = Boolean(config.checkout_retries_active);
  const clearable = tasks.filter((t) => {
    const s = String(t.status || t.stage || "").toLowerCase();
    return ["success", "succeeded", "completed", "complete", "done", "failed", "error", "cancelled", "canceled", "stopped"].includes(s)
      || Boolean(String(t.payment_link || "").trim());
  }).length;

  // Only show for OpenAI target (checkout is OpenAI-side); still show if tasks exist.
  const target = String(config.target || "openai").toLowerCase();
  if (target === "grok" && tasks.length === 0) return null;

  const handleConfirmClear = async () => {
    setClearing(true);
    try {
      const data = await clearCheckoutHistory();
      if (data.register) setRegisterConfig(normalizeRegisterConfig(data.register));
      toast.success("已清空提链历史");
      setConfirmClearOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "清空提链历史失败");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">提链任务</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="rounded-md">{tasks.length} 个任务</Badge>
          {retriesActive ? (
            <Button
              size="sm"
              variant="outline"
              loading={stopping}
              disabled={stopping}
              onClick={() => {
                void (async () => {
                  setStopping(true);
                  try {
                    const data = await stopCheckoutRetries();
                    if (data.register) setRegisterConfig(normalizeRegisterConfig(data.register));
                    toast.success("已请求结束提链重试");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "结束提链失败");
                  } finally {
                    setStopping(false);
                  }
                })();
              }}
            >
              <Square className="size-3.5" />
              结束提链
            </Button>
          ) : null}
          {clearable > 0 ? (
            <Button
              size="sm"
              variant="outline"
              loading={clearing}
              disabled={clearing}
              onClick={() => setConfirmClearOpen(true)}
            >
              <Trash2 className="size-3.5" />
              清空历史
            </Button>
          ) : null}
        </div>
      </div>
      <CheckoutTaskTable
        tasks={tasks}
        onCopyPaymentLink={(link) => {
          void copyText(link)
            .then(() => toast.success("已复制支付链接"))
            .catch(() => toast.error("复制失败"));
        }}
      />
      <ConfirmDialog
        open={confirmClearOpen}
        title="确认清空提链历史？"
        description={`将删除 ${clearable} 条已成功、已失败或已取消的提链记录，不影响运行中任务。`}
        confirmLabel="确认清空"
        destructive
        pending={clearing}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={() => void handleConfirmClear()}
      />
    </div>
  );
}

function RegisterRunSummary({ state }: { state: RegisterCardState }) {
  const { config, stats } = state;
  if (!config) return null;
  const statItems: Array<{
    label: string;
    value: unknown;
    tone?: "default" | "success" | "danger";
  }> = [
    {
      label: "成功 / 成功率",
      value: `${stats.success} / ${stats.success_rate || 0}%`,
      tone: Number(stats.success) > 0 ? "success" : "default",
    },
    {
      label: "失败",
      value: stats.fail,
      tone: Number(stats.fail) > 0 ? "danger" : "default",
    },
    { label: "完成", value: stats.done },
    { label: "运行 / 线程", value: `${stats.running} / ${stats.threads}` },
    { label: "运行时间", value: `${stats.elapsed_seconds || 0}s` },
    { label: "平均注册单个", value: `${stats.avg_seconds || 0}s` },
    { label: "当前额度", value: stats.current_quota || 0 },
    { label: "正常账号", value: stats.current_available || 0 },
  ];

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3.5">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg border border-border/70 bg-surface-muted">
            <Activity className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground sm:text-[15px]">运行遥测</h2>
            <p className="text-xs text-muted-foreground">修改左侧参数后，请先点击顶部「保存配置」再启动任务</p>
          </div>
        </div>
        <Badge variant={config.enabled ? "success" : "secondary"}>
          {config.enabled ? "运行中" : "已停止"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {statItems.map((item) => (
          <RegisterStatCard
            key={item.label}
            label={item.label}
            value={item.value}
            tone={item.tone}
          />
        ))}
      </div>
    </div>
  );
}

function RegisterStatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: unknown;
  tone?: "default" | "success" | "danger";
}) {
  const valueClass =
    tone === "success"
      ? "text-status-success"
      : tone === "danger"
        ? "text-status-danger"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border/80 bg-surface-muted/35 px-3 py-2.5">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-base font-semibold tabular-nums ${valueClass}`}>
        {String(value)}
      </div>
    </div>
  );
}

function RegisterLogPanel({ state }: { state: RegisterCardState }) {
  const { logs } = state;
  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col space-y-3 overflow-hidden border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <div><h3 className="text-sm font-semibold text-foreground">实时日志</h3></div>
        <Badge variant="secondary" className="rounded-md">{logs.length}</Badge>
      </div>
      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-surface-muted/40 p-3 font-mono text-xs leading-6">
        {logs.length === 0 ? <div className="text-muted-foreground">暂无日志</div> : logs.slice().reverse().map((item, index) => (
          <div key={`${item.time}-${index}`} className={item.level === "red" ? "text-rose-600 dark:text-rose-400" : item.level === "green" ? "text-emerald-700 dark:text-emerald-400" : item.level === "yellow" ? "text-amber-700 dark:text-amber-400" : "text-foreground"}>
            <span className="text-muted-foreground">{new Date(item.time).toLocaleTimeString()}</span><span className="pl-2">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
