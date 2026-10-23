import { useState } from "react";
import { AlertTriangle, LoaderCircle, Play, RotateCcw, Save, Square, Trash2 } from "lucide-react";
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
    <section className="flex min-h-0 flex-col p-4">
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
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">运行面板</h2>
        </div>
        <Badge variant={config.enabled ? "success" : "secondary"} className="rounded-md">{config.enabled ? "运行中" : "已停止"}</Badge>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[
          ["成功 / 成功率", `${stats.success} / ${stats.success_rate || 0}%`],
          ["失败", stats.fail],
          ["完成", stats.done],
          ["运行 / 线程", `${stats.running} / ${stats.threads}`],
          ["运行时间", `${stats.elapsed_seconds || 0}s`],
          ["平均注册单个", `${stats.avg_seconds || 0}s`],
          ["当前额度", stats.current_quota || 0],
          ["正常账号", stats.current_available || 0],
        ].map(([label, value], index) => <RegisterStatCard key={label} label={String(label)} value={value} featured={index === 0} />)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="brand" onClick={() => void state.toggle()} disabled={state.isSaving}>
          {state.isSaving ? <LoaderCircle className="size-4 animate-spin" /> : config.enabled ? <Square className="size-4" /> : <Play className="size-4" />}{config.enabled ? "停止" : "启动"}
        </Button>
        <Button variant="outline" onClick={() => void state.reset()} disabled={state.isSaving || config.enabled}><RotateCcw className="size-4" />重置</Button>
        <Button variant="outline" onClick={() => void state.save()} disabled={state.isSaving || config.enabled}><Save className="size-4" />保存</Button>
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"><AlertTriangle className="size-4 shrink-0" />启动之前注意先保存配置。</div>
    </div>
  );
}

function RegisterStatCard({ label, value, featured }: { label: string; value: unknown; featured: boolean }) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 shadow-2xs ${
        featured
          ? "border-foreground bg-surface text-foreground ring-1 ring-foreground/10"
          : "border-border/80 bg-surface text-foreground"
      }`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-base font-semibold tabular-nums">{String(value)}</div>
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
