"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { usePageVisible } from "@/lib/use-page-visible";
import { cn } from "@/lib/utils";

import { SETTINGS_TAB_REFRESH_EVENT } from "../settings-tabs";
import { SettingsNotice } from "./settings-ui";

const SWITCHOVER_GRACE_MS = 25_000;

function formatVersionLabel(raw?: string) {
  const clean = String(raw || "").trim();
  if (!clean) return "—";
  return clean.startsWith("v") || clean.startsWith("V") ? clean : `v${clean}`;
}

function normalizeComparableVersion(raw?: string) {
  return String(raw || "")
    .trim()
    .replace(/^[vV]/, "");
}

function isTransientSwitchoverError(error: unknown): boolean {
  if (error instanceof RequestError) {
    const status = error.status;
    if (status === undefined) return true;
    return (
      status === 0 ||
      status === 502 ||
      status === 503 ||
      status === 504 ||
      status >= 500
    );
  }
  return true;
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
  onUpdateSucceeded,
}: {
  currentVersion?: string;
  latestVersion?: string;
  onStatusChange?: (status: HostUpdaterStatus | null, loading: boolean) => void;
  onUpdateSucceeded?: () => void;
}) {
  const [status, setStatus] = useState<HostUpdaterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [switchingOver, setSwitchingOver] = useState(false);

  const pageVisible = usePageVisible();
  const inFlightRef = useRef(false);
  const switchoverUntilRef = useRef(0);
  const prevStateStatusRef = useRef<string | undefined>(undefined);
  const syncedSuccessKeyRef = useRef<string>("");

  useEffect(() => {
    onStatusChange?.(status, loading);
  }, [status, loading, onStatusChange]);

  const load = useCallback(
    async (
      signal?: AbortSignal,
      options: { silent?: boolean; allowConcurrent?: boolean } = {},
    ) => {
      const { silent = false, allowConcurrent = false } = options;
      if (inFlightRef.current && !allowConcurrent) {
        return;
      }
      inFlightRef.current = true;
      try {
        const nextStatus = await fetchHostUpdaterStatus(signal);
        if (signal?.aborted) return;

        const nextOpStatus = nextStatus.state?.status;
        const withinSwitchover = Date.now() < switchoverUntilRef.current;

        if (
          nextOpStatus === "updating" ||
          nextOpStatus === "rolling_back" ||
          nextStatus.state?.phase === "restarting" ||
          nextStatus.state?.phase === "running"
        ) {
          switchoverUntilRef.current = Math.max(
            switchoverUntilRef.current,
            Date.now() + SWITCHOVER_GRACE_MS,
          );
        }

        if (!nextStatus.connected && withinSwitchover) {
          setSwitchingOver(true);
          return;
        }

        setSwitchingOver(false);
        if (
          nextOpStatus === "succeeded" ||
          nextOpStatus === "rolled_back" ||
          nextOpStatus === "failed"
        ) {
          switchoverUntilRef.current = 0;
        }

        const prevOpStatus = prevStateStatusRef.current;
        prevStateStatusRef.current = nextOpStatus;
        setStatus(nextStatus);

        if (nextOpStatus === "succeeded") {
          const successKey = `${nextStatus.state?.task_id ?? ""}:${nextStatus.state?.finished_at ?? nextStatus.state?.updated_at ?? ""}`;
          const targetVer = normalizeComparableVersion(
            nextStatus.state?.target?.version,
          );
          const runningVer = normalizeComparableVersion(currentVersion);
          const transitionedFromActive = Boolean(
            prevOpStatus && prevOpStatus !== "succeeded",
          );
          const versionMismatch = Boolean(
            targetVer && runningVer && targetVer !== runningVer,
          );

          if (
            (transitionedFromActive || versionMismatch) &&
            syncedSuccessKeyRef.current !== successKey
          ) {
            syncedSuccessKeyRef.current = successKey;
            onUpdateSucceeded?.();
          }
        }
      } catch (error) {
        if (!signal?.aborted) {
          const withinSwitchover =
            Date.now() < switchoverUntilRef.current ||
            prevStateStatusRef.current === "updating" ||
            prevStateStatusRef.current === "rolling_back";

          if (withinSwitchover && isTransientSwitchoverError(error)) {
            if (Date.now() >= switchoverUntilRef.current) {
              // Extend once if previously observed updating right before container stop
              switchoverUntilRef.current = Date.now() + 10_000;
            }
            setSwitchingOver(true);
            return;
          }

          setSwitchingOver(false);
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
        inFlightRef.current = false;
        if (!signal?.aborted) setLoading(false);
      }
    },
    [currentVersion, onUpdateSucceeded],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal, { allowConcurrent: true });
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const handleTabRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      if (
        !detail?.tab ||
        detail.tab === "system" ||
        detail.tab === "system-update"
      ) {
        void load(undefined, { silent: true });
      }
    };
    window.addEventListener(SETTINGS_TAB_REFRESH_EVENT, handleTabRefresh);
    return () =>
      window.removeEventListener(SETTINGS_TAB_REFRESH_EVENT, handleTabRefresh);
  }, [load]);

  const state = status?.state;
  const activeStatus = state?.status;
  const isOperationActive = Boolean(
    switchingOver ||
      (activeStatus &&
        ["preflight", "updating", "rolling_back"].includes(activeStatus)),
  );

  useEffect(() => {
    if (!isOperationActive || !pageVisible) return;
    const timer = window.setInterval(
      () => void load(undefined, { silent: true }),
      1400,
    );
    return () => window.clearInterval(timer);
  }, [isOperationActive, load, pageVisible]);

  const runPreflight = async () => {
    setStarting(true);
    try {
      const response = await startHostUpdaterPreflight();
      prevStateStatusRef.current = response.result.state.status;
      setStatus({
        configured: true,
        connected: true,
        state: response.result.state,
      });
      toast.success(
        response.result.started ? "更新前预检已启动" : "已有预检任务正在运行",
      );
    } catch (error) {
      toast.error(
        error instanceof RequestError ? error.message : "启动更新前预检失败",
      );
    } finally {
      setStarting(false);
    }
  };

  const runUpdate = async () => {
    if (!state?.task_id) return;
    setStarting(true);
    switchoverUntilRef.current = Date.now() + SWITCHOVER_GRACE_MS;
    try {
      const response = await startHostUpdaterUpdate(state.task_id);
      prevStateStatusRef.current = response.result.state.status;
      setStatus({
        configured: true,
        connected: true,
        state: response.result.state,
      });
      setConfirming(false);
      toast.success(
        response.result.started
          ? "平滑升级任务已启动，容器切换期间将自动等待服务就绪"
          : "升级任务已在运行中",
      );
    } catch (error) {
      if (isTransientSwitchoverError(error)) {
        setConfirming(false);
        setSwitchingOver(true);
      } else {
        switchoverUntilRef.current = 0;
        toast.error(
          error instanceof RequestError ? error.message : "启动平滑升级失败",
        );
      }
    } finally {
      setStarting(false);
    }
  };

  const checking = state?.status === "preflight";
  const updating =
    switchingOver ||
    state?.status === "updating" ||
    state?.status === "rolling_back";

  const sourceVersionLabel = formatVersionLabel(
    state?.source?.version || currentVersion,
  );
  const targetVersionLabel = formatVersionLabel(
    state?.target?.version || latestVersion,
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
              <span>宿主机平滑更新守护服务</span>
              {loading ? (
                <Badge variant="secondary">检测中…</Badge>
              ) : switchingOver ? (
                <Badge
                  variant="outline"
                  className="border-primary/30 bg-primary/[0.08] text-primary"
                >
                  容器平滑切换中
                </Badge>
              ) : status?.connected ? (
                <Badge variant="success">已连接</Badge>
              ) : (
                <Badge variant="secondary">未连接</Badge>
              )}
              {state?.status === "ready" && !switchingOver ? (
                <Badge variant="outline">预检就绪</Badge>
              ) : null}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {status?.connected || switchingOver
                ? "独立宿主守护进程已就绪，负责排空任务、创建冷备份与切换容器镜像；业务容器无需挂载 Docker 套接字。"
                : "独立宿主更新器负责环境预检与镜像切换；业务容器不直接接触宿主机容器引擎。"}
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
              loading ||
              starting ||
              updating ||
              (!status?.connected && !switchingOver)
            }
            onClick={() => void runPreflight()}
          >
            {!checking ? <CircleDashed className="size-3.5" /> : null}
            运行更新前检查
          </Button>
          {state?.status === "ready" && !switchingOver ? (
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

      {/* Active Indeterminate Progress & Live Stage / Switchover Banner */}
      {isOperationActive ? (
        <div
          className={cn(
            "mt-4 space-y-2.5 rounded-xl border p-3.5 shadow-2xs",
            switchingOver
              ? "border-primary/30 bg-primary/[0.06]"
              : "border-border/75 bg-surface",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div
              className={cn(
                "flex items-center gap-2 font-medium",
                switchingOver ? "text-primary" : "text-foreground",
              )}
            >
              <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
              <span>
                {switchingOver
                  ? "正在平滑切换新版本容器，等待服务就绪…"
                  : ACTIVE_STAGE_LABELS[activeStatus ?? ""] ||
                    "正在处理更新流程…"}
              </span>
            </div>
            {switchingOver ? (
              <Badge
                variant="outline"
                className="border-primary/25 bg-surface/80 font-mono text-[11px] text-primary"
              >
                自动重连探测中
              </Badge>
            ) : state?.phase ? (
              <Badge variant="warning" className="font-mono text-[11px]">
                阶段：{state.phase}
              </Badge>
            ) : null}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div className="animate-indeterminate h-full w-1/2 rounded-full bg-primary" />
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

      {!loading && !switchingOver && !status?.connected ? (
        <SettingsNotice tone="warning" className="mt-3.5">
          {status?.reason ||
            "尚未检测到宿主更新守护服务，当前仅支持在线检查新版本；如需一键升级请先配置宿主服务与通信密钥。"}
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
                  rawStatus === "warning" && "border-status-warning/30",
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

      {state?.status === "succeeded" && !switchingOver ? (
        <SettingsNotice tone="success" className="mt-4">
          平滑升级已完成，目标版本已连续通过健康就绪验收，当前运行版本信息已同步刷新。
        </SettingsNotice>
      ) : null}

      {state?.status === "rolled_back" ? (
        <SettingsNotice tone="warning" className="mt-4">
          目标版本就绪验收未通过，系统已自动回滚至原运行版本与冷备份状态。
        </SettingsNotice>
      ) : null}

      {state?.error && !switchingOver ? (
        <SettingsNotice tone="danger" className="mt-4">
          {state.error}
        </SettingsNotice>
      ) : null}

      <ConfirmDialog
        open={confirming}
        tone="warning"
        title="确认开始宿主机平滑升级？"
        description="宿主机更新服务将先排空正在处理的写入与创作任务，随后停止主容器、创建数据库冷备份并切换目标镜像；若新容器验收异常将自动回滚。"
        impactItems={[
          `版本升级路径：${sourceVersionLabel} → ${targetVersionLabel}`,
          "宿主机更新服务将拉取新镜像并平滑重建容器",
          "升级期间将出现约 5–15 秒容器切换窗口，页面会自动等待服务就绪",
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
      <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
    );
  }
  return <XCircle className="mt-0.5 size-4 shrink-0 text-status-danger" />;
}
