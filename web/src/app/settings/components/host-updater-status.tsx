"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  ServerCog,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RequestError } from "@/lib/request";
import {
  fetchHostUpdaterStatus,
  startHostUpdaterPreflight,
  startHostUpdaterUpdate,
  type HostUpdaterStatus,
} from "@/lib/system-update-api";
import { cn } from "@/lib/utils";

import { SETTINGS_TAB_REFRESH_EVENT } from "../settings-tabs";
import { SettingsNotice } from "./settings-ui";

function formatVersionLabel(raw?: string) {
  const clean = String(raw || "").trim();
  if (!clean) return "—";
  return clean.startsWith("v") || clean.startsWith("V") ? clean : `v${clean}`;
}

const ACTIVE_STAGE_LABELS: Record<string, string> = {
  preflight: "正在执行宿主机环境与镜像预检…",
  updating: "正在拉取目标镜像并平滑切换业务容器…",
  rolling_back: "新版本就绪验收未通过，正在自动回滚原版本与冷备份…",
};

export function HostUpdaterStatusPanel({
  currentVersion,
  latestVersion,
  onStatusChange,
}: {
  currentVersion?: string;
  latestVersion?: string;
  onStatusChange?: (status: HostUpdaterStatus | null, loading: boolean) => void;
}) {
  const [status, setStatus] = useState<HostUpdaterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    onStatusChange?.(status, loading);
  }, [status, loading, onStatusChange]);

  const load = useCallback(async (signal?: AbortSignal, silent = false) => {
    try {
      setStatus(await fetchHostUpdaterStatus(signal));
    } catch (error) {
      if (!signal?.aborted) {
        const message =
          error instanceof RequestError
            ? error.message
            : "读取更新器状态失败";
        setStatus((current) => ({
          configured: current?.configured ?? true,
          connected: false,
          reason: message,
          state: current?.state,
        }));
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

  useEffect(() => {
    const handleTabRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      if (detail?.tab === "system-update") {
        void load(undefined, true);
      }
    };
    window.addEventListener(SETTINGS_TAB_REFRESH_EVENT, handleTabRefresh);
    return () =>
      window.removeEventListener(SETTINGS_TAB_REFRESH_EVENT, handleTabRefresh);
  }, [load]);

  const state = status?.state;
  const activeStatus = state?.status;
  const isOperationActive = Boolean(
    activeStatus &&
      ["preflight", "updating", "rolling_back"].includes(activeStatus)
  );

  useEffect(() => {
    if (!isOperationActive) return;
    const timer = window.setInterval(() => void load(undefined, true), 1200);
    return () => window.clearInterval(timer);
  }, [isOperationActive, load]);

  const runPreflight = async () => {
    setStarting(true);
    try {
      const response = await startHostUpdaterPreflight();
      setStatus({
        configured: true,
        connected: true,
        state: response.result.state,
      });
      toast.success(
        response.result.started ? "更新前预检已启动" : "已有预检任务正在运行"
      );
    } catch (error) {
      toast.error(
        error instanceof RequestError ? error.message : "启动更新前预检失败"
      );
    } finally {
      setStarting(false);
    }
  };

  const runUpdate = async () => {
    if (!state?.task_id) return;
    setStarting(true);
    try {
      const response = await startHostUpdaterUpdate(state.task_id);
      setStatus({
        configured: true,
        connected: true,
        state: response.result.state,
      });
      setConfirming(false);
      toast.success(
        response.result.started
          ? "平滑升级任务已启动，服务将短暂重连"
          : "升级任务已在运行中"
      );
    } catch (error) {
      toast.error(
        error instanceof RequestError ? error.message : "启动平滑升级失败"
      );
    } finally {
      setStarting(false);
    }
  };

  const checking = state?.status === "preflight";
  const updating =
    state?.status === "updating" || state?.status === "rolling_back";

  const sourceVersionLabel = formatVersionLabel(
    state?.source?.version || currentVersion
  );
  const targetVersionLabel = formatVersionLabel(
    state?.target?.version || latestVersion
  );

  return (
    <div className="rounded-xl border border-border/75 bg-surface-subtle/45 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-foreground ring-1 ring-border/75">
            <ServerCog className="size-4" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
              <span>Host Updater 宿主机守护服务</span>
              {loading ? (
                <Badge variant="secondary">检测中…</Badge>
              ) : status?.connected ? (
                <Badge variant="success">已连接</Badge>
              ) : (
                <Badge variant="secondary">未连接</Badge>
              )}
              {state?.status === "ready" ? (
                <Badge variant="outline">预检就绪</Badge>
              ) : null}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {status?.connected
                ? "独立宿主守护进程已就绪，负责排空任务、创建冷备份与切换容器镜像；业务容器无需挂载 Docker Socket。"
                : "独立宿主更新器负责环境预检与镜像切换；业务容器不直接接触 Docker Socket。"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            loading={checking}
            disabled={
              loading || starting || updating || !status?.connected
            }
            onClick={() => void runPreflight()}
          >
            {!checking ? <CircleDashed className="size-3.5" /> : null}
            运行更新前检查
          </Button>
          {state?.status === "ready" ? (
            <Button
              type="button"
              size="sm"
              disabled={starting}
              onClick={() => setConfirming(true)}
            >
              <UploadCloud className="size-3.5" />
              开始平滑升级
            </Button>
          ) : null}
        </div>
      </div>

      {/* Active Indeterminate Progress & Live Stage Banner */}
      {isOperationActive ? (
        <div className="mt-4 space-y-2.5 rounded-xl border border-border/75 bg-surface p-3.5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <Loader2 className="size-3.5 shrink-0 animate-spin text-foreground" />
              <span>
                {ACTIVE_STAGE_LABELS[activeStatus ?? ""] || "正在处理更新流程…"}
              </span>
            </div>
            {state?.phase ? (
              <Badge variant="warning" className="font-mono text-[11px]">
                阶段：{state.phase}
              </Badge>
            ) : null}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div className="animate-indeterminate h-full w-1/2 rounded-full bg-foreground" />
          </div>
        </div>
      ) : state?.phase ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>最近阶段：</span>
          <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-foreground ring-1 ring-border/70">
            {state.phase}
          </code>
        </div>
      ) : null}

      {!loading && !status?.connected ? (
        <SettingsNotice tone="warning" className="mt-3.5">
          {status?.reason ||
            "尚未检测到宿主更新守护服务（Host Updater），当前仅支持在线检查新版本；如需一键升级请先配置宿主服务与通信密钥。"}
        </SettingsNotice>
      ) : null}

      {state?.checks?.length ? (
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {state.checks.map((check) => {
            const rawStatus = String(check.status);
            return (
              <div
                key={check.name}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl border border-border/75 bg-surface px-3.5 py-2.5 text-xs shadow-2xs sm:text-sm",
                  rawStatus === "failed" && "border-status-danger/30",
                  rawStatus === "warning" && "border-status-warning/30"
                )}
              >
                <PreflightCheckIcon status={rawStatus} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{check.name}</div>
                  <div className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">
                    {check.detail || "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {state?.status === "succeeded" ? (
        <SettingsNotice tone="success" className="mt-4">
          平滑升级已完成，目标版本已连续通过健康就绪验收。
        </SettingsNotice>
      ) : null}

      {state?.status === "rolled_back" ? (
        <SettingsNotice tone="warning" className="mt-4">
          目标版本就绪验收未通过，系统已自动回滚至原运行版本与冷备份状态。
        </SettingsNotice>
      ) : null}

      {state?.error ? (
        <SettingsNotice tone="danger" className="mt-4">
          {state.error}
        </SettingsNotice>
      ) : null}

      <ConfirmDialog
        open={confirming}
        tone="warning"
        title="确认开始宿主机平滑升级？"
        description="Host Updater 将先排空正在处理的写入与创作任务，随后停止主容器、创建数据库冷备份并切换目标镜像；若新容器验收异常将自动回滚。"
        impactItems={[
          `版本升级路径：${sourceVersionLabel} → ${targetVersionLabel}`,
          "宿主机 Updater 将拉取新镜像并平滑重建容器",
          "升级期间可能出现约 5–15 秒短暂重连",
        ]}
        confirmLabel="开始平滑升级"
        pendingLabel="正在启动升级…"
        pending={starting}
        onClose={() => setConfirming(false)}
        onConfirm={() => void runUpdate()}
      />
    </div>
  );
}

function PreflightCheckIcon({ status }: { status: string }) {
  if (status === "passed") {
    return (
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" />
    );
  }
  if (status === "warning") {
    return (
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" />
    );
  }
  if (status === "running" || status === "pending") {
    return (
      <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" />
    );
  }
  return <XCircle className="mt-0.5 size-4 shrink-0 text-status-danger" />;
}
