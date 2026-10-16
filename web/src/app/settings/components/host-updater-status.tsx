"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, CircleDashed, LoaderCircle, ServerCog } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RequestError } from "@/lib/request";
import {
  fetchHostUpdaterStatus,
  startHostUpdaterPreflight,
  type HostUpdaterStatus,
} from "@/lib/system-update-api";
import { SettingsNotice } from "./settings-ui";

export function HostUpdaterStatusPanel() {
  const [status, setStatus] = useState<HostUpdaterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setStatus(await fetchHostUpdaterStatus(signal));
    } catch (error) {
      if (!signal?.aborted) {
        const message = error instanceof RequestError ? error.message : "读取更新器状态失败";
        setStatus((current) => ({ configured: current?.configured ?? true, connected: false, reason: message }));
        toast.error(message);
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

  useEffect(() => {
    if (status?.state?.status !== "preflight") return;
    const timer = window.setInterval(() => void load(), 1200);
    return () => window.clearInterval(timer);
  }, [load, status?.state?.status]);

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

  const state = status?.state;
  const checking = state?.status === "preflight";
  return (
    <div className="rounded-[18px] border border-border/70 bg-background p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-sky-50 p-2 text-sky-700"><ServerCog className="size-5" /></div>
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">Host Updater
              {status?.connected ? <Badge variant="success">已连接</Badge> : <Badge variant="secondary">未连接</Badge>}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">独立宿主更新器负责预检；业务容器不接触 Docker Socket。</p>
          </div>
        </div>
        <Button size="sm" variant="outline" disabled={loading || starting || checking || !status?.connected} onClick={() => void runPreflight()}>
          {starting || checking ? <LoaderCircle className="size-4 animate-spin" /> : <CircleDashed className="size-4" />}运行更新前检查
        </Button>
      </div>
      {!loading && !status?.connected ? <SettingsNotice className="mt-4 border-amber-200 bg-amber-50 text-amber-800">{status?.reason || "Host Updater 尚未连接，本阶段保持只读检查更新。"}</SettingsNotice> : null}
      {state?.checks?.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {state.checks.map((check) => (
            <div key={check.name} className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5 text-sm">
              {check.status === "passed" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-rose-600" />}
              <div><div className="font-medium">{check.name}</div><div className="mt-0.5 text-xs text-muted-foreground">{check.detail || "—"}</div></div>
            </div>
          ))}
        </div>
      ) : null}
      {state?.error ? <SettingsNotice className="mt-4 border-rose-200 bg-rose-50 text-rose-700">{state.error}</SettingsNotice> : null}
    </div>
  );
}
