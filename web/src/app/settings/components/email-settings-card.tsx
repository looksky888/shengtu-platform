"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, MailCheck, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchEmailSettings,
  testEmailSettings,
  updateEmailSettings,
  type EmailSettings,
} from "@/lib/api";

import { useRegisterSettingsDirty } from "../settings-dirty-registry-hooks";
import { normalizeEmailSettingsForm } from "../settings-form-normalizers";
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

const emptySettings: EmailSettings = {
  enabled: false,
  host: "",
  port: 587,
  username: "",
  password: "",
  encryption: "starttls",
  from_email: "",
  from_name: "生图",
  has_password: false,
};

function smtpFieldsSnapshot(value: EmailSettings, includeEnabled = true) {
  const normalized = normalizeEmailSettingsForm(value);
  return JSON.stringify({
    ...(includeEnabled ? { enabled: Boolean(normalized.enabled) } : {}),
    host: normalized.host,
    port: Number(normalized.port) || 0,
    username: normalized.username,
    encryption: normalized.encryption,
    from_email: normalized.from_email,
    from_name: normalized.from_name,
  });
}

export function EmailSettingsCard({
  refreshSignal = 0,
  onStatusChange,
}: {
  refreshSignal?: number;
  onStatusChange?: (enabled: boolean) => void;
}) {
  const [settings, setSettings] = useState<EmailSettings>(emptySettings);
  const [baseline, setBaseline] = useState<EmailSettings>(emptySettings);
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [manualExpanded, setManualExpanded] = useState(false);

  const loadSettings = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await fetchEmailSettings();
        const next: EmailSettings = {
          ...emptySettings,
          ...data.settings,
          password: "",
        };
        setSettings(next);
        setBaseline(next);
        onStatusChange?.(Boolean(next.enabled));
        return true;
      } catch (error) {
        if (!silent) {
          toast.error(
            error instanceof Error ? error.message : "加载邮件设置失败"
          );
        }
        return false;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [onStatusChange]
  );

  useEffect(() => {
    void loadSettings(refreshSignal > 0);
  }, [loadSettings, refreshSignal]);

  const update = <K extends keyof EmailSettings>(
    key: K,
    value: EmailSettings[K]
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const hasNewPassword = Boolean(settings.password);
  const isDetailFieldsDirty = useMemo(
    () =>
      !loading &&
      (hasNewPassword ||
        smtpFieldsSnapshot(settings, false) !==
          smtpFieldsSnapshot(baseline, false)),
    [baseline, hasNewPassword, loading, settings]
  );

  const isDirty = useMemo(
    () =>
      !loading &&
      (hasNewPassword ||
        smtpFieldsSnapshot(settings, true) !==
          smtpFieldsSnapshot(baseline, true)),
    [baseline, hasNewPassword, loading, settings]
  );

  const handleSave = useCallback(
    async (options?: { silentToast?: boolean }): Promise<boolean> => {
      setSaving(true);
      try {
        const data = await updateEmailSettings(
          normalizeEmailSettingsForm(settings)
        );
        const next: EmailSettings = {
          ...emptySettings,
          ...data.settings,
          password: "",
        };
        setSettings(next);
        setBaseline(next);
        onStatusChange?.(Boolean(next.enabled));
        if (!options?.silentToast) {
          toast.success("SMTP 邮件服务设置已保存");
        }
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "保存邮件设置失败"
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [onStatusChange, settings]
  );

  const handleDiscard = useCallback(() => {
    setSettings({ ...baseline, password: "" });
    return true;
  }, [baseline]);

  useRegisterSettingsDirty({
    id: "email-smtp",
    tab: "email",
    label: "SMTP 邮件服务",
    isDirty,
    save: () => handleSave(),
    discard: handleDiscard,
  });

  const sendTest = async () => {
    const targetEmail = recipient.trim().toLowerCase();
    if (!targetEmail) {
      toast.error("请输入测试收件邮箱");
      return;
    }
    setTesting(true);
    try {
      if (isDirty) {
        const saved = await handleSave({ silentToast: true });
        if (!saved) return;
      }
      await testEmailSettings(targetEmail);
      toast.success(
        isDirty ? "已保存最新 SMTP 配置并发送测试邮件" : "测试邮件已发送"
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "测试邮件发送失败"
      );
    } finally {
      setTesting(false);
    }
  };

  const showDetails = settings.enabled || manualExpanded || isDetailFieldsDirty;
  const preconfiguredSummary = settings.host.trim()
    ? `${settings.host.trim()}:${settings.port} · ${settings.from_email.trim() || "未填写发件邮箱"}`
    : "尚未配置 SMTP 发信服务器地址";

  return (
    <SettingsCard
      icon={MailCheck}
      title="SMTP 邮件验证码服务"
      description="配置用户注册与找回密码验证码的出站 SMTP 通道"
      meta={
        !loading ? (
          <Badge
            variant="outline"
            className={
              settings.enabled
                ? "h-5 gap-1.5 border-status-success/25 bg-status-success-soft px-2 text-[11px] font-medium text-status-success"
                : "h-5 gap-1.5 border-border/75 bg-surface-subtle px-2 text-[11px] text-muted-foreground"
            }
          >
            <span
              className={
                settings.enabled
                  ? "size-1.5 rounded-full bg-status-success"
                  : "size-1.5 rounded-full bg-muted-foreground/60"
              }
            />
            {settings.enabled ? "发信服务已启用" : "发信服务未启用"}
          </Badge>
        ) : null
      }
      footer={
        !loading ? (
          <SettingsCardSaveFooter
            dirty={isDirty}
            saving={saving}
            disabled={testing}
            onReset={handleDiscard}
            onSave={() => void handleSave()}
          />
        ) : undefined
      }
    >
      {loading ? (
        <div className="space-y-3 py-1">
          <Skeleton className="h-14 w-full" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <SettingsSwitchRow
            id="settings-smtp-enabled"
            title="启用 SMTP 邮件验证码服务"
            description="开启后，注册流程将向用户邮箱发送一次性验证码进行真实性校验"
            checked={settings.enabled}
            onCheckedChange={(checked) => update("enabled", checked)}
          />

          {!showDetails ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border/80 bg-surface-subtle/40 px-3.5 py-2.5">
              <div className="min-w-0 space-y-0.5">
                <div className="text-xs font-medium text-foreground">
                  SMTP 详细参数已折叠
                </div>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {preconfiguredSummary}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setManualExpanded(true)}
                className="h-8 shrink-0 gap-1 px-2.5 text-xs"
              >
                <span>展开预配置 SMTP 参数</span>
                <ChevronDown className="size-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <SettingsSection
                title="SMTP 连接与发件人信息"
                description="支持主流企业邮局、Resend、Amazon SES 及自建 Postfix 服务"
                action={
                  !settings.enabled && !isDetailFieldsDirty ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setManualExpanded(false)}
                      className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <span>收起预配置</span>
                      <ChevronUp className="size-3.5" />
                    </Button>
                  ) : null
                }
              >
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <EmailField
                    id="smtp-host"
                    label="SMTP 主机"
                    value={settings.host}
                    onChange={(value) => update("host", value)}
                    placeholder="smtp.example.com"
                  />
                  <SettingsUnitInput
                    id="smtp-port"
                    label="连接端口"
                    unit="Port"
                    min={1}
                    max={65535}
                    rangeHint="1–65535"
                    placeholder="587"
                    value={settings.port}
                    onChange={(value) => update("port", Number(value) || 0)}
                  />
                  <EmailField
                    id="smtp-username"
                    label="SMTP 用户名"
                    value={settings.username}
                    onChange={(value) => update("username", value)}
                    placeholder="mailer@example.com"
                  />
                  <SettingsSecretInput
                    id="smtp-password"
                    label="SMTP 密码 / 授权码"
                    value={settings.password || ""}
                    onChange={(value) => update("password", value)}
                    configured={Boolean(settings.has_password)}
                    configuredLabel="密码已保存"
                    placeholder={
                      settings.has_password
                        ? "密码已加密保存，留空保持不变"
                        : "输入 SMTP 密码或应用专用授权码"
                    }
                    onClear={() => update("password", "")}
                  />
                  <EmailField
                    id="smtp-from-email"
                    label="发件人邮箱"
                    type="email"
                    value={settings.from_email}
                    onChange={(value) => update("from_email", value)}
                    placeholder="no-reply@example.com"
                  />
                  <EmailField
                    id="smtp-from-name"
                    label="发件人显示名称"
                    value={settings.from_name}
                    onChange={(value) => update("from_name", value)}
                    placeholder="生图"
                  />
                  <div className="space-y-1.5 sm:col-span-2">
                    <label
                      htmlFor="smtp-encryption"
                      className="text-xs font-medium text-foreground sm:text-[13px]"
                    >
                      传输加密协议
                    </label>
                    <Select
                      value={settings.encryption}
                      onValueChange={(value) =>
                        update(
                          "encryption",
                          value as EmailSettings["encryption"]
                        )
                      }
                    >
                      <SelectTrigger
                        id="smtp-encryption"
                        className={settingsInputClassName}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="starttls">
                          STARTTLS 显式升级加密（推荐端口 587）
                        </SelectItem>
                        <SelectItem value="tls">
                          SSL / TLS 隐式直连加密（推荐端口 465）
                        </SelectItem>
                        <SelectItem value="none">
                          无加密明文传输（仅限可信容器内网）
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </SettingsSection>

              <SettingsSection
                title="连通性与发信测试"
                description={
                  isDirty
                    ? "检测到未保存的 SMTP 修改，点击下方按钮将自动先保存配置再发送测试邮件。"
                    : "向指定收件箱投递一封验证码测试邮件，验证握手鉴权与发件人白名单。"
                }
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    type="email"
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                    placeholder="输入测试收件邮箱，如 admin@example.com"
                    className={settingsInputClassName}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    loading={testing}
                    disabled={saving || !settings.enabled}
                    onClick={() => void sendTest()}
                    className="h-9 shrink-0 gap-1.5 px-3.5 text-xs"
                  >
                    <Send className="size-3.5" />
                    <span>
                      {isDirty ? "保存并发送测试邮件" : "发送测试邮件"}
                    </span>
                  </Button>
                </div>
                {!settings.enabled ? (
                  <SettingsNotice className="mt-2.5">
                    请先打开上方「启用 SMTP 邮件验证码服务」开关后再执行在线发信测试。
                  </SettingsNotice>
                ) : null}
              </SettingsSection>
            </>
          )}
        </div>
      )}
    </SettingsCard>
  );
}

function EmailField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-medium text-foreground sm:text-[13px]"
      >
        {label}
      </label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={settingsInputClassName}
      />
    </div>
  );
}
