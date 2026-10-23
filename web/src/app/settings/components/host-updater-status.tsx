"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, CircleDashed, LoaderCircle, ServerCog, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RequestError } from "@/lib/request";
import {
  fetchHostUpdaterStatus,
  startHostUpdaterPreflight,
  startHostUpdaterUpdate,
  type HostUpdaterStatus,
} from "@/lib/system-update-api";
import { SettingsNotice } from "./settings-ui";

export function HostUpdaterStatusPanel() {
  const [status, setStatus] = useState<HostUpdaterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async (signal?: AbortSignal, silent = false) => {
    try {
      setStatus(await fetchHostUpdaterStatus(signal));
    } catch (error) {
      if (!signal?.aborted) {
        const message = error instanceof RequestError ? error.message : "读取更新器状态失败";
        setStatus((current) => ({ configured: current?.configured ?? true, connected: false, reason: message, state: current?.state }));
        if (!silent) toast.error(message);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const state = status?.state;
  const activeStatus = state?.status;

  useEffect(() => {
    if (!activeStatus || !["preflight", "updating", "rolling_back"].includes(activeStatus)) return;
    const timer = window.setInterval(() => void load(undefined, true), 1200);
    return () => window.clearInterval(timer);
  }, [activeStatus, load]);

  const runPreflight = async () => {
    setStarting(true);
    try {
      const response = await startHostUpdaterPreflight();
      setStatus({ configured: true, connected: true, state: response.result.state });
      toast.success(response.result.started ? "更新前检查已启动" : "已有检查正在运行");
    } catch (error) {
      toast.error(error instanceof RequestError ? error.message : "启动更新前检查失败");
    } finally {
      setStarting(false);
    }
  };

  const runUpdate = async () => {
    if (!state?.task_id) return;
    setStarting(true);
    setConfirming(false);
    try {
      const response = await startHostUpdaterUpdate(state.task_id);
      setStatus({ configured: true, connected: true, state: response.result.state });
      toast.success(response.result.started ? "更新任务已启动，服务将短暂进入维护状态" : "更新任务已经在运行");
    } catch (error) {
      toast.error(error instanceof RequestError ? error.message : "启动更新失败");
    } finally {
      setStarting(false);
    }
  };

  const checking = state?.status === "preflight";
  const updating = state?.status === "updating" || state?.status === "rolling_back";
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-surface-muted p-2 text-foreground ring-1 ring-border/60"><ServerCog className="size-4.5" /></div>
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">Host Updater
              {status?.connected ? <Badge variant="success">已连接</Badge> : <Badge variant="secondary">未连接</Badge>}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">独立宿主更新器负责预检；业务容器不接触 Docker Socket。</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={loading || starting || checking || updating || !status?.connected} onClick={() => void runPreflight()}>
            {checking ? <LoaderCircle className="size-4 animate-spin" /> : <CircleDashed className="size-4" />}运行更新前检查
          </Button>
          {state?.status === "ready" ? <Button size="sm" disabled={starting} onClick={() => setConfirming(true)}><UploadCloud className="size-4" />开始更新</Button> : null}
        </div>
      </div>
      {!loading && !status?.connected ? <SettingsNotice className="mt-4 border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300">{status?.reason || "Host Updater 尚未连接，请检查宿主服务、Socket 与通信密钥。"}</SettingsNotice> : null}
      {state?.checks?.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {state.checks.map((check) => (
            <div key={check.name} className="flex items-start gap-2 rounded-lg border border-border/60 bg-background px-3 py-2.5 text-sm">
              {check.status === "passed" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />}
              <div><div className="font-medium">{check.name}</div><div className="mt-0.5 text-xs text-muted-foreground">{check.detail || "—"}</div></div>
            </div>
          ))}
        </div>
      ) : null}
      {state?.phase ? <div className="mt-3 text-xs text-muted-foreground">当前阶段：{state.phase}</div> : null}
      {confirming ? (
        <SettingsNotice className="mt-4 border-amber-500/25 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <div className="font-medium">确认更新到 v{state?.target?.version || "目标版本"}？</div>
          <div className="mt-1 text-xs leading-5">更新器会先排空写入和创作任务，再停止主服务、创建冷备份并切换镜像。页面可能短暂断开；验收失败会自动回滚。</div>
          <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setConfirming(false)}>取消</Button><Button size="sm" onClick={() => void runUpdate()} disabled={starting}>{starting ? <LoaderCircle className="size-4 animate-spin" /> : null}确认更新</Button></div>
        </SettingsNotice>
      ) : null}
      {state?.status === "succeeded" ? <SettingsNotice className="mt-4 border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">更新完成，目标版本已连续通过就绪验收。</SettingsNotice> : null}
      {state?.status === "rolled_back" ? <SettingsNotice className="mt-4 border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300">目标版本验收失败，系统已自动恢复原版本与冷备份。</SettingsNotice> : null}
      {state?.error ? <SettingsNotice className="mt-4 border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300">{state.error}</SettingsNotice> : null}
    </div>
  );
}
