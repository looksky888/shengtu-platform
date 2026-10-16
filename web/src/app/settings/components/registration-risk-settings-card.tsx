"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LoaderCircle, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchRegistrationRiskSettings,
  updateRegistrationRiskSettings,
  type RegistrationRiskSettings,
} from "@/lib/api";

import { splitSettingsLines } from "../settings-form-normalizers";
import { SettingsCard, SettingsNotice, settingsInputClassName } from "./settings-ui";

type NumberKey = Exclude<keyof RegistrationRiskSettings, "enabled" | "disposable_domains" | "proxy_cidrs">;

export function RegistrationRiskSettingsCard() {
  const [settings, setSettings] = useState<RegistrationRiskSettings | null>(null);
  const [domains, setDomains] = useState("");
  const [cidrs, setCIDRs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchRegistrationRiskSettings()
      .then(({ settings: value }) => {
        if (!active) return;
        setSettings(value);
        setDomains(value.disposable_domains.join("\n"));
        setCIDRs(value.proxy_cidrs.join("\n"));
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "加载注册风控失败"));
    return () => { active = false; };
  }, []);

  const updateNumber = (key: NumberKey, value: string) => {
    setSettings((current) => current ? { ...current, [key]: Number(value) || 0 } : current);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const payload = {
        ...settings,
        disposable_domains: splitSettingsLines(domains),
        proxy_cidrs: splitSettingsLines(cidrs),
      };
      const data = await updateRegistrationRiskSettings(payload);
      setSettings(data.settings);
      setDomains(data.settings.disposable_domains.join("\n"));
      setCIDRs(data.settings.proxy_cidrs.join("\n"));
      toast.success("注册风控设置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存注册风控失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard icon={ShieldCheck} title="注册组合风控" tone="amber">
      {!settings ? (
        <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" />正在加载...</div>
      ) : (
        <div className="space-y-5">
          <label className="flex items-center gap-3 rounded-[16px] border border-border bg-background px-4 py-3 text-sm font-medium">
            <Checkbox checked={settings.enabled} onCheckedChange={(value) => setSettings({ ...settings, enabled: value === true })} />
            启用注册组合风控
          </label>
          <RiskGroup title="设备：达到阈值后封禁">
            <RiskNumber label="成功注册数" field="device_success_limit" value={settings.device_success_limit} onChange={updateNumber} />
            <RiskNumber label="统计天数" field="device_window_days" value={settings.device_window_days} onChange={updateNumber} />
            <RiskNumber label="封禁小时" field="device_block_hours" value={settings.device_block_hours} onChange={updateNumber} />
          </RiskGroup>
          <RiskGroup title="IP：账号数和设备数同时达到才封禁">
            <RiskNumber label="成功注册数" field="ip_success_limit" value={settings.ip_success_limit} onChange={updateNumber} />
            <RiskNumber label="不同设备数" field="ip_distinct_device_limit" value={settings.ip_distinct_device_limit} onChange={updateNumber} />
            <RiskNumber label="统计小时" field="ip_window_hours" value={settings.ip_window_hours} onChange={updateNumber} />
            <RiskNumber label="封禁小时" field="ip_block_hours" value={settings.ip_block_hours} onChange={updateNumber} />
          </RiskGroup>
          <RiskGroup title="IP＋设备尝试冷却">
            <RiskNumber label="尝试次数" field="pair_attempt_limit" value={settings.pair_attempt_limit} onChange={updateNumber} />
            <RiskNumber label="统计分钟" field="pair_attempt_window_minutes" value={settings.pair_attempt_window_minutes} onChange={updateNumber} />
            <RiskNumber label="冷却小时" field="pair_cooldown_hours" value={settings.pair_cooldown_hours} onChange={updateNumber} />
          </RiskGroup>
          <RiskGroup title="IPv4 /24 网段">
            <RiskNumber label="成功注册数" field="subnet_success_limit" value={settings.subnet_success_limit} onChange={updateNumber} />
            <RiskNumber label="统计小时" field="subnet_window_hours" value={settings.subnet_window_hours} onChange={updateNumber} />
          </RiskGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <RiskList label="临时邮箱域名" value={domains} onChange={setDomains} placeholder="yopmail.com" />
            <RiskList label="代理 / VPN CIDR" value={cidrs} onChange={setCIDRs} placeholder="203.0.113.0/24" />
          </div>
          <SettingsNotice>组合拒绝需同时命中：临时邮箱、代理 CIDR、已注册过账号的设备。每行一项。</SettingsNotice>
          <div className="flex justify-end"><Button onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}保存风控</Button></div>
        </div>
      )}
    </SettingsCard>
  );
}

function RiskGroup({ title, children }: { title: string; children: ReactNode }) {
  return <fieldset className="grid gap-3 rounded-[16px] border border-border/80 bg-muted/25 p-4 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">{title}</legend>{children}</fieldset>;
}

function RiskNumber({ label, field, value, onChange }: { label: string; field: NumberKey; value: number; onChange: (field: NumberKey, value: string) => void }) {
  return <label className="space-y-2 text-sm font-medium"><span>{label}</span><Input type="number" min={1} value={value} onChange={(event) => onChange(field, event.target.value)} className={settingsInputClassName} /></label>;
}

function RiskList({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="space-y-2 text-sm font-medium"><span>{label}</span><Textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-28 bg-background font-mono text-xs" /></label>;
}
