"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchRegistrationRiskSettings,
  updateRegistrationRiskSettings,
  type RegistrationRiskSettings,
} from "@/lib/api";
import { cn } from "@/lib/utils";

import { useRegisterSettingsDirty } from "../settings-dirty-registry";
import { splitSettingsLines } from "../settings-form-normalizers";
import {
  SettingsCard,
  SettingsCardSaveFooter,
  SettingsNotice,
  SettingsSection,
  SettingsSwitchRow,
  SettingsUnitInput,
  settingsInputClassName,
} from "./settings-ui";

type NumberKey = Exclude<
  keyof RegistrationRiskSettings,
  "enabled" | "disposable_domains" | "proxy_cidrs"
>;

function riskSnapshot(
  settings: RegistrationRiskSettings,
  domainsText: string,
  cidrsText: string,
  includeEnabled = true
) {
  return JSON.stringify({
    ...(includeEnabled ? { enabled: Boolean(settings.enabled) } : {}),
    device_success_limit: Number(settings.device_success_limit) || 0,
    device_window_days: Number(settings.device_window_days) || 0,
    device_block_hours: Number(settings.device_block_hours) || 0,
    ip_success_limit: Number(settings.ip_success_limit) || 0,
    ip_distinct_device_limit: Number(settings.ip_distinct_device_limit) || 0,
    ip_window_hours: Number(settings.ip_window_hours) || 0,
    ip_block_hours: Number(settings.ip_block_hours) || 0,
    pair_attempt_limit: Number(settings.pair_attempt_limit) || 0,
    pair_attempt_window_minutes:
      Number(settings.pair_attempt_window_minutes) || 0,
    pair_cooldown_hours: Number(settings.pair_cooldown_hours) || 0,
    subnet_success_limit: Number(settings.subnet_success_limit) || 0,
    subnet_window_hours: Number(settings.subnet_window_hours) || 0,
    disposable_domains: splitSettingsLines(domainsText),
    proxy_cidrs: splitSettingsLines(cidrsText),
  });
}

export function RegistrationRiskSettingsCard({
  refreshSignal = 0,
  onStatusChange,
}: {
  refreshSignal?: number;
  onStatusChange?: (enabled: boolean) => void;
}) {
  const [settings, setSettings] = useState<RegistrationRiskSettings | null>(
    null
  );
  const [baseline, setBaseline] = useState<RegistrationRiskSettings | null>(
    null
  );
  const [domains, setDomains] = useState("");
  const [cidrs, setCIDRs] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [manualExpanded, setManualExpanded] = useState(false);

  const loadRiskSettings = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const { settings: value } = await fetchRegistrationRiskSettings();
        setSettings(value);
        setBaseline(value);
        setDomains(value.disposable_domains.join("\n"));
        setCIDRs(value.proxy_cidrs.join("\n"));
        onStatusChange?.(Boolean(value.enabled));
        return true;
      } catch (error) {
        if (!silent) {
          toast.error(
            error instanceof Error ? error.message : "加载注册风控失败"
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
    void loadRiskSettings(refreshSignal > 0);
  }, [loadRiskSettings, refreshSignal]);

  const updateNumber = (key: NumberKey, value: string) => {
    setSettings((current) =>
      current ? { ...current, [key]: Math.max(0, Number(value) || 0) } : current
    );
  };

  const isThresholdDirty = useMemo(() => {
    if (!settings || !baseline) return false;
    return (
      riskSnapshot(settings, domains, cidrs, false) !==
      riskSnapshot(
        baseline,
        baseline.disposable_domains.join("\n"),
        baseline.proxy_cidrs.join("\n"),
        false
      )
    );
  }, [baseline, cidrs, domains, settings]);

  const isDirty = useMemo(() => {
    if (!settings || !baseline) return false;
    return (
      riskSnapshot(settings, domains, cidrs, true) !==
      riskSnapshot(
        baseline,
        baseline.disposable_domains.join("\n"),
        baseline.proxy_cidrs.join("\n"),
        true
      )
    );
  }, [baseline, cidrs, domains, settings]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!settings) return false;
    setSaving(true);
    try {
      const payload: RegistrationRiskSettings = {
        ...settings,
        disposable_domains: splitSettingsLines(domains),
        proxy_cidrs: splitSettingsLines(cidrs),
      };
      const data = await updateRegistrationRiskSettings(payload);
      setSettings(data.settings);
      setBaseline(data.settings);
      setDomains(data.settings.disposable_domains.join("\n"));
      setCIDRs(data.settings.proxy_cidrs.join("\n"));
      onStatusChange?.(Boolean(data.settings.enabled));
      toast.success("注册风控策略已保存");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存注册风控失败");
      return false;
    } finally {
      setSaving(false);
    }
  }, [cidrs, domains, onStatusChange, settings]);

  const handleDiscard = useCallback(() => {
    if (!baseline) return true;
    setSettings(baseline);
    setDomains(baseline.disposable_domains.join("\n"));
    setCIDRs(baseline.proxy_cidrs.join("\n"));
    return true;
  }, [baseline]);

  useRegisterSettingsDirty({
    id: "registration-risk",
    tab: "email",
    label: "注册风控策略",
    isDirty,
    save: handleSave,
    discard: handleDiscard,
  });

  const domainCount = useMemo(
    () => splitSettingsLines(domains).length,
    [domains]
  );
  const cidrCount = useMemo(() => splitSettingsLines(cidrs).length, [cidrs]);

  const showDetails = Boolean(
    settings && (settings.enabled || manualExpanded || isThresholdDirty)
  );

  return (
    <SettingsCard
      icon={ShieldCheck}
      title="注册防刷与多维风控"
      description="组合设备指纹、来源 IP、C 段网段与黑名单特征拦截机器批量注册"
      meta={
        settings ? (
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
            {settings.enabled ? "风控已开启" : "风控未启用"}
          </Badge>
        ) : null
      }
      footer={
        settings ? (
          <SettingsCardSaveFooter
            dirty={isDirty}
            saving={saving}
            onReset={handleDiscard}
            onSave={() => void handleSave()}
          />
        ) : undefined
      }
    >
      {loading && !settings ? (
        <div className="space-y-3 py-1">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : !settings ? (
        <SettingsNotice
          tone="danger"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <span>注册风控配置加载失败。</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadRiskSettings()}
          >
            重新加载
          </Button>
        </SettingsNotice>
      ) : (
        <div className="space-y-4">
          <SettingsSwitchRow
            id="settings-risk-enabled"
            title="启用注册防刷与多维风控"
            description="开启后将实时统计设备与 IP 注册频次，命中阈值自动写入封禁名单"
            checked={settings.enabled}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, enabled: checked })
            }
          />

          {!showDetails ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border/80 bg-surface-subtle/40 px-3.5 py-2.5">
              <div className="min-w-0 space-y-0.5">
                <div className="text-xs font-medium text-foreground">
                  风控阈值与黑名单已折叠
                </div>
                <p className="text-[11px] text-muted-foreground">
                  单设备 {settings.device_success_limit} 次/{settings.device_window_days} 天 · 已预置 {domainCount} 个临时邮箱域名、{cidrCount} 条网段规则
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setManualExpanded(true)}
                className="h-8 shrink-0 gap-1 px-2.5 text-xs"
              >
                <span>展开预配置风控阈值</span>
                <ChevronDown className="size-3.5" />
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 1. 设备维度限制 */}
              <SettingsSection
                title="设备维度限制"
                description="同一浏览器/客户端设备指纹在统计窗口内达到注册上限后自动封禁"
                action={
                  !settings.enabled && !isThresholdDirty ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setManualExpanded(false)}
                      className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <span>收起阈值</span>
                      <ChevronUp className="size-3.5" />
                    </Button>
                  ) : null
                }
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <SettingsUnitInput
                    label="成功注册上限"
                    unit="次"
                    min={1}
                    value={settings.device_success_limit}
                    onChange={(value) =>
                      updateNumber("device_success_limit", value)
                    }
                  />
                  <SettingsUnitInput
                    label="统计窗口"
                    unit="天"
                    min={1}
                    value={settings.device_window_days}
                    onChange={(value) =>
                      updateNumber("device_window_days", value)
                    }
                  />
                  <SettingsUnitInput
                    label="封禁时长"
                    unit="小时"
                    min={1}
                    value={settings.device_block_hours}
                    onChange={(value) =>
                      updateNumber("device_block_hours", value)
                    }
                  />
                </div>
              </SettingsSection>

              {/* 2. 单 IP 维度限制 */}
              <SettingsSection
                title="单 IP 维度限制"
                description="仅当成功注册数与关联不同设备数同时达到阈值时触发 IP 封禁（避免误伤企业/校园 NAT）"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <SettingsUnitInput
                    label="成功注册上限"
                    unit="次"
                    min={1}
                    value={settings.ip_success_limit}
                    onChange={(value) =>
                      updateNumber("ip_success_limit", value)
                    }
                  />
                  <SettingsUnitInput
                    label="不同设备上限"
                    unit="次"
                    min={1}
                    value={settings.ip_distinct_device_limit}
                    onChange={(value) =>
                      updateNumber("ip_distinct_device_limit", value)
                    }
                  />
                  <SettingsUnitInput
                    label="统计窗口"
                    unit="小时"
                    min={1}
                    value={settings.ip_window_hours}
                    onChange={(value) => updateNumber("ip_window_hours", value)}
                  />
                  <SettingsUnitInput
                    label="封禁时长"
                    unit="小时"
                    min={1}
                    value={settings.ip_block_hours}
                    onChange={(value) => updateNumber("ip_block_hours", value)}
                  />
                </div>
              </SettingsSection>

              {/* 3. IP + 设备组合冷却 */}
              <SettingsSection
                title="IP + 设备组合冷却"
                description="限制短时间内高频提交注册尝试（含失败验证码重试）的冷却窗口"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <SettingsUnitInput
                    label="允许尝试上限"
                    unit="次"
                    min={1}
                    value={settings.pair_attempt_limit}
                    onChange={(value) =>
                      updateNumber("pair_attempt_limit", value)
                    }
                  />
                  <SettingsUnitInput
                    label="统计窗口"
                    unit="分钟"
                    min={1}
                    value={settings.pair_attempt_window_minutes}
                    onChange={(value) =>
                      updateNumber("pair_attempt_window_minutes", value)
                    }
                  />
                  <SettingsUnitInput
                    label="触发冷却时长"
                    unit="小时"
                    min={1}
                    value={settings.pair_cooldown_hours}
                    onChange={(value) =>
                      updateNumber("pair_cooldown_hours", value)
                    }
                  />
                </div>
              </SettingsSection>

              {/* 4. C 段子网聚合限制 */}
              <SettingsSection
                title="C 段子网聚合限制"
                description="针对同一 IPv4 /24 子网内轮换代理 IP 批量注册行为实施聚合限流"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <SettingsUnitInput
                    label="子网注册上限"
                    unit="次"
                    min={1}
                    value={settings.subnet_success_limit}
                    onChange={(value) =>
                      updateNumber("subnet_success_limit", value)
                    }
                  />
                  <SettingsUnitInput
                    label="统计窗口"
                    unit="小时"
                    min={1}
                    value={settings.subnet_window_hours}
                    onChange={(value) =>
                      updateNumber("subnet_window_hours", value)
                    }
                  />
                </div>
              </SettingsSection>

              {/* 5. 域名与网段特征库 */}
              <SettingsSection
                title="一次性邮箱域名与高危代理网段"
                description="组合特征拦截：当请求同时命中一次性邮箱域名、代理 CIDR 网段且设备已注册过账号时直接拒绝。"
              >
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <RiskListField
                    id="risk-disposable-domains"
                    label="临时邮箱域名"
                    counterLabel={`已配置 ${domainCount} 个域名`}
                    value={domains}
                    onChange={setDomains}
                    placeholder={"yopmail.com\ntempmail.lol\nguerrillamail.com"}
                  />
                  <RiskListField
                    id="risk-proxy-cidrs"
                    label="代理 / 机房 CIDR"
                    counterLabel={`已配置 ${cidrCount} 条网段`}
                    value={cidrs}
                    onChange={setCIDRs}
                    placeholder={"203.0.113.0/24\n198.51.100.0/24"}
                  />
                </div>
              </SettingsSection>
            </div>
          )}
        </div>
      )}
    </SettingsCard>
  );
}

function RiskListField({
  id,
  label,
  counterLabel,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  counterLabel: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <label
          htmlFor={id}
          className="text-xs font-medium text-foreground sm:text-[13px]"
        >
          {label}
        </label>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {counterLabel}
        </span>
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          settingsInputClassName,
          "min-h-28 font-mono text-xs leading-5"
        )}
      />
      <p className="text-[11px] text-muted-foreground">
        每行一项，也支持英文逗号分隔
      </p>
    </div>
  );
}
