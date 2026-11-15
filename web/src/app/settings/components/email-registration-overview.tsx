"use client";

import { ArrowUpRight, Inbox, MailPlus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { SettingsConfig } from "@/lib/settings-types";
import { cn } from "@/lib/utils";

import { isConfigKeysDirty } from "../settings-dirty";
import { useSettingsStore } from "../store";
import {
  SettingsCard,
  SettingsCardSaveFooter,
  SettingsHelp,
  SettingsNotice,
  SettingsSwitchRow,
} from "./settings-ui";

const REGISTRATION_KEYS: readonly (keyof SettingsConfig)[] = [
  "registration_enabled",
];

function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5.5 gap-1.5 rounded-md px-2 text-[11px] font-medium",
        tone === "success" &&
          "border-status-success/25 bg-status-success-soft text-status-success",
        tone === "warning" &&
          "border-status-warning/25 bg-status-warning-soft text-status-warning",
        tone === "neutral" &&
          "border-border/75 bg-surface-subtle text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "success" && "bg-status-success",
          tone === "warning" && "bg-status-warning",
          tone === "neutral" && "bg-muted-foreground/60"
        )}
      />
      <span>{label}</span>
    </Badge>
  );
}

export function EmailRegistrationOverview({
  smtpEnabled = null,
  riskEnabled = null,
  activeBlocksCount = null,
}: {
  smtpEnabled?: boolean | null;
  riskEnabled?: boolean | null;
  activeBlocksCount?: number | null;
}) {
  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot
  );
  const isLoading = useSettingsStore((state) => state.isLoadingConfig);
  const isSaving = useSettingsStore((state) => state.isSavingConfig);
  const savingSectionKey = useSettingsStore((state) => state.savingSectionKey);
  const loadConfig = useSettingsStore((state) => state.loadConfig);
  const saveConfigSection = useSettingsStore(
    (state) => state.saveConfigSection
  );
  const resetConfigSection = useSettingsStore(
    (state) => state.resetConfigSection
  );
  const setRegistrationEnabled = useSettingsStore(
    (state) => state.setRegistrationEnabled
  );

  const registrationEnabled = Boolean(config?.registration_enabled);
  const sectionDirty = isConfigKeysDirty(
    config,
    savedConfigSnapshot,
    REGISTRATION_KEYS
  );
  const isSavingSection =
    isSaving &&
    (savingSectionKey === "registration-enabled" ||
      savingSectionKey === "__all__");

  const smtpMissingWhileOpen = registrationEnabled && smtpEnabled === false;

  return (
    <SettingsCard
      icon={MailPlus}
      title="公开注册与邮箱验证总览"
      description="统一控制登录页访客自助注册准入开关，并联动下方 SMTP 验证码与多维防刷策略"
      meta={
        config ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill
              tone={registrationEnabled ? "success" : "neutral"}
              label={
                registrationEnabled ? "公开注册 · 已开放" : "公开注册 · 已暂停"
              }
            />
            <StatusPill
              tone={
                smtpEnabled
                  ? "success"
                  : smtpMissingWhileOpen
                    ? "warning"
                    : "neutral"
              }
              label={
                smtpEnabled === null
                  ? "邮箱验证 · 同步中"
                  : smtpEnabled
                    ? "邮箱验证 · 已启用"
                    : "邮箱验证 · 未启用"
              }
            />
            <StatusPill
              tone={riskEnabled ? "success" : "neutral"}
              label={
                riskEnabled === null
                  ? "风控拦截 · 同步中"
                  : riskEnabled
                    ? `风控拦截 · 已开启${typeof activeBlocksCount === "number" ? ` (${activeBlocksCount})` : ""}`
                    : "风控拦截 · 未启用"
              }
            />
          </div>
        ) : null
      }
      footer={
        config ? (
          <SettingsCardSaveFooter
            dirty={sectionDirty}
            saving={isSavingSection}
            disabled={isSaving}
            saveLabel="保存注册准入状态"
            onReset={() => resetConfigSection(REGISTRATION_KEYS)}
            onSave={() =>
              void saveConfigSection(REGISTRATION_KEYS, {
                sectionKey: "registration-enabled",
              })
            }
          />
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Skeleton className="h-18 w-full" />
          <Skeleton className="h-18 w-full" />
        </div>
      ) : !config ? (
        <SettingsNotice
          tone="danger"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <span>注册准入配置读取失败，请检查网络连接后重试。</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadConfig()}
          >
            <RefreshCw className="size-3.5" />
            <span>重新读取</span>
          </Button>
        </SettingsNotice>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <SettingsSwitchRow
              id="settings-registration-enabled"
              title="开放新用户注册"
              badge={
                <SettingsHelp content="开启后新用户须通过邮箱验证码完成注册；关闭后仅管理员可在「用户管理」后台创建账号，已有账号正常登录不受影响。" />
              }
              description={
                registrationEnabled
                  ? "允许访客在登录页自助注册账号（现有存量账号登录方式不受影响）"
                  : "已暂停公开注册，仅管理员可在后台创建账号"
              }
              checked={registrationEnabled}
              onCheckedChange={(checked) => setRegistrationEnabled(checked)}
            />

            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/75 bg-surface-subtle/45 px-3.5 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted-foreground ring-1 ring-border/70">
                  <Inbox className="size-4" />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <div className="text-sm font-medium text-foreground">
                    iCloud 邮箱库存台
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    管理内部号池邮箱同步、收件验证码与标签分组
                  </p>
                </div>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1 px-2.5 text-xs"
              >
                <Link to="/icloud">
                  <span>进入管理</span>
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </div>

          {smtpMissingWhileOpen ? (
            <SettingsNotice tone="warning">
              当前已开启「开放新用户注册」，但下方 SMTP 邮件验证码服务尚未启用。请同步启用并配置可用的发信服务器，否则访客将无法收到注册验证码。
            </SettingsNotice>
          ) : null}
        </div>
      )}
    </SettingsCard>
  );
}
