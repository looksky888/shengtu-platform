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
import { cn } from "@/lib/utils";

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

const EMAIL_ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function smtpFieldsSnapshot(
  value: EmailSettings,
  portText: string,
  includeEnabled = true,
) {
  const normalized = normalizeEmailSettingsForm(value);
  return JSON.stringify({
    ...(includeEnabled ? { enabled: Boolean(normalized.enabled) } : {}),
    host: normalized.host,
    port: portText.trim(),
    username: normalized.username,
    encryption: normalized.encryption,
    from_email: normalized.from_email,
    from_name: normalized.from_name,
  });
}

function getEmailSmtpErrors(
  settings: EmailSettings,
  portDraft: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const host = settings.host.trim();
  const fromEmail = settings.from_email.trim();
  const portText = portDraft.trim();

  if (settings.enabled && !host) {
    errors.host = "启用发信服务时请填写 SMTP 主机地址";
  }

  if (settings.enabled || portText !== "") {
    const portNum = portText === "" ? Number.NaN : Number(portText);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      errors.port = "连接端口必须为 1–65535 的整数";
    }
  }

  if (settings.enabled && !fromEmail) {
    errors.from_email = "启用发信服务时请填写发件人邮箱";
  } else if (fromEmail && !EMAIL_ADDRESS_RE.test(fromEmail)) {
    errors.from_email = "请填写格式正确的邮箱地址（如 no-reply@example.com）";
  }

  return errors;
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
  const [portDraft, setPortDraft] = useState<string>(String(emptySettings.port));
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
        setPortDraft(String(next.port || 587));
        onStatusChange?.(Boolean(next.enabled));
        return true;
      } catch (error) {
        if (!silent) {
          toast.error(
            error instanceof Error ? error.message : "加载邮件设置失败",
          );
        }
        return false;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [onStatusChange],
  );

  useEffect(() => {
    void loadSettings(refreshSignal > 0);
  }, [loadSettings, refreshSignal]);

  const update = <K extends keyof EmailSettings>(
    key: K,
    value: EmailSettings[K],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const handlePortChange = (raw: string) => {
    setPortDraft(raw);
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (Number.isSafeInteger(parsed)) {
        update("port", parsed);
      }
    }
  };

  const handlePortBlur = () => {
    const trimmed = portDraft.trim();
    if (!trimmed) {
      const fallback = baseline.port || 587;
      setPortDraft(String(fallback));
      update("port", fallback);
      return;
    }
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (Number.isSafeInteger(parsed)) {
        setPortDraft(String(parsed));
        update("port", parsed);
      }
    }
  };

  const baselinePortText = String(baseline.port || 587);
  const hasNewPassword = Boolean(settings.password);

  const isDetailFieldsDirty = useMemo(
    () =>
      !loading &&
      (hasNewPassword ||
        smtpFieldsSnapshot(settings, portDraft, false) !==
          smtpFieldsSnapshot(baseline, baselinePortText, false)),
    [baseline, baselinePortText, hasNewPassword, loading, portDraft, settings],
  );

  const isDirty = useMemo(
    () =>
      !loading &&
      (hasNewPassword ||
        smtpFieldsSnapshot(settings, portDraft, true) !==
          smtpFieldsSnapshot(baseline, baselinePortText, true)),
    [baseline, baselinePortText, hasNewPassword, loading, portDraft, settings],
  );

  const errors = useMemo(
    () => getEmailSmtpErrors(settings, portDraft),
    [portDraft, settings],
  );
  const hasValidationError = Object.keys(errors).length > 0;

  const validateSmtp = useCallback(() => {
    const currentErrors = getEmailSmtpErrors(settings, portDraft);
    const firstMsg = Object.values(currentErrors)[0];
    if (firstMsg) {
      toast.error(firstMsg);
      return false;
    }
    return true;
  }, [portDraft, settings]);

  const handleSave = useCallback(
    async (options?: { silentToast?: boolean }): Promise<boolean> => {
      if (!validateSmtp()) return false;
      setSaving(true);
      try {
        const trimmedPort = portDraft.trim();
        const resolvedPort = trimmedPort
          ? Number(trimmedPort)
          : baseline.port || 587;
        const payload = normalizeEmailSettingsForm({
          ...settings,
          port: resolvedPort,
        });
        const data = await updateEmailSettings(payload);
        const next: EmailSettings = {
          ...emptySettings,
          ...data.settings,
          password: "",
        };
        setSettings(next);
        setBaseline(next);
        setPortDraft(String(next.port || 587));
        onStatusChange?.(Boolean(next.enabled));
        if (!options?.silentToast) {
          toast.success("SMTP 邮件服务设置已保存");
        }
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "保存邮件设置失败",
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [baseline.port, onStatusChange, portDraft, settings, validateSmtp],
  );

  const handleDiscard = useCallback(() => {
    setSettings({ ...baseline, password: "" });
    setPortDraft(String(baseline.port || 587));
    return true;
  }, [baseline]);

  useRegisterSettingsDirty({
    id: "email-smtp",
    tab: "email",
    label: "SMTP 邮件服务",
    isDirty,
    validate: validateSmtp,
    save: () => handleSave(),
    discard: handleDiscard,
  });

  const sendTest = async () => {
    const targetEmail = recipient.trim().toLowerCase();
    if (!targetEmail) {
      toast.error("请输入测试收件邮箱");
      return;
    }
    if (!EMAIL_ADDRESS_RE.test(targetEmail)) {
      toast.error("请输入格式正确的测试收件邮箱");
      return;
    }
    const wasDirty = isDirty;
    setTesting(true);
    try {
      if (wasDirty) {
        const saved = await handleSave({ silentToast: true });
        if (!saved) return;
      }
      await testEmailSettings(targetEmail);
      toast.success(
        wasDirty ? "已保存最新 SMTP 配置并发送测试邮件" : "测试邮件已发送",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "测试邮件发送失败",
      );
    } finally {
      setTesting(false);
    }
  };

  const showDetails = settings.enabled || manualExpanded || isDetailFieldsDirty;
  const preconfiguredSummary = settings.host.trim()
    ? `${settings.host.trim()}:${portDraft || settings.port} · ${settings.from_email.trim() || "未填写发件邮箱"}`
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
            hint={
              hasValidationError
                ? "请先修正标红的 SMTP 主机、端口或发件人邮箱错误后再保存"
                : undefined
            }
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
            <div className="space-y-4">
              <SettingsSection
                layout="split"
                title="SMTP 连接与发件人信息"
                description="支持主流企业邮局、Resend、Amazon SES 及自建 Postfix 服务。"
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
                <div className="max-w-2xl space-y-3.5">
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <EmailField
                      id="smtp-host"
                      label="SMTP 主机"
                      value={settings.host}
                      error={errors.host}
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
                      value={portDraft}
                      error={errors.port}
                      onChange={handlePortChange}
                      onBlur={handlePortBlur}
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
                      error={errors.from_email}
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
                  </div>

                  <div className="max-w-lg space-y-1.5">
                    <label
                      htmlFor="smtp-encryption"
                      className="block text-xs font-medium text-foreground sm:text-[13px]"
                    >
                      传输加密协议
                    </label>
                    <Select
                      value={settings.encryption}
                      onValueChange={(value) =>
                        update(
                          "encryption",
                          value as EmailSettings["encryption"],
                        )
                      }
                    >
                      <SelectTrigger
                        id="smtp-encryption"
                        className={cn("w-full", settingsInputClassName)}
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
                layout="split"
                title="连通性与发信测试"
                description={
                  isDirty
                    ? "检测到未保存的 SMTP 修改，点击下方按钮将自动先保存配置再发送测试邮件。"
                    : "向指定收件箱投递一封验证码测试邮件，验证握手鉴权与发件人白名单。"
                }
              >
                <div className="max-w-xl space-y-2.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      type="email"
                      value={recipient}
                      onChange={(event) => setRecipient(event.target.value)}
                      placeholder="输入测试收件邮箱，如 admin@example.com"
                      className={cn(settingsInputClassName, "min-w-0 flex-1")}
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
                    <SettingsNotice>
                      请先打开上方「启用 SMTP 邮件验证码服务」开关后再执行在线发信测试。
                    </SettingsNotice>
                  ) : null}
                </div>
              </SettingsSection>
            </div>
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
  error,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
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
        aria-invalid={Boolean(error)}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={settingsInputClassName}
      />
      {error ? (
        <p className="text-xs leading-4 text-status-danger">{error}</p>
      ) : null}
    </div>
  );
}
