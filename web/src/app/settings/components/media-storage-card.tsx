"use client";

import { useCallback, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Cloud,
  Database,
  HardDrive,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { SettingsConfig } from "@/lib/settings-types";
import { cn } from "@/lib/utils";

import {
  extractSavedConfigSection,
  isConfigKeysDirty,
} from "../settings-dirty";
import { useRegisterSettingsDirty } from "../settings-dirty-registry-hooks";
import { useSettingsStore } from "../store";
import { MediaStoragePipelinePanel } from "./media-storage-pipeline-panel";
import {
  SettingsCard,
  SettingsCardSaveFooter,
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
  "image_retention_days",
  "video_retention_days",
  "media_r2_account_id",
  "media_r2_access_key_id",
  "media_r2_secret_access_key",
  "media_r2_bucket",
  "media_r2_prefix",
  "media_r2_presign_ttl_seconds",
];

function checkBoundedInt(
  raw: unknown,
  min: number,
  max: number,
  label: string,
): string | undefined {
  const text = raw === undefined || raw === null ? "" : String(raw).trim();
  const num = text === "" ? Number.NaN : Number(text);
  if (!Number.isInteger(num) || num < min || num > max) {
    return `${label}需为 ${min}–${max} 之间的整数`;
  }
  return undefined;
}

export function MediaStorageCard() {
  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot,
  );
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const savingSectionKey = useSettingsStore((state) => state.savingSectionKey);
  const saveConfigSection = useSettingsStore(
    (state) => state.saveConfigSection,
  );
  const resetConfigSection = useSettingsStore(
    (state) => state.resetConfigSection,
  );
  const setField = useSettingsStore((state) => state.setMediaStorageField);
  const setImageRetentionDays = useSettingsStore(
    (state) => state.setImageRetentionDays,
  );
  const setVideoRetentionDays = useSettingsStore(
    (state) => state.setVideoRetentionDays,
  );

  const storage = useMediaStorage(config);
  const [r2PreconfigExpanded, setR2PreconfigExpanded] = useState(false);

  const isDirty = isConfigKeysDirty(
    config,
    savedConfigSnapshot,
    STORAGE_CONFIG_KEYS,
  );

  const validateStorage = useCallback(() => {
    const latest = useSettingsStore.getState().config;
    if (!latest) return true;

    const imgErr = checkBoundedInt(
      latest.image_retention_days ?? 30,
      1,
      3650,
      "图片默认保留天数",
    );
    if (imgErr) {
      toast.error(imgErr);
      return false;
    }

    const vidErr = checkBoundedInt(
      latest.video_retention_days ?? 30,
      1,
      3650,
      "视频默认保留天数",
    );
    if (vidErr) {
      toast.error(vidErr);
      return false;
    }

    const currentProvider =
      latest.media_storage_provider === "r2" ? "r2" : "local";
    if (currentProvider === "r2") {
      const accountId = String(latest.media_r2_account_id || "").trim();
      const bucket = String(latest.media_r2_bucket || "").trim();
      const accessKeyId = String(latest.media_r2_access_key_id || "").trim();
      const secretKey = String(latest.media_r2_secret_access_key || "").trim();
      const hasSecret = Boolean(
        secretKey || latest.media_r2_secret_access_key_configured,
      );
      if (!accountId || !bucket || !accessKeyId || !hasSecret) {
        toast.error(
          "启用 Cloudflare R2 存储前，请完整填写账户 ID、存储桶名称、访问密钥 ID 与私有访问密钥",
        );
        return false;
      }
      const ttlErr = checkBoundedInt(
        latest.media_r2_presign_ttl_seconds ?? 300,
        60,
        3600,
        "R2 预签名访问有效期",
      );
      if (ttlErr) {
        toast.error(ttlErr);
        return false;
      }
    }
    return true;
  }, []);

  const handleSave = useCallback(async () => {
    if (!validateStorage()) return false;
    const receipt = await saveConfigSection(STORAGE_CONFIG_KEYS, {
      sectionKey: "media_storage",
    });
    if (receipt) {
      void storage.reloadOverview({ silent: true });
      return true;
    }
    return false;
  }, [saveConfigSection, storage, validateStorage]);

  const handleDiscard = useCallback(() => {
    resetConfigSection(STORAGE_CONFIG_KEYS);
    return true;
  }, [resetConfigSection]);

  useRegisterSettingsDirty({
    id: "media-storage",
    tab: "media",
    label: "媒体存储后端与清理",
    isDirty,
    validate: validateStorage,
    save: handleSave,
    discard: handleDiscard,
  });

  if (isLoadingConfig || !config || storage.isLoading) {
    return (
      <SettingsCard
        icon={Database}
        title="存储后端与 R2 平滑迁移"
        description="管理创作媒体持久化后端、到期回收策略与 Cloudflare R2 平滑迁移流水线"
        className="md:col-span-2"
      >
        <div className="grid gap-5 py-1 lg:grid-cols-[1.18fr_0.82fr]">
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      </SettingsCard>
    );
  }

  const provider = config.media_storage_provider === "r2" ? "r2" : "local";
  const savedBaseline = extractSavedConfigSection(
    savedConfigSnapshot,
    STORAGE_CONFIG_KEYS,
  );
  const savedProvider =
    savedBaseline.media_storage_provider === "r2" ? "r2" : "local";
  const savedHasR2Basics = Boolean(
    String(savedBaseline.media_r2_account_id || "").trim() &&
      String(savedBaseline.media_r2_bucket || "").trim() &&
      String(savedBaseline.media_r2_access_key_id || "").trim() &&
      config.media_r2_secret_access_key_configured,
  );
  const draftHasR2Basics = Boolean(
    String(config.media_r2_account_id || "").trim() &&
      String(config.media_r2_bucket || "").trim() &&
      String(config.media_r2_access_key_id || "").trim() &&
      (String(config.media_r2_secret_access_key || "").trim() ||
        config.media_r2_secret_access_key_configured),
  );

  const running = storage.migration.state === "running";
  const cleanupRunning = storage.cleanup.state === "running";
  const isSavingThisCard =
    isSavingConfig &&
    (savingSectionKey === "media_storage" || savingSectionKey === "__all__");

  const healthOK = storage.health?.status === "ok";
  const restartRequired = storage.activeProvider !== savedProvider;
  const showR2Fields = provider === "r2" || r2PreconfigExpanded;

  const imageRetentionDays = Math.max(
    1,
    Number(config.image_retention_days) || 30,
  );
  const videoRetentionDays = Math.max(
    1,
    Number(config.video_retention_days) || 30,
  );

  const imageRetentionError = checkBoundedInt(
    config.image_retention_days ?? 30,
    1,
    3650,
    "图片默认保留天数",
  );
  const videoRetentionError = checkBoundedInt(
    config.video_retention_days ?? 30,
    1,
    3650,
    "视频默认保留天数",
  );
  const r2TtlError =
    provider === "r2"
      ? checkBoundedInt(
          config.media_r2_presign_ttl_seconds ?? 300,
          60,
          3600,
          "预签名访问有效期",
        )
      : undefined;

  const normalizeRetentionOnBlur = (
    key: "image_retention_days" | "video_retention_days",
    setter: (value: string) => void,
    fallback: number,
  ) => {
    const raw = String(config[key] ?? "").trim();
    if (!raw) {
      const restored = Math.max(1, Number(savedBaseline[key]) || fallback);
      setter(String(restored));
      return;
    }
    if (/^-?\d+$/.test(raw)) {
      const parsed = Number(raw);
      if (Number.isSafeInteger(parsed)) {
        setter(String(parsed));
      }
    }
  };

  const normalizeTtlOnBlur = () => {
    const raw = String(config.media_r2_presign_ttl_seconds ?? "").trim();
    if (!raw) {
      const restored = Math.max(
        60,
        Number(savedBaseline.media_r2_presign_ttl_seconds) || 300,
      );
      setField({ media_r2_presign_ttl_seconds: restored });
      return;
    }
    if (/^-?\d+$/.test(raw)) {
      const parsed = Number(raw);
      if (Number.isSafeInteger(parsed)) {
        setField({ media_r2_presign_ttl_seconds: parsed });
      }
    }
  };

  return (
    <SettingsCard
      icon={Database}
      title="存储后端与 R2 平滑迁移"
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
          onReset={handleDiscard}
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
                title="本地磁盘存储"
                subtitle="写入宿主机挂载数据卷，零外部依赖、低延迟读取"
                badge={
                  storage.activeProvider === "local" ? "运行中" : undefined
                }
                onSelect={() => setField({ media_storage_provider: "local" })}
              />
              <StorageModeOption
                active={provider === "r2"}
                disabled={running || cleanupRunning}
                icon={Cloud}
                title="Cloudflare R2 对象存储"
                subtitle="兼容 S3 的云端对象存储，弹性扩容并支持预签名访问"
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
            title="本地空间回收与默认保留周期"
            description="配置图片与视频的基础保留天数；仅在开启「到期自动清理」时定时回收本地磁盘文件，启用云存储会员模式时则与会员阶梯留存策略协同生效"
          >
            <div className="space-y-3">
              <SettingsSwitchRow
                id="media-auto-cleanup"
                title="到期自动清理过期媒体文件"
                description={`开启后按下方设定的保留周期（当前图片 ${imageRetentionDays} 天 / 视频 ${videoRetentionDays} 天）定时回收服务器本地文件，不会删除 R2 云端对象。`}
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

              <div className="grid gap-3 rounded-xl border border-border/75 bg-surface-subtle/45 p-3.5 sm:grid-cols-2">
                <SettingsUnitInput
                  id="media-image-retention-days"
                  label="图片默认保留天数"
                  unit="天"
                  min={1}
                  max={3650}
                  rangeHint="1–3650"
                  value={String(config.image_retention_days ?? 30)}
                  error={imageRetentionError}
                  disabled={running || cleanupRunning}
                  onChange={setImageRetentionDays}
                  onBlur={() =>
                    normalizeRetentionOnBlur(
                      "image_retention_days",
                      setImageRetentionDays,
                      30,
                    )
                  }
                />
                <SettingsUnitInput
                  id="media-video-retention-days"
                  label="视频默认保留天数"
                  unit="天"
                  min={1}
                  max={3650}
                  rangeHint="1–3650"
                  value={String(config.video_retention_days ?? 30)}
                  error={videoRetentionError}
                  disabled={running || cleanupRunning}
                  onChange={setVideoRetentionDays}
                  onBlur={() =>
                    normalizeRetentionOnBlur(
                      "video_retention_days",
                      setVideoRetentionDays,
                      30,
                    )
                  }
                />
                <p className="text-[11px] leading-4.5 text-muted-foreground sm:col-span-2">
                  说明：仅当开启「到期自动清理过期媒体文件」或启用上方「云存储付费会员制」时，过期回收才会按对应周期执行；两者均关闭时，媒体文件永久留存。
                </p>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Cloudflare R2 对象存储凭据"
            description={
              provider === "r2"
                ? "请提供具备目标存储桶对象读写权限的访问令牌"
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
                    Cloudflare 账户 ID
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
                      "h-9 font-mono text-xs sm:text-[13px]",
                    )}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="media-r2-bucket"
                    className="text-xs font-medium text-foreground sm:text-[13px]"
                  >
                    存储桶名称
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
                      "h-9 font-mono text-xs sm:text-[13px]",
                    )}
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="media-r2-access"
                    className="text-xs font-medium text-foreground sm:text-[13px]"
                  >
                    访问密钥 ID (Access Key ID)
                  </label>
                  <Input
                    id="media-r2-access"
                    value={String(config.media_r2_access_key_id || "")}
                    placeholder="R2 S3 访问密钥 ID"
                    disabled={running || cleanupRunning}
                    onChange={(event) =>
                      setField({ media_r2_access_key_id: event.target.value })
                    }
                    className={cn(
                      settingsInputClassName,
                      "h-9 font-mono text-xs sm:text-[13px]",
                    )}
                  />
                </div>

                <SettingsSecretInput
                  id="media-r2-secret"
                  label="私有访问密钥 (Secret Access Key)"
                  value={String(config.media_r2_secret_access_key || "")}
                  configured={Boolean(
                    config.media_r2_secret_access_key_configured,
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
                    对象路径前缀
                  </label>
                  <Input
                    id="media-r2-prefix"
                    value={String(config.media_r2_prefix ?? "")}
                    placeholder="留空默认使用 shengtu-media"
                    disabled={running || cleanupRunning}
                    onChange={(event) =>
                      setField({ media_r2_prefix: event.target.value })
                    }
                    className={cn(
                      settingsInputClassName,
                      "h-9 font-mono text-xs sm:text-[13px]",
                    )}
                  />
                </div>

                <SettingsUnitInput
                  id="media-r2-ttl"
                  label="预签名访问有效期"
                  unit="秒"
                  min={60}
                  max={3600}
                  rangeHint="60–3600"
                  value={String(config.media_r2_presign_ttl_seconds ?? 300)}
                  error={r2TtlError}
                  disabled={running || cleanupRunning}
                  onChange={(value) =>
                    setField({ media_r2_presign_ttl_seconds: value })
                  }
                  onBlur={normalizeTtlOnBlur}
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
        <MediaStoragePipelinePanel
          config={config}
          storage={storage}
          savedProvider={savedProvider}
          isDirty={isDirty}
          savedHasR2Basics={savedHasR2Basics}
          draftHasR2Basics={draftHasR2Basics}
          restartRequired={restartRequired}
        />
      </div>
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
          ? "border-primary/40 bg-primary/[0.07] text-primary shadow-2xs ring-1 ring-primary/20"
          : "border-border/75 bg-surface-subtle/45 hover:border-border-strong/75 hover:bg-surface-hover/55",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-lg ring-1",
            active
              ? "bg-primary text-primary-foreground ring-primary"
              : "bg-surface text-muted-foreground ring-border/75",
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
              active ? "bg-primary" : "bg-border-strong",
            )}
          />
        </div>
      </div>
      <div className="space-y-0.5">
        <div
          className={cn(
            "text-xs font-semibold sm:text-[13px]",
            active ? "text-primary" : "text-foreground",
          )}
        >
          {title}
        </div>
        <p className="text-[11px] leading-4.5 text-muted-foreground">
          {subtitle}
        </p>
      </div>
    </button>
  );
}
