"use client";

import { useCallback, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Cloud,
  Database,
  HardDrive,
  LoaderCircle,
  Play,
  ShieldCheck,
  TestTube2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SettingsConfig } from "@/lib/settings-types";
import { cn } from "@/lib/utils";

import { extractSavedConfigSection, isConfigKeysDirty } from "../settings-dirty";
import { useRegisterSettingsDirty } from "../settings-dirty-registry-hooks";
import { useSettingsStore } from "../store";
import {
  SettingsCard,
  SettingsCardSaveFooter,
  SettingsNotice,
  SettingsSecretInput,
  SettingsSection,
  SettingsSwitchRow,
  SettingsUnitInput,
  settingsInputClassName,
} from "./settings-ui";
import { useMediaStorage } from "./use-media-storage";

const STORAGE_CONFIG_KEYS: readonly (keyof SettingsConfig)[] = [
  "media_storage_provider",
  "media_auto_cleanup_enabled",
  "media_r2_account_id",
  "media_r2_access_key_id",
  "media_r2_secret_access_key",
  "media_r2_bucket",
  "media_r2_prefix",
  "media_r2_presign_ttl_seconds",
];

export function MediaStorageCard() {
  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot
  );
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const savingSectionKey = useSettingsStore((state) => state.savingSectionKey);
  const saveConfigSection = useSettingsStore(
    (state) => state.saveConfigSection
  );
  const resetConfigSection = useSettingsStore(
    (state) => state.resetConfigSection
  );
  const setField = useSettingsStore((state) => state.setMediaStorageField);

  const storage = useMediaStorage(config);
  const [confirmCleanupOpen, setConfirmCleanupOpen] = useState(false);
  const [r2PreconfigExpanded, setR2PreconfigExpanded] = useState(false);

  const isDirty = isConfigKeysDirty(
    config,
    savedConfigSnapshot,
    STORAGE_CONFIG_KEYS
  );

  const validateStorage = useCallback(() => {
    if (!config) return true;
    const currentProvider =
      config.media_storage_provider === "r2" ? "r2" : "local";
    if (currentProvider === "r2") {
      const accountId = String(config.media_r2_account_id || "").trim();
      const bucket = String(config.media_r2_bucket || "").trim();
      const accessKeyId = String(config.media_r2_access_key_id || "").trim();
      const secretKey = String(config.media_r2_secret_access_key || "").trim();
      const hasSecret = Boolean(
        secretKey || config.media_r2_secret_access_key_configured
      );
      if (!accountId || !bucket || !accessKeyId || !hasSecret) {
        toast.error(
          "启用 Cloudflare R2 存储前，请完整填写 Account ID、Bucket、Access Key ID 与 Secret Access Key"
        );
        return false;
      }
      const ttl = Number(config.media_r2_presign_ttl_seconds);
      if (!Number.isFinite(ttl) || ttl < 60 || ttl > 604800) {
        toast.error("R2 预签名访问有效期需在 60 - 604800 秒之间");
        return false;
      }
    }
    return true;
  }, [config]);

  useRegisterSettingsDirty({
    id: "media-storage-validator",
    tab: "storage",
    label: "媒体存储",
    isDirty: false,
    validate: validateStorage,
  });

  if (isLoadingConfig || !config || storage.isLoading) {
    return (
      <SettingsCard
        icon={Database}
        title="媒体存储"
        description="管理创作媒体持久化后端、到期回收策略与 Cloudflare R2 平滑迁移流水线"
        className="md:col-span-2"
      >
        <div className="flex min-h-48 items-center justify-center">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        </div>
      </SettingsCard>
    );
  }

  const provider = config.media_storage_provider === "r2" ? "r2" : "local";
  const savedBaseline = extractSavedConfigSection(
    savedConfigSnapshot,
    STORAGE_CONFIG_KEYS
  );
  const savedProvider =
    savedBaseline.media_storage_provider === "r2" ? "r2" : "local";
  const savedHasR2Basics = Boolean(
    String(savedBaseline.media_r2_account_id || "").trim() &&
      String(savedBaseline.media_r2_bucket || "").trim() &&
      String(savedBaseline.media_r2_access_key_id || "").trim() &&
      config.media_r2_secret_access_key_configured
  );
  const draftHasR2Basics = Boolean(
    String(config.media_r2_account_id || "").trim() &&
      String(config.media_r2_bucket || "").trim() &&
      String(config.media_r2_access_key_id || "").trim() &&
      (String(config.media_r2_secret_access_key || "").trim() ||
        config.media_r2_secret_access_key_configured)
  );

  const running = storage.migration.state === "running";
  const cleanupRunning = storage.cleanup.state === "running";
  const isPipelineBusy =
    running ||
    cleanupRunning ||
    storage.isTesting ||
    storage.isStarting ||
    storage.isStartingCleanup;
  const isSavingThisCard =
    isSavingConfig &&
    (savingSectionKey === "media_storage" || savingSectionKey === "__all__");

  const progress =
    storage.migration.total > 0
      ? Math.min(
          100,
          Math.round(
            (storage.migration.processed / storage.migration.total) * 100
          )
        )
      : storage.migration.state === "succeeded"
        ? 100
        : 0;

  const cleanupProgress =
    storage.cleanup.total > 0
      ? Math.min(
          100,
          Math.round((storage.cleanup.processed / storage.cleanup.total) * 100)
        )
      : storage.cleanup.state === "succeeded"
        ? 100
        : 0;

  const healthOK = storage.health?.status === "ok";
  const restartRequired = storage.activeProvider !== savedProvider;
  const showR2Fields = provider === "r2" || r2PreconfigExpanded;

  const imageRetentionDays = Math.max(
    1,
    Number(config.image_retention_days) || 30
  );
  const videoRetentionDays = Math.max(
    1,
    Number(config.video_retention_days) || 30
  );

  const handleSave = async () => {
    if (!validateStorage()) return;
    const receipt = await saveConfigSection(STORAGE_CONFIG_KEYS, {
      sectionKey: "media_storage",
    });
    if (receipt) {
      void storage.reloadOverview({ silent: true });
    }
  };

  // Pipeline precondition reasons
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
    <SettingsCard
      icon={Database}
      title="媒体存储"
      description="配置生成图片与视频的持久化后端、到期自动回收策略及 Cloudflare R2 平滑迁移流水线"
      tone="slate"
      className="md:col-span-2"
      meta={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="tabular-nums">
            当前运行：
            {storage.activeProvider === "r2" ? "Cloudflare R2" : "本地磁盘"}
          </Badge>
          {restartRequired ? (
            <Badge variant="warning">待重启生效</Badge>
          ) : healthOK ? (
            <Badge variant="success">R2 连通正常</Badge>
          ) : savedProvider === "r2" ? (
            <Badge variant="warning">R2 待探测</Badge>
          ) : null}
        </div>
      }
      footer={
        <SettingsCardSaveFooter
          dirty={isDirty}
          saving={isSavingThisCard}
          disabled={running || cleanupRunning}
          hint={
            restartRequired
              ? "存储后端变更已保存，需重启主服务使新存储后端接管读写"
              : isDirty && provider !== storage.activeProvider
                ? "切换存储后端模式在保存后需重启主服务完全生效"
                : undefined
          }
          onReset={() => resetConfigSection(STORAGE_CONFIG_KEYS)}
          onSave={() => void handleSave()}
        />
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.18fr_0.82fr]">
        {/* Left Column: Storage Mode, Auto Cleanup & R2 Credentials */}
        <div className="min-w-0 space-y-5">
          <SettingsSection
            title="存储后端模式"
            description="选择新生成图片与视频文件的默认写入位置"
            badge={<Badge variant="outline">切换需重启生效</Badge>}
          >
            <div
              role="radiogroup"
              aria-label="存储后端模式"
              className="grid gap-3 sm:grid-cols-2"
            >
              <StorageModeOption
                active={provider === "local"}
                disabled={running || cleanupRunning}
                icon={HardDrive}
                title="本地磁盘存储 (local)"
                subtitle="写入宿主机挂载数据卷，零外部依赖、低延迟读取"
                badge={storage.activeProvider === "local" ? "运行中" : undefined}
                onSelect={() => setField({ media_storage_provider: "local" })}
              />
              <StorageModeOption
                active={provider === "r2"}
                disabled={running || cleanupRunning}
                icon={Cloud}
                title="Cloudflare R2 对象存储 (r2)"
                subtitle="S3 兼容云端存储，弹性扩容并支持预签名直链访问"
                badge={storage.activeProvider === "r2" ? "运行中" : undefined}
                onSelect={() =>
                  setField({
                    media_storage_provider: "r2",
                    media_auto_cleanup_enabled: false,
                  })
                }
              />
            </div>
          </SettingsSection>

          <SettingsSection
            title="本地空间回收策略"
            description="按保留周期自动清理过期的本地媒体文件"
          >
            <SettingsSwitchRow
              id="media-auto-cleanup"
              title="到期自动清理过期媒体文件"
              description={`依据「基础与品牌」配置的保留期（当前图片 ${imageRetentionDays} 天 / 视频 ${videoRetentionDays} 天）定时回收服务器本地文件，不会删除 R2 云端对象。`}
              badge={
                provider === "r2" ? (
                  <Badge variant="secondary">R2 模式下默认关闭</Badge>
                ) : undefined
              }
              checked={Boolean(config.media_auto_cleanup_enabled)}
              disabled={running || cleanupRunning}
              onCheckedChange={(checked) =>
                setField({ media_auto_cleanup_enabled: checked })
              }
            />
          </SettingsSection>

          <SettingsSection
            title="Cloudflare R2 对象存储凭据"
            description={
              provider === "r2"
                ? "请提供具备目标 Bucket 对象读写权限的 S3 API 令牌"
                : "可在保持本地存储期间预配置 R2 凭据，完成连接测试与存量迁移后再平滑切换"
            }
            badge={
              config.media_r2_secret_access_key_configured ? (
                <Badge variant="success">已保存凭据</Badge>
              ) : undefined
            }
            action={
              provider === "local" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setR2PreconfigExpanded((prev) => !prev)}
                  className="h-8 gap-1.5 text-xs"
                >
                  {r2PreconfigExpanded ? (
                    <>
                      <ChevronUp className="size-3.5" />
                      收起 R2 凭据
                    </>
                  ) : (
                    <>
                      <ChevronDown className="size-3.5" />
                      展开预配置 R2 凭据
                    </>
                  )}
                </Button>
              ) : null
            }
          >
            {showR2Fields ? (
              <div className="grid gap-3.5 rounded-xl border border-border/75 bg-surface-subtle/45 p-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="media-r2-account"
                    className="text-xs font-medium text-foreground sm:text-[13px]"
                  >
                    Account ID
                  </label>
                  <Input
                    id="media-r2-account"
                    value={String(config.media_r2_account_id || "")}
                    placeholder="Cloudflare 32 位账户 ID"
                    disabled={running || cleanupRunning}
                    onChange={(event) =>
                      setField({ media_r2_account_id: event.target.value })
                    }
                    className={cn(
                      settingsInputClassName,
                      "h-9 font-mono text-xs sm:text-[13px]"
                    )}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="media-r2-bucket"
                    className="text-xs font-medium text-foreground sm:text-[13px]"
                  >
                    Bucket 名称
                  </label>
                  <Input
                    id="media-r2-bucket"
                    value={String(config.media_r2_bucket || "")}
                    placeholder="例如 shengtu-media"
                    disabled={running || cleanupRunning}
                    onChange={(event) =>
                      setField({ media_r2_bucket: event.target.value })
                    }
                    className={cn(
                      settingsInputClassName,
                      "h-9 font-mono text-xs sm:text-[13px]"
                    )}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="media-r2-access"
                    className="text-xs font-medium text-foreground sm:text-[13px]"
                  >
                    Access Key ID
                  </label>
                  <Input
                    id="media-r2-access"
                    value={String(config.media_r2_access_key_id || "")}
                    placeholder="R2 S3 API Access Key ID"
                    disabled={running || cleanupRunning}
                    onChange={(event) =>
                      setField({ media_r2_access_key_id: event.target.value })
                    }
                    className={cn(
                      settingsInputClassName,
                      "h-9 font-mono text-xs sm:text-[13px]"
                    )}
                  />
                </div>

                <SettingsSecretInput
                  id="media-r2-secret"
                  label="Secret Access Key"
                  value={String(config.media_r2_secret_access_key || "")}
                  configured={Boolean(
                    config.media_r2_secret_access_key_configured
                  )}
                  disabled={running || cleanupRunning}
                  onChange={(value) =>
                    setField({ media_r2_secret_access_key: value })
                  }
                  onClear={() => setField({ media_r2_secret_access_key: "" })}
                />

                <div className="space-y-1.5">
                  <label
                    htmlFor="media-r2-prefix"
                    className="text-xs font-medium text-foreground sm:text-[13px]"
                  >
                    对象路径前缀 (Prefix)
                  </label>
                  <Input
                    id="media-r2-prefix"
                    value={String(config.media_r2_prefix || "shengtu-media")}
                    placeholder="shengtu-media"
                    disabled={running || cleanupRunning}
                    onChange={(event) =>
                      setField({ media_r2_prefix: event.target.value })
                    }
                    className={cn(
                      settingsInputClassName,
                      "h-9 font-mono text-xs sm:text-[13px]"
                    )}
                  />
                </div>

                <SettingsUnitInput
                  id="media-r2-ttl"
                  label="预签名访问有效期"
                  unit="秒"
                  min={60}
                  max={604800}
                  rangeHint="60 - 604800"
                  value={String(config.media_r2_presign_ttl_seconds ?? 300)}
                  disabled={running || cleanupRunning}
                  onChange={(value) =>
                    setField({ media_r2_presign_ttl_seconds: value })
                  }
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/75 bg-surface-subtle/35 px-4 py-3 text-xs leading-5 text-muted-foreground">
                当前使用本地磁盘存储。如需平滑迁移到云端，可点击右上角「展开预配置 R2 凭据」提前完成连通探测与存量文件上传。
              </div>
            )}
          </SettingsSection>
        </div>

        {/* Right Column: 4-Step R2 Migration & Cleanup Pipeline */}
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
                          "font-medium text-status-danger"
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
                          "font-medium text-status-danger"
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
    </SettingsCard>
  );
}

function StorageModeOption({
  active,
  badge,
  disabled,
  icon: Icon,
  onSelect,
  subtitle,
  title,
}: {
  active: boolean;
  badge?: string;
  disabled?: boolean;
  icon: typeof HardDrive;
  onSelect: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-colors",
        active
          ? "border-foreground/45 bg-surface shadow-2xs ring-1 ring-foreground/15"
          : "border-border/75 bg-surface-subtle/45 hover:border-border-strong/75 hover:bg-surface-hover/55",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-lg ring-1",
            active
              ? "bg-foreground text-background ring-foreground"
              : "bg-surface text-muted-foreground ring-border/75"
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <div className="flex items-center gap-1.5">
          {badge ? (
            <Badge variant="success" className="h-5 px-1.5 text-[10px]">
              {badge}
            </Badge>
          ) : null}
          <span
            className={cn(
              "size-2 rounded-full",
              active ? "bg-foreground" : "bg-border-strong"
            )}
          />
        </div>
      </div>
      <div className="space-y-0.5">
        <div className="text-xs font-semibold text-foreground sm:text-[13px]">
          {title}
        </div>
        <p className="text-[11px] leading-4.5 text-muted-foreground">
          {subtitle}
        </p>
      </div>
    </button>
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
  badge?: React.ReactNode;
  action: React.ReactNode;
  disabledHint?: string | null;
  children: React.ReactNode;
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
    Math.floor(Math.log(value) / Math.log(1024))
  );
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
