"use client";

import { useState, type ReactNode } from "react";
import { Play, ShieldCheck, TestTube2, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SettingsConfig } from "@/lib/settings-types";
import { cn } from "@/lib/utils";

import { SettingsNotice } from "./settings-ui";
import type { useMediaStorage } from "./use-media-storage";

type MediaStoragePipelinePanelProps = {
  config: SettingsConfig;
  storage: ReturnType<typeof useMediaStorage>;
  savedProvider: "local" | "r2";
  isDirty: boolean;
  savedHasR2Basics: boolean;
  draftHasR2Basics: boolean;
  restartRequired: boolean;
};

export function MediaStoragePipelinePanel({
  config,
  storage,
  savedProvider,
  isDirty,
  savedHasR2Basics,
  draftHasR2Basics,
  restartRequired,
}: MediaStoragePipelinePanelProps) {
  const [confirmCleanupOpen, setConfirmCleanupOpen] = useState(false);

  const running = storage.migration.state === "running";
  const cleanupRunning = storage.cleanup.state === "running";
  const isPipelineBusy =
    running ||
    cleanupRunning ||
    storage.isTesting ||
    storage.isStarting ||
    storage.isStartingCleanup;

  const progress =
    storage.migration.total > 0
      ? Math.min(
          100,
          Math.round((storage.migration.processed / storage.migration.total) * 100),
        )
      : storage.migration.state === "succeeded"
        ? 100
        : 0;

  const cleanupProgress =
    storage.cleanup.total > 0
      ? Math.min(
          100,
          Math.round((storage.cleanup.processed / storage.cleanup.total) * 100),
        )
      : storage.cleanup.state === "succeeded"
        ? 100
        : 0;

  const healthOK = storage.health?.status === "ok";

  const step1DisabledReason = !draftHasR2Basics
    ? "请先在左侧填写完整的 R2 Account ID、Bucket、Access Key ID 与密钥"
    : null;

  const step2DisabledReason = isDirty
    ? "存在未保存配置，请先保存存储更改"
    : !savedHasR2Basics
      ? "需先配置并保存完整的 R2 凭据"
      : null;

  const step3DisabledReason = isDirty
    ? "存在未保存配置，请先保存存储更改"
    : savedProvider !== "r2"
      ? "需先保存并启用 R2 存储后再校验远端副本"
      : !healthOK
        ? "请先执行第 1 步「检测 R2 连接」并确保状态正常"
        : null;

  const verifyReady =
    storage.cleanup.state === "succeeded" &&
    storage.cleanup.mode === "verify" &&
    Boolean(storage.cleanup.confirmation_token);

  const step4DisabledReason = restartRequired
    ? "存储模式切换尚未重启生效，重启前已锁定本地缓存清理"
    : isDirty
      ? "存在未保存配置，请先保存存储更改"
      : !verifyReady
        ? "需先完成第 3 步「校验已迁移对象」生成确认令牌"
        : storage.cleanup.eligible < 1
          ? "当前没有可安全释放的已迁移本地缓存文件"
          : null;

  return (
    <>
      <div className="flex flex-col gap-3.5 rounded-xl border border-border/75 bg-surface-subtle/45 p-4">
        <div className="space-y-1 border-b border-border/60 pb-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              R2 迁移与缓存清理流水线
            </h3>
            <Badge variant="outline" className="font-mono text-[10px]">
              4 STEPS
            </Badge>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            严格按序执行探测、存量同步、远端校验与本地空间释放，保障媒体零丢失。
          </p>
        </div>

        {restartRequired ? (
          <SettingsNotice tone="warning">
            已保存的存储后端（
            {savedProvider === "r2" ? "Cloudflare R2" : "本地磁盘"}
            ）与当前运行实例（
            {storage.activeProvider === "r2" ? "Cloudflare R2" : "本地磁盘"}
            ）不一致。请先重启服务完成切换；重启前已锁定第 4 步缓存清理。
          </SettingsNotice>
        ) : null}

        <div className="space-y-3">
          {/* Step 1 */}
          <PipelineStepCard
            step={1}
            title="连通性探测"
            badge={
              storage.health?.status === "ok" ? (
                <Badge variant="success">探测通过</Badge>
              ) : storage.health?.status === "error" ? (
                <Badge variant="danger">连接异常</Badge>
              ) : (
                <Badge variant="secondary">待探测</Badge>
              )
            }
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={storage.isTesting}
                disabled={isPipelineBusy || Boolean(step1DisabledReason)}
                onClick={() => void storage.testConnection()}
              >
                {!storage.isTesting ? <TestTube2 className="size-3.5" /> : null}
                检测 R2 连接
              </Button>
            }
            disabledHint={step1DisabledReason}
          >
            {storage.health?.status === "ok" ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-status-success">
                <span>
                  Bucket：{String(config.media_r2_bucket || "").trim() || "—"}
                </span>
                <span>
                  Prefix：
                  {String(config.media_r2_prefix || "shengtu-media").trim()}
                </span>
              </div>
            ) : storage.health?.error ? (
              <p className="break-all text-xs text-status-danger">
                异常详情：{storage.health.error}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                验证当前填写的 R2 账户、Bucket 与读写密钥是否可用。
              </p>
            )}
          </PipelineStepCard>

          {/* Step 2 */}
          <PipelineStepCard
            step={2}
            title="存量媒体迁移"
            badge={
              running ? (
                <Badge variant="warning" className="tabular-nums">
                  迁移中 {progress}%
                </Badge>
              ) : storage.migration.state === "succeeded" ? (
                <Badge variant="success">已完成</Badge>
              ) : storage.migration.state === "failed" ? (
                <Badge variant="danger">存在失败</Badge>
              ) : null
            }
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={storage.isStarting || running}
                disabled={isPipelineBusy || Boolean(step2DisabledReason)}
                onClick={() => void storage.startMigration()}
              >
                {!storage.isStarting && !running ? (
                  <Play className="size-3.5" />
                ) : null}
                {running ? `迁移中 ${progress}%` : "迁移存量媒体到 R2"}
              </Button>
            }
            disabledHint={step2DisabledReason}
          >
            {storage.migration.state !== "idle" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>处理进度</span>
                  <span className="font-mono tabular-nums text-foreground">
                    {storage.migration.processed} / {storage.migration.total}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-foreground transition-[width] duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
                  <span>已迁移 {storage.migration.migrated}</span>
                  <span>已跳过 {storage.migration.skipped}</span>
                  <span>待重试 {storage.migration.pending}</span>
                  <span
                    className={cn(
                      storage.migration.failed > 0 &&
                        "font-medium text-status-danger",
                    )}
                  >
                    失败 {storage.migration.failed}
                  </span>
                </div>
                {storage.migration.error ? (
                  <p className="break-all text-xs text-status-danger">
                    {storage.migration.error}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                将服务器本地历史图片与视频增量上传至 R2，期间不影响线上访问。
              </p>
            )}
          </PipelineStepCard>

          {/* Step 3 */}
          <PipelineStepCard
            step={3}
            title="完整性校验"
            badge={
              cleanupRunning && storage.cleanup.mode === "verify" ? (
                <Badge variant="warning" className="tabular-nums">
                  校验中 {cleanupProgress}%
                </Badge>
              ) : verifyReady ? (
                <Badge variant="success">校验通过</Badge>
              ) : storage.cleanup.mode === "verify" &&
                storage.cleanup.state === "failed" ? (
                <Badge variant="danger">校验异常</Badge>
              ) : null
            }
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={cleanupRunning && storage.cleanup.mode === "verify"}
                disabled={isPipelineBusy || Boolean(step3DisabledReason)}
                onClick={() => void storage.startCleanup("verify")}
              >
                {!(cleanupRunning && storage.cleanup.mode === "verify") ? (
                  <ShieldCheck className="size-3.5" />
                ) : null}
                {cleanupRunning && storage.cleanup.mode === "verify"
                  ? `校验中 ${cleanupProgress}%`
                  : "校验已迁移对象"}
              </Button>
            }
            disabledHint={step3DisabledReason}
          >
            {storage.cleanup.state !== "idle" &&
            storage.cleanup.mode === "verify" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>远端对象核对</span>
                  <span className="font-mono tabular-nums text-foreground">
                    {storage.cleanup.processed} / {storage.cleanup.total}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-foreground transition-[width] duration-300"
                    style={{ width: `${cleanupProgress}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
                  <span className="text-status-success">
                    已核验 {storage.cleanup.verified}
                  </span>
                  <span>可释放 {storage.cleanup.eligible}</span>
                  <span>跳过 {storage.cleanup.skipped}</span>
                  <span
                    className={cn(
                      storage.cleanup.failed > 0 &&
                        "font-medium text-status-danger",
                    )}
                  >
                    缺失/异常 {storage.cleanup.failed}
                  </span>
                  <span>
                    预计可回收 {formatBytes(storage.cleanup.reclaimable_bytes)}
                  </span>
                </div>
                {storage.cleanup.error ? (
                  <p className="break-all text-xs text-status-warning">
                    异常提示：{storage.cleanup.error}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                逐一比对 R2 对象存在性与大小，确认云端副本完整后签发清理令牌。
              </p>
            )}
          </PipelineStepCard>

          {/* Step 4 */}
          <PipelineStepCard
            step={4}
            title="释放本地缓存"
            badge={
              cleanupRunning && storage.cleanup.mode === "delete" ? (
                <Badge variant="warning" className="tabular-nums">
                  清理中 {cleanupProgress}%
                </Badge>
              ) : storage.cleanup.mode === "delete" &&
                storage.cleanup.state === "succeeded" ? (
                <Badge variant="success">
                  已释放 {formatBytes(storage.cleanup.freed_bytes)}
                </Badge>
              ) : null
            }
            action={
              <Button
                type="button"
                variant="destructive-outline"
                size="sm"
                loading={cleanupRunning && storage.cleanup.mode === "delete"}
                disabled={isPipelineBusy || Boolean(step4DisabledReason)}
                onClick={() => setConfirmCleanupOpen(true)}
              >
                {!(cleanupRunning && storage.cleanup.mode === "delete") ? (
                  <Trash2 className="size-3.5" />
                ) : null}
                {cleanupRunning && storage.cleanup.mode === "delete"
                  ? `清理中 ${cleanupProgress}%`
                  : "清理已迁移本地缓存"}
              </Button>
            }
            disabledHint={step4DisabledReason}
          >
            {storage.cleanup.state !== "idle" &&
            storage.cleanup.mode === "delete" ? (
              <div className="space-y-1.5 text-[11px] tabular-nums text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>已移除本地缓存 {storage.cleanup.removed_files} 个</span>
                  <span className="font-mono text-status-success">
                    已释放 {formatBytes(storage.cleanup.freed_bytes)}
                  </span>
                </div>
                {storage.cleanup.error ? (
                  <p className="break-all text-xs text-status-danger">
                    {storage.cleanup.error}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                仅移除已通过第 3 步云端完整性核验的本地缓存文件，保留数据库索引与 R2 对象。
              </p>
            )}
          </PipelineStepCard>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCleanupOpen}
        destructive
        title="确认清理已迁移的本地缓存文件？"
        description="该操作将删除服务器本地已确认存在于 Cloudflare R2 的冗余副本文件，释放宿主机磁盘空间。"
        impactItems={[
          `本次将清理 ${storage.cleanup.eligible} 个已通过 R2 完整性校验的本地文件`,
          `预计释放本地磁盘容量约 ${formatBytes(storage.cleanup.reclaimable_bytes)}`,
          "作品库数据库记录与 Cloudflare R2 云端对象均会完整保留",
        ]}
        confirmLabel="确认清理本地缓存"
        pendingLabel="正在启动清理…"
        pending={storage.isStartingCleanup}
        onClose={() => setConfirmCleanupOpen(false)}
        onConfirm={() => {
          setConfirmCleanupOpen(false);
          void storage.startCleanup("delete");
        }}
      />
    </>
  );
}

function PipelineStepCard({
  step,
  title,
  badge,
  action,
  disabledHint,
  children,
}: {
  step: number;
  title: string;
  badge?: ReactNode;
  action: ReactNode;
  disabledHint?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/75 bg-surface p-3.5 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-5.5 shrink-0 items-center justify-center rounded-md bg-surface-muted font-mono text-[11px] font-semibold tabular-nums text-foreground ring-1 ring-border/75">
            {step}
          </span>
          <span className="text-xs font-semibold text-foreground sm:text-[13px]">
            {title}
          </span>
          {badge}
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      <div className="mt-2.5 pl-7.5">{children}</div>
      {disabledHint ? (
        <div className="mt-2 pl-7.5 text-[11px] leading-4 text-status-warning">
          前置条件：{disabledHint}
        </div>
      ) : null}
    </div>
  );
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
