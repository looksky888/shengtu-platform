"use client";

import { ArrowRight, LoaderCircle, MailPlus, RefreshCw, Save } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MagneticButton } from "@/components/ui/magnetic-button";

import { useSettingsStore } from "../store";
import { SettingsCard, SettingsHelp, SettingsNotice, settingsPanelClassName } from "./settings-ui";

export function EmailRegistrationOverview() {
  const config = useSettingsStore((state) => state.config);
  const isLoading = useSettingsStore((state) => state.isLoadingConfig);
  const isSaving = useSettingsStore((state) => state.isSavingConfig);
  const loadConfig = useSettingsStore((state) => state.loadConfig);
  const saveConfigSection = useSettingsStore((state) => state.saveConfigSection);
  const setRegistrationEnabled = useSettingsStore((state) => state.setRegistrationEnabled);
  const registrationEnabled = Boolean(config?.registration_enabled);

  return (
    <SettingsCard
      icon={MailPlus}
      title="邮箱注册总览"
      tone="violet"
      action={config ? (
        <MagneticButton onClick={() => void saveConfigSection(["registration_enabled"])} disabled={isSaving}>
          {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
          保存开放状态
        </MagneticButton>
      ) : null}
    >
      {isLoading ? (
        <div className="flex min-h-28 items-center justify-center text-sm text-muted-foreground">
          <LoaderCircle className="mr-2 size-4 animate-spin" />正在读取注册状态...
        </div>
      ) : !config ? (
        <SettingsNotice className="flex flex-wrap items-center justify-between gap-3 border-rose-200 bg-rose-50 text-rose-700">
          注册状态读取失败，请重试。
          <Button variant="outline" size="sm" onClick={() => void loadConfig()}>
            <RefreshCw className="size-4" />重试
          </Button>
        </SettingsNotice>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.1fr]">
          <div className={settingsPanelClassName}>
            <p className="text-xs font-medium text-muted-foreground">注册入口</p>
            <label className="mt-3 flex items-center gap-3 text-sm font-semibold">
              <Checkbox checked={registrationEnabled} onCheckedChange={(value) => setRegistrationEnabled(value === true)} />
              {registrationEnabled ? "允许新用户注册" : "暂停新用户注册"}
            </label>
            <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
              <span>新用户需完成邮箱验证</span>
              <SettingsHelp content="开启注册后，新用户必须完成邮箱验证码校验；现有账号登录不受影响。" />
            </div>
          </div>
          <div className={settingsPanelClassName}>
            <p className="text-xs font-medium text-muted-foreground">账号兼容规则</p>
            <p className="mt-3 text-sm font-semibold">旧账号登录方式不变</p>
            <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
              <span>现有用户登录方式不变</span>
              <SettingsHelp content="此开关只控制后续新用户注册，不会改变现有用户的登录方式。" />
            </div>
          </div>
          <div className={settingsPanelClassName}>
            <p className="text-xs font-medium text-muted-foreground">iCloud 邮箱库存</p>
            <p className="mt-3 text-sm font-semibold">同步、验证码与标签管理</p>
            <Button asChild variant="outline" className="mt-3 w-full justify-between">
              <Link to="/icloud">进入 iCloud 邮箱管理<ArrowRight className="size-4" /></Link>
            </Button>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
