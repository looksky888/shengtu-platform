"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, MailCheck, Save, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchEmailSettings, testEmailSettings, updateEmailSettings, type EmailSettings } from "@/lib/api";

import { normalizeEmailSettingsForm } from "../settings-form-normalizers";
import { SettingsCard, SettingsNotice, settingsInputClassName } from "./settings-ui";

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

export function EmailSettingsCard() {
  const [settings, setSettings] = useState<EmailSettings>(emptySettings);
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchEmailSettings()
      .then((data) => { if (active) setSettings({ ...emptySettings, ...data.settings, password: "" }); })
      .catch((error) => { if (active) toast.error(error instanceof Error ? error.message : "加载邮件设置失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const update = <K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const data = await updateEmailSettings(normalizeEmailSettingsForm(settings));
      setSettings({ ...emptySettings, ...data.settings, password: "" });
      toast.success("邮件服务设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存邮件设置失败");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!recipient.trim()) return toast.error("请输入测试收件邮箱");
    setTesting(true);
    try {
      await testEmailSettings(recipient.trim().toLowerCase());
      toast.success("测试邮件已发送");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试邮件发送失败");
    } finally {
      setTesting(false);
    }
  };

  return (
    <SettingsCard icon={MailCheck} title="注册邮件服务" tone="blue">
      {loading ? (
        <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" />正在加载...</div>
      ) : (
        <div className="space-y-5">
          <label className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3.5 py-2.5 text-sm font-medium">
            <Checkbox checked={settings.enabled} onCheckedChange={(value) => update("enabled", value === true)} />
            启用邮箱验证码注册
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <EmailField label="SMTP 主机" value={settings.host} onChange={(value) => update("host", value)} placeholder="smtp.example.com" />
            <EmailField label="端口" value={String(settings.port)} onChange={(value) => update("port", Number(value) || 0)} type="number" placeholder="587" />
            <EmailField label="SMTP 用户名" value={settings.username} onChange={(value) => update("username", value)} placeholder="通常为完整邮箱" />
            <EmailField label="SMTP 密码" value={settings.password || ""} onChange={(value) => update("password", value)} type="password" placeholder={settings.has_password ? "已保存；留空保持不变" : "请输入密码或授权码"} />
            <EmailField label="发件邮箱" value={settings.from_email} onChange={(value) => update("from_email", value)} type="email" placeholder="no-reply@example.com" />
            <EmailField label="发件人名称" value={settings.from_name} onChange={(value) => update("from_name", value)} placeholder="生图" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">连接加密</label>
            <Select value={settings.encryption} onValueChange={(value) => update("encryption", value as EmailSettings["encryption"])}>
              <SelectTrigger className={settingsInputClassName}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="starttls">STARTTLS（常用 587）</SelectItem>
                <SelectItem value="tls">TLS（常用 465）</SelectItem>
                <SelectItem value="none">无加密（仅可信内网）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end"><Button onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}保存设置</Button></div>
          <SettingsNotice>测试使用已保存设置。修改 SMTP 参数后，请先保存再测试。</SettingsNotice>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="测试收件邮箱" className={settingsInputClassName} />
            <Button variant="outline" onClick={() => void sendTest()} disabled={testing || !settings.enabled}>{testing ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}发送测试邮件</Button>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

function EmailField({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return <label className="space-y-2 text-sm font-medium"><span>{label}</span><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={settingsInputClassName} /></label>;
}
