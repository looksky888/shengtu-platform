"use client";

import { useState } from "react";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Cloud,
  HardDrive,
  LoaderCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { BackupStatusPanel } from "./backup-status-panel";
import {
  SettingsCard,
  SettingsCardSaveFooter,
  SettingsSecretInput,
  SettingsSection,
  SettingsSwitchRow,
  SettingsUnitInput,
  settingsInputClassName,
} from "./settings-ui";
import { useBackupSettings } from "./use-backup-settings";

const INCLUDE_OPTIONS = [
  {
    value: "config",
    label: "系统配置文件",
    hint: "环境变量覆盖项与运行参数",
  },
  {
    value: "data",
    label: "数据库与核心状态",
    hint: "一致性冷快照与 JSON 元数据",
  },
  {
    value: "images",
    label: "本地媒体文件",
    hint: "已生成的图片与缩略图资产",
  },
] as const;

export function BackupSettingsCard() {
  const {
    form,
    updateForm,
    state,
    isDirty,
    isLoading,
    isSaving,
    isRunning,
    updateInclude,
    save,
    discard,
    run,
  } = useBackupSettings();

  const [r2PreconfigExpanded, setR2PreconfigExpanded] = useState(false);

  if (isLoading) {
    return (
      <SettingsCard
        icon={Archive}
        title="数据备份与容灾策略"
        description="配置自动化归档周期、保留份数上限与 Cloudflare R2 异地容灾快照"
        tone="violet"
      >
        <div className="flex min-h-48 items-center justify-center">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        </div>
      </SettingsCard>
    );
  }

  const showR2Fields =
    form.provider === "cloudflare_r2" || r2PreconfigExpanded;
  const parsedHours = Number(form.interval_hours);
  const intervalHint =
    Number.isFinite(parsedHours) && parsedHours > 0
      ? `折合 ${Math.round(parsedHours * 60)} 分钟执行一次定时快照`
      : "建议设置为 12 或 24 小时";

  return (
    <SettingsCard
      icon={Archive}
      title="数据备份与容灾策略"
      description="配置全站数据库一致性快照、本地归档轮转份数与 Cloudflare R2 异地容灾存储"
      tone="violet"
      meta={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={form.enabled ? "success" : "secondary"}>
            {form.enabled ? "自动备份已开启" : "仅手动触发"}
          </Badge>
          {form.provider === "cloudflare_r2" ? (
            <Badge variant="outline">本地 + R2 双写</Badge>
          ) : (
            <Badge variant="outline">本地归档</Badge>
          )}
        </div>
      }
      footer={
        <SettingsCardSaveFooter
          dirty={isDirty}
          saving={isSaving}
          disabled={isRunning}
          onReset={discard}
          onSave={() => void save()}
        />
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Left Column: Policy, Retention, Storage Mode & R2 Credentials */}
        <div className="min-w-0 space-y-5">
          <SettingsSection
            title="定时计划与保留策略"
            description="控制后台自动创建冷快照的频率及本地归档包的最大保留数量"
          >
            <div className="space-y-3.5">
              <SettingsSwitchRow
                id="backup-auto-enabled"
                title="启用自动定时备份"
                description="开启后由后台调度器按设定间隔自动生成 ZIP 快照并轮转旧归档"
                checked={form.enabled}
                disabled={isSaving || isRunning}
                onCheckedChange={(checked) => updateForm({ enabled: checked })}
              />

              <div className="grid gap-3.5 sm:grid-cols-2">
                <SettingsUnitInput
                  id="backup-interval-hours"
                  label="备份执行间隔"
                  unit="小时"
                  min={1}
                  max={720}
                  rangeHint="1 - 720"
                  value={form.interval_hours}
                  description={intervalHint}
                  disabled={isSaving || isRunning}
                  onChange={(value) => updateForm({ interval_hours: value })}
                />

                <SettingsUnitInput
                  id="backup-max-files"
                  label="最大保留备份份数"
                  unit="份"
                  min={1}
                  max={100}
                  rangeHint="1 - 100"
                  value={form.last_max_files}
                  description="超出上限后自动删除最早的本地备份包"
                  disabled={isSaving || isRunning}
                  onChange={(value) => updateForm({ last_max_files: value })}
                />
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            title="归档范围与存储方式"
            description="支持纯本地磁盘归档，或在打包完成后同步上传至 Cloudflare R2 异地容灾"
          >
            <div className="space-y-3.5">
              <div
                role="radiogroup"
                aria-label="备份存储方式"
                className="grid gap-3 sm:grid-cols-2"
              >
                <BackupProviderOption
                  active={form.provider === "local"}
                  disabled={isSaving || isRunning}
                  icon={HardDrive}
                  title="本地归档"
                  subtitle="生成校验 ZIP 包并保存在服务器本地目录"
                  onSelect={() => updateForm({ provider: "local" })}
                />
                <BackupProviderOption
                  active={form.provider === "cloudflare_r2"}
                  disabled={isSaving || isRunning}
                  icon={Cloud}
                  title="本地 + R2 异地容灾"
                  subtitle="本地落盘后自动加密上传至 Cloudflare R2"
                  onSelect={() => updateForm({ provider: "cloudflare_r2" })}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="backup-local-dir"
                  className="text-xs font-medium text-foreground sm:text-[13px]"
                >
                  本地归档目录
                </label>
                <Input
                  id="backup-local-dir"
                  value={form.local_dir}
                  disabled={isSaving || isRunning}
                  placeholder="data/backups"
                  onChange={(event) =>
                    updateForm({ local_dir: event.target.value })
                  }
                  className={cn(
                    settingsInputClassName,
                    "h-9 font-mono text-xs sm:text-[13px]",
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-foreground sm:text-[13px]">
                  纳入备份的数据模块
                </div>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {INCLUDE_OPTIONS.map((option) => {
                    const checked = form.include.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className={cn(
                          "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors",
                          checked
                            ? "border-foreground/35 bg-surface shadow-2xs"
                            : "border-border/75 bg-surface-subtle/45 hover:bg-surface-hover/55",
                          (isSaving || isRunning) &&
                            "pointer-events-none opacity-60",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={isSaving || isRunning}
                          onCheckedChange={(next) =>
                            updateInclude(option.value, Boolean(next))
                          }
                          className="mt-0.5"
                        />
                        <div className="min-w-0 space-y-0.5">
                          <div className="text-xs font-semibold text-foreground">
                            {option.label}
                          </div>
                          <div className="text-[11px] leading-4 text-muted-foreground">
                            {option.hint}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Cloudflare R2 容灾凭据"
            description="建议为备份单独创建独立的 R2 Bucket 与最小权限读写令牌"
            badge={
              form.r2_secret_access_key_configured ? (
                <Badge variant="success">密钥已保存</Badge>
              ) : undefined
            }
            action={
              form.provider === "local" ? (
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
              <div className="space-y-3.5 rounded-xl border border-border/75 bg-surface-subtle/45 p-4">
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="backup-r2-account"
                      className="text-xs font-medium text-foreground sm:text-[13px]"
                    >
                      R2 Account ID
                    </label>
                    <Input
                      id="backup-r2-account"
                      value={form.r2_account_id}
                      disabled={isSaving || isRunning}
                      placeholder="Cloudflare 账户 ID"
                      onChange={(event) =>
                        updateForm({ r2_account_id: event.target.value })
                      }
                      className={cn(
                        settingsInputClassName,
                        "h-9 font-mono text-xs sm:text-[13px]",
                      )}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="backup-r2-bucket"
                      className="text-xs font-medium text-foreground sm:text-[13px]"
                    >
                      R2 Bucket 名称
                    </label>
                    <Input
                      id="backup-r2-bucket"
                      value={form.r2_bucket}
                      disabled={isSaving || isRunning}
                      placeholder="例如 shengtu-backups"
                      onChange={(event) =>
                        updateForm({ r2_bucket: event.target.value })
                      }
                      className={cn(
                        settingsInputClassName,
                        "h-9 font-mono text-xs sm:text-[13px]",
                      )}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="backup-r2-access"
                      className="text-xs font-medium text-foreground sm:text-[13px]"
                    >
                      Access Key ID
                    </label>
                    <Input
                      id="backup-r2-access"
                      value={form.r2_access_key_id}
                      disabled={isSaving || isRunning}
                      placeholder="R2 API Access Key ID"
                      onChange={(event) =>
                        updateForm({ r2_access_key_id: event.target.value })
                      }
                      className={cn(
                        settingsInputClassName,
                        "h-9 font-mono text-xs sm:text-[13px]",
                      )}
                    />
                  </div>

                  <SettingsSecretInput
                    id="backup-r2-secret"
                    label="Secret Access Key"
                    value={form.r2_secret_access_key}
                    configured={Boolean(form.r2_secret_access_key_configured)}
                    disabled={isSaving || isRunning}
                    onChange={(value) =>
                      updateForm({ r2_secret_access_key: value })
                    }
                    onClear={() => updateForm({ r2_secret_access_key: "" })}
                  />

                  <div className="space-y-1.5 sm:col-span-2">
                    <label
                      htmlFor="backup-r2-prefix"
                      className="text-xs font-medium text-foreground sm:text-[13px]"
                    >
                      远端对象前缀 (Prefix)
                    </label>
                    <Input
                      id="backup-r2-prefix"
                      value={form.r2_prefix}
                      disabled={isSaving || isRunning}
                      placeholder="shengtu-backups"
                      onChange={(event) =>
                        updateForm({ r2_prefix: event.target.value })
                      }
                      className={cn(
                        settingsInputClassName,
                        "h-9 font-mono text-xs sm:text-[13px]",
                      )}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/75 bg-surface-subtle/35 px-4 py-3 text-xs leading-5 text-muted-foreground">
                当前为纯本地归档模式。如需启用异地容灾，可切换上方存储模式或点击「展开预配置 R2 凭据」。
              </div>
            )}
          </SettingsSection>
        </div>

        {/* Right Column: Recent Backup Snapshot & 6-Phase Live Progress */}
        <BackupStatusPanel
          form={form}
          state={state}
          isDirty={isDirty}
          isSaving={isSaving}
          isRunning={isRunning}
          onRun={run}
        />
      </div>
    </SettingsCard>
  );
}

function BackupProviderOption({
  active,
  disabled,
  icon: Icon,
  onSelect,
  subtitle,
  title,
}: {
  active: boolean;
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
        "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
        active
          ? "border-foreground/45 bg-surface shadow-2xs ring-1 ring-foreground/15"
          : "border-border/75 bg-surface-subtle/45 hover:border-border-strong/75 hover:bg-surface-hover/55",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ring-1",
          active
            ? "bg-foreground text-background ring-foreground"
            : "bg-surface text-muted-foreground ring-border/75",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 space-y-0.5">
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
