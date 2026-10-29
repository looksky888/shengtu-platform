"use client";

import { CheckCircle2, Circle, LoaderCircle, Play, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BackupState } from "@/lib/api";
import { cn } from "@/lib/utils";

import { SettingsNotice } from "./settings-ui";
import {
  BACKUP_PIPELINE_PHASES,
  backupStatusText,
  formatBackupDuration,
  formatBackupSize,
  type BackupFormState,
} from "./use-backup-settings";

type BackupStatusPanelProps = {
  form: BackupFormState;
  state: BackupState;
  isDirty: boolean;
  isSaving: boolean;
  isRunning: boolean;
  onRun: () => void | Promise<void>;
};

export function BackupStatusPanel({
  form,
  state,
  isDirty,
  isSaving,
  isRunning,
  onRun,
}: BackupStatusPanelProps) {
  const activePhaseIndex = BACKUP_PIPELINE_PHASES.findIndex(
    (item) => item.key === state.phase,
  );

  return (
    <div className="flex flex-col justify-between gap-4 rounded-xl border border-border/75 bg-surface-subtle/45 p-4">
      <div className="space-y-4">
        {/* Header & Status Pill */}
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold text-foreground">
              备份快照状态与实时流水线
            </h3>
            <p className="text-xs text-muted-foreground">
              {backupStatusText(state)}
            </p>
          </div>
          <Badge
            variant={
              state.status === "running"
                ? "warning"
                : state.status === "success"
                  ? "success"
                  : state.status === "failed"
                    ? "danger"
                    : "secondary"
            }
          >
            {state.status === "running"
              ? "执行中"
              : state.status === "success"
                ? "健康"
                : state.status === "failed"
                  ? "异常"
                  : "待命"}
          </Badge>
        </div>

        {isRunning ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div className="animate-indeterminate h-full w-1/2 rounded-full bg-foreground" />
          </div>
        ) : null}

        {/* 6-Phase Pipeline */}
        <div className="space-y-2 rounded-xl border border-border/75 bg-surface p-3.5 shadow-2xs">
          <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
            <span>6 阶段快照执行链路</span>
            <span className="font-mono tabular-nums">
              保留上限 {form.last_max_files || "20"} 份
            </span>
          </div>
          <div className="space-y-2">
            {BACKUP_PIPELINE_PHASES.map((phase, index) => {
              const skippedInLocal =
                phase.key === "uploading" && form.provider !== "cloudflare_r2";
              const isCurrentRunning =
                state.status === "running" && state.phase === phase.key;
              const isCompleted =
                !skippedInLocal &&
                (state.status === "success" ||
                  (state.status === "running" && activePhaseIndex > index));
              const isFailedHere =
                state.status === "failed" && activePhaseIndex === index;

              return (
                <div
                  key={phase.key}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                    isCurrentRunning
                      ? "bg-surface-subtle font-medium text-foreground ring-1 ring-border/80"
                      : "text-muted-foreground",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {isCurrentRunning ? (
                      <LoaderCircle className="size-3.5 shrink-0 animate-spin text-foreground" />
                    ) : isFailedHere ? (
                      <XCircle className="size-3.5 shrink-0 text-status-danger" />
                    ) : isCompleted ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-status-success" />
                    ) : (
                      <Circle className="size-3.5 shrink-0 text-muted-foreground/45" />
                    )}
                    <span
                      className={cn(
                        "truncate",
                        isCompleted && "text-foreground",
                      )}
                    >
                      {index + 1}. {phase.label}
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {skippedInLocal
                      ? "仅 R2 模式"
                      : isCurrentRunning
                        ? "处理中…"
                        : isCompleted
                          ? "已完成"
                          : phase.detail}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Latest Backup Snapshot Metrics */}
        <div className="grid grid-cols-2 gap-2.5">
          <SnapshotMetric
            label="最近归档大小"
            value={formatBackupSize(state.last_size)}
          />
          <SnapshotMetric
            label="归档文件总数"
            value={
              state.last_file_count ? `${state.last_file_count} 个` : "—"
            }
          />
          <SnapshotMetric
            label="执行耗时"
            value={formatBackupDuration(state.last_duration_ms)}
          />
          <SnapshotMetric
            label="最近成功时间"
            value={formatBackupTimestamp(state.last_success_at)}
          />
        </div>

        {state.last_file_name ? (
          <div className="space-y-1 rounded-xl border border-border/75 bg-surface px-3.5 py-2.5 text-xs">
            <div className="text-[11px] font-medium text-muted-foreground">
              最近归档文件名
            </div>
            <div className="break-all font-mono text-[11px] text-foreground">
              {state.last_file_name}
            </div>
            {state.remote_key ? (
              <div className="break-all pt-1 font-mono text-[11px] text-status-success">
                R2 对象：{state.remote_key}
              </div>
            ) : null}
          </div>
        ) : null}

        {state.last_error ? (
          <SettingsNotice tone="danger">
            最近异常：{state.last_error}
          </SettingsNotice>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-border/60 pt-3">
        {isDirty ? (
          <p className="text-[11px] text-status-warning">
            检测到未保存的策略更改，点击下方按钮将先保存配置再立即启动备份。
          </p>
        ) : null}
        <Button
          type="button"
          className="w-full"
          loading={isRunning}
          disabled={isSaving}
          onClick={() => void onRun()}
        >
          {!isRunning ? <Play className="size-4" /> : null}
          {isRunning
            ? "备份任务正在运行…"
            : isDirty
              ? "保存并立即备份"
              : "立即执行备份"}
        </Button>
      </div>
    </div>
  );
}

function SnapshotMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/75 bg-surface px-3 py-2.5 shadow-2xs">
      <div className="text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-xs font-semibold tabular-nums text-foreground sm:text-[13px]">
        {value}
      </div>
    </div>
  );
}

function formatBackupTimestamp(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}
