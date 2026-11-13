"use client";

import { useCallback, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";

import { EmailRegistrationOverview } from "@/app/settings/components/email-registration-overview";
import { EmailSettingsCard } from "@/app/settings/components/email-settings-card";
import { RegistrationRiskBlocksCard } from "@/app/settings/components/registration-risk-blocks-card";
import { RegistrationRiskSettingsCard } from "@/app/settings/components/registration-risk-settings-card";
import { isConfigKeysDirty } from "@/app/settings/settings-dirty";
import { useRegisterSettingsDirty } from "@/app/settings/settings-dirty-registry-hooks";
import { useSettingsStore } from "@/app/settings/store";
import { useEnsureSettingsConfigLoaded } from "@/app/settings/use-ensure-settings-config";
import {
  AdminPageFrame,
  AdminStatTile,
  AdminStickyCommandBar,
  AdminUnderlineTabs,
} from "@/components/admin";
import { Button } from "@/components/ui/button";
import type { SettingsConfig } from "@/lib/settings-types";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";

type AccessSettingsTab = "registration" | "email" | "blocks";

const ACCESS_TABS = [
  { value: "registration" as const, label: "开放注册与防刷风控" },
  { value: "email" as const, label: "SMTP 邮件服务" },
  { value: "blocks" as const, label: "实时封禁名单" },
] as const;

const REGISTRATION_KEYS: readonly (keyof SettingsConfig)[] = [
  "registration_enabled",
];

export default function AdminAccessSettingsPage() {
  const { isCheckingAuth, session } = useAuthGuard(
    undefined,
    "/admin/settings/access",
  );
  const [activeTab, setActiveTab] = useState<AccessSettingsTab>("registration");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [smtpEnabled, setSmtpEnabled] = useState<boolean | null>(null);
  const [riskEnabled, setRiskEnabled] = useState<boolean | null>(null);
  const [activeBlocksCount, setActiveBlocksCount] = useState<number | null>(null);

  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot,
  );
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const loadConfig = useSettingsStore((state) => state.loadConfig);
  const saveConfigSection = useSettingsStore(
    (state) => state.saveConfigSection,
  );
  const resetConfigSection = useSettingsStore(
    (state) => state.resetConfigSection,
  );

  useEnsureSettingsConfigLoaded(Boolean(session));

  const dirty = isConfigKeysDirty(config, savedConfigSnapshot, REGISTRATION_KEYS);

  const handleSaveRegistration = useCallback(async () => {
    const receipt = await saveConfigSection(REGISTRATION_KEYS, {
      sectionKey: "registration-enabled",
    });
    return Boolean(receipt);
  }, [saveConfigSection]);

  useRegisterSettingsDirty({
    id: "admin-page-access-registration",
    tab: "email",
    label: "开放新用户注册",
    isDirty: dirty,
    save: handleSaveRegistration,
    discard: () => {
      resetConfigSection(REGISTRATION_KEYS);
      return true;
    },
  });

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-[var(--admin-text-muted)]" />
      </div>
    );
  }

  const registrationEnabled = Boolean(config?.registration_enabled);

  return (
    <AdminPageFrame
      groupLabel="系统配置"
      title="注册与邮件"
      description="管理登录页公开自助注册准入、多维频率防刷风控、SMTP 发信网关及实时黑名单拦截。"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isLoadingConfig}
          onClick={() => {
            void loadConfig();
            setRefreshSignal((s) => s + 1);
          }}
        >
          <RefreshCw className={cn("size-3.5", isLoadingConfig && "animate-spin")} />
          刷新状态
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStatTile
          label="公开自助注册"
          value={registrationEnabled ? "已开放" : "已关闭"}
          tone={registrationEnabled ? "success" : "default"}
          hint={
            registrationEnabled
              ? "访客可通过邮箱验证码注册账号"
              : "仅允许管理员在后台手动创建账号"
          }
        />
        <AdminStatTile
          label="SMTP 邮件验证码服务"
          value={
            smtpEnabled === null
              ? "就绪检测中"
              : smtpEnabled
                ? "已启用"
                : "未启用"
          }
          tone={smtpEnabled ? "success" : registrationEnabled ? "warning" : "default"}
          hint="支撑注册验证码、找回密码与安全通知"
        />
        <AdminStatTile
          label="防刷风控 / 实时封禁"
          value={
            riskEnabled === null
              ? "按需检测"
              : riskEnabled
                ? `开启中${typeof activeBlocksCount === "number" ? ` · ${activeBlocksCount} 封禁` : ""}`
                : "未启用"
          }
          tone={riskEnabled ? "info" : "default"}
          hint="按 IP / 邮箱域名拦截恶意注册洪峰"
        />
      </div>

      <AdminUnderlineTabs
        items={ACCESS_TABS.map((tab) =>
          tab.value === "blocks" && typeof activeBlocksCount === "number"
            ? { ...tab, badge: activeBlocksCount }
            : tab,
        )}
        value={activeTab}
        onValueChange={setActiveTab}
        syncQueryParam="tab"
        defaultValue="registration"
      />

      {activeTab === "registration" ? (
        <div className="space-y-5">
          <AdminStickyCommandBar
            dirty={dirty}
            saving={isSavingConfig}
            cleanSummary="公开自助注册准入总开关已同步"
            dirtySummary="「开放新用户注册」准入状态有未保存修改"
            onSave={() => void handleSaveRegistration()}
            onReset={() => resetConfigSection(REGISTRATION_KEYS)}
          />
          <EmailRegistrationOverview
            smtpEnabled={smtpEnabled}
            riskEnabled={riskEnabled}
            activeBlocksCount={activeBlocksCount}
          />
          <RegistrationRiskSettingsCard
            refreshSignal={refreshSignal}
            onStatusChange={setRiskEnabled}
          />
        </div>
      ) : activeTab === "email" ? (
        <EmailSettingsCard
          refreshSignal={refreshSignal}
          onStatusChange={setSmtpEnabled}
        />
      ) : (
        <RegistrationRiskBlocksCard
          refreshSignal={refreshSignal}
          onCountChange={setActiveBlocksCount}
        />
      )}
    </AdminPageFrame>
  );
}
