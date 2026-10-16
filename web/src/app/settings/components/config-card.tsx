"use client";

import { Gauge, LoaderCircle, PlugZap, Save, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MagneticButton } from "@/components/ui/magnetic-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { testProxy, type ProxyTestResult } from "@/lib/api";

import { useSettingsStore } from "../store";
import { normalizeImageAccountSchedule } from "../settings-normalizers";
import {
  SettingsCard,
  SettingsHelp,
  SettingsSectionLabel,
  settingsInputClassName,
  settingsPanelClassName,
} from "./settings-ui";
import { ConfigLoadingState, NumberField, ProxyResult, ToggleField } from "./config-card-parts";
import { capacityErrors } from "./config-card-validation";

export function ConfigCard() {
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<ProxyTestResult | null>(null);
  const config = useSettingsStore((state) => state.config);
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const saveConfigSection = useSettingsStore((state) => state.saveConfigSection);
  const setRefreshAccountIntervalMinute = useSettingsStore((state) => state.setRefreshAccountIntervalMinute);
  const setImageConcurrentLimit = useSettingsStore((state) => state.setImageConcurrentLimit);
  const setImageWorkerCount = useSettingsStore((state) => state.setImageWorkerCount);
  const setImageQueueCapacity = useSettingsStore((state) => state.setImageQueueCapacity);
  const setVideoWorkerCount = useSettingsStore((state) => state.setVideoWorkerCount);
  const setVideoQueueCapacity = useSettingsStore((state) => state.setVideoQueueCapacity);
  const setImageAccountConcurrency = useSettingsStore((state) => state.setImageAccountConcurrency);
  const setImageAccountSchedule = useSettingsStore((state) => state.setImageAccountSchedule);
  const setImageTaskTimeoutSeconds = useSettingsStore((state) => state.setImageTaskTimeoutSeconds);
  const setUserDefaultConcurrentLimit = useSettingsStore((state) => state.setUserDefaultConcurrentLimit);
  const setUserDefaultRpmLimit = useSettingsStore((state) => state.setUserDefaultRpmLimit);
  const setAPIKeyDefaultRpmLimit = useSettingsStore((state) => state.setAPIKeyDefaultRpmLimit);
  const setAPIKeyDefaultConcurrentLimit = useSettingsStore((state) => state.setAPIKeyDefaultConcurrentLimit);
  const setAPIKeyDailyRequestLimit = useSettingsStore((state) => state.setAPIKeyDailyRequestLimit);
  const setImageRetentionDays = useSettingsStore((state) => state.setImageRetentionDays);
  const setVideoRetentionDays = useSettingsStore((state) => state.setVideoRetentionDays);
  const setAutoRemoveInvalidAccounts = useSettingsStore((state) => state.setAutoRemoveInvalidAccounts);
  const setAutoRemoveRateLimitedAccounts = useSettingsStore((state) => state.setAutoRemoveRateLimitedAccounts);
  const setProxy = useSettingsStore((state) => state.setProxy);
  const setBaseUrl = useSettingsStore((state) => state.setBaseUrl);

  const handleTestProxy = async () => {
    const candidate = String(config?.proxy || "").trim();
    if (!candidate) {
      toast.error("请先填写代理地址");
      return;
    }
    setIsTestingProxy(true);
    setProxyTestResult(null);
    try {
      const data = await testProxy(candidate);
      setProxyTestResult(data.result);
      if (data.result.ok) toast.success(`代理可用：${data.result.latency_ms} ms，HTTP ${data.result.status}`);
      else toast.error(`代理不可用：${data.result.error ?? "未知错误"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试代理失败");
    } finally {
      setIsTestingProxy(false);
    }
  };

  if (isLoadingConfig || !config) {
    return (
      <SettingsCard icon={Settings2} title="系统设置">
        <ConfigLoadingState />
      </SettingsCard>
    );
  }

  const validationErrors = capacityErrors(config as Record<string, unknown>);
  const imageWorkerCount = Number(config.image_worker_count) || 1;
  const imageChannelLimit = Number(config.image_concurrent_limit) || 1;
  const userConcurrentLimit = Number(config.user_default_concurrent_limit) || 0;
  const configuredImageCeiling = Math.min(imageWorkerCount, imageChannelLimit, userConcurrentLimit > 0 ? userConcurrentLimit : Number.POSITIVE_INFINITY);
  const save = async () => {
    if (Object.keys(validationErrors).length) {
      toast.error("请先修正并发与超时设置中的非法值");
      return;
    }
    const receipt = await saveConfigSection([
      "refresh_account_interval_minute", "base_url", "image_retention_days", "video_retention_days",
      "image_concurrent_limit", "image_worker_count", "image_queue_capacity", "video_worker_count", "video_queue_capacity",
      "image_task_timeout_seconds", "user_default_concurrent_limit", "user_default_rpm_limit", "api_key_default_rpm_limit", "api_key_default_concurrent_limit", "api_key_daily_request_limit", "image_account_concurrency",
      "image_account_schedule", "auto_remove_invalid_accounts", "auto_remove_rate_limited_accounts", "proxy",
    ]);
    if (receipt) toast.info(receipt.restartRequired ? "配置已保存，Worker/队列相关设置需要重启后生效" : "配置已保存，立即生效");
  };

  return (
    <SettingsCard
      icon={Settings2}
      title="系统设置"
      action={<MagneticButton size="lg" onClick={() => void save()} disabled={isSavingConfig || Object.keys(validationErrors).length > 0}>{isSavingConfig ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}保存设置</MagneticButton>}
    >
      <div className="flex flex-col gap-5">
        <div className={settingsPanelClassName}>
          <SettingsSectionLabel>基础参数</SettingsSectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField id="settings-refresh-interval" label="账号刷新间隔（分钟）" value={config.refresh_account_interval_minute} onChange={setRefreshAccountIntervalMinute} placeholder="5" />
            <Field className="min-w-0 gap-1.5">
              <FieldLabel htmlFor="settings-base-url">站点访问地址</FieldLabel>
              <Input id="settings-base-url" value={String(config.base_url || "")} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://example.com" className={settingsInputClassName} />
            </Field>
            <NumberField id="settings-retention-days" label="图片保留天数" value={config.image_retention_days} onChange={setImageRetentionDays} placeholder="30" />
            <NumberField id="settings-video-retention-days" label="视频保留天数" value={config.video_retention_days} onChange={setVideoRetentionDays} placeholder="30" />
          </div>
        </div>

        <div className={settingsPanelClassName}>
          <SettingsSectionLabel hint="控制并发与超时，避免打满号池">生图并发与超时</SettingsSectionLabel>
          <div className="mb-4 rounded-2xl border border-border/70 bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="grid size-8 place-items-center rounded-lg bg-status-info-soft text-status-info"><Gauge className="size-4" /></span>
              当前生效概览
              <SettingsHelp content="本地号池有效并发取本地号池上限、Worker、用户本地任务限制和账号池容量中的最小值；中转站使用各自渠道并发和独立 Worker。Worker 与等待队列保存后需重启，其他限制保存后立即生效。" />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-background px-3 py-2"><div className="text-xs text-muted-foreground">本地号池并发上限</div><div className="mt-1 text-lg font-semibold tabular-nums">{configuredImageCeiling === Number.POSITIVE_INFINITY ? "不限" : configuredImageCeiling}</div></div>
              <div className="rounded-xl bg-background px-3 py-2"><div className="text-xs text-muted-foreground">图片 Worker</div><div className="mt-1 text-lg font-semibold tabular-nums">{imageWorkerCount}</div></div>
              <div className="rounded-xl bg-background px-3 py-2"><div className="text-xs text-muted-foreground">视频 Worker</div><div className="mt-1 text-lg font-semibold tabular-nums">{Number(config.video_worker_count) || 1}</div></div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
              <NumberField id="settings-image-concurrent-limit" label="本地号池生图并发" value={config.image_concurrent_limit} onChange={setImageConcurrentLimit} placeholder="3" min={1} max={100} error={validationErrors.image_concurrent_limit} />
            <NumberField id="settings-image-worker-count" label="图片 Worker（重启生效）" value={config.image_worker_count} onChange={setImageWorkerCount} placeholder="8" min={1} max={100} error={validationErrors.image_worker_count} />
            <NumberField id="settings-image-queue-capacity" label="图片等待队列（重启生效）" value={config.image_queue_capacity} onChange={setImageQueueCapacity} placeholder="256" min={1} max={2000} error={validationErrors.image_queue_capacity} />
            <NumberField id="settings-video-worker-count" label="视频 Worker（重启生效）" value={config.video_worker_count} onChange={setVideoWorkerCount} placeholder="2" min={1} max={32} error={validationErrors.video_worker_count} />
            <NumberField id="settings-video-queue-capacity" label="视频等待队列（重启生效）" value={config.video_queue_capacity} onChange={setVideoQueueCapacity} placeholder="64" min={1} max={1000} error={validationErrors.video_queue_capacity} />
            <NumberField id="settings-image-timeout" label="图片任务超时（秒）" value={config.image_task_timeout_seconds} onChange={setImageTaskTimeoutSeconds} placeholder="300" min={30} max={3600} error={validationErrors.image_task_timeout_seconds} />
            <NumberField id="settings-user-concurrent" label="用户默认并发限制（0 不限）" value={config.user_default_concurrent_limit} onChange={setUserDefaultConcurrentLimit} placeholder="0 表示不限" min={0} error={validationErrors.user_default_concurrent_limit} />
            <NumberField id="settings-user-rpm" label="用户默认 RPM 限制（0 不限）" value={config.user_default_rpm_limit} onChange={setUserDefaultRpmLimit} placeholder="0 表示不限" min={0} error={validationErrors.user_default_rpm_limit} />
            <NumberField id="settings-api-key-rpm" label="API Key RPM 限制（0 不限）" value={config.api_key_default_rpm_limit} onChange={setAPIKeyDefaultRpmLimit} placeholder="0 表示不限" min={0} max={100000} error={validationErrors.api_key_default_rpm_limit} />
            <NumberField id="settings-api-key-concurrent" label="API Key 并发限制（0 不限）" value={config.api_key_default_concurrent_limit} onChange={setAPIKeyDefaultConcurrentLimit} placeholder="0 表示不限" min={0} max={10000} error={validationErrors.api_key_default_concurrent_limit} />
            <NumberField id="settings-api-key-daily" label="API Key 每日调用额度（0 不限）" value={config.api_key_daily_request_limit} onChange={setAPIKeyDailyRequestLimit} placeholder="0 表示不限" min={0} max={10000000} error={validationErrors.api_key_daily_request_limit} />
            <NumberField
              id="settings-image-account-concurrency"
              label="单账号生图并发（账户锁）"
              value={config.image_account_concurrency}
              onChange={setImageAccountConcurrency}
              placeholder="1"
              min={1}
              max={10}
              error={validationErrors.image_account_concurrency}
            />
            <Field className="min-w-0 gap-1.5">
              <FieldLabel htmlFor="settings-image-account-schedule">号池调度策略</FieldLabel>
              <Select
                value={normalizeImageAccountSchedule(config.image_account_schedule)}
                onValueChange={(value) => setImageAccountSchedule(normalizeImageAccountSchedule(value))}
              >
                <SelectTrigger id="settings-image-account-schedule" className={settingsInputClassName}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="least_loaded">最少占用（优先空闲号）</SelectItem>
                  <SelectItem value="least_fail">最少失败（优先失败少的号）</SelectItem>
                  <SelectItem value="quota_aware">额度优先（优先剩余额度高的号）</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>

        <div className={settingsPanelClassName}>
          <SettingsSectionLabel hint="开关类策略">自动清理</SettingsSectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleField checked={Boolean(config.auto_remove_invalid_accounts)} label="自动移除异常账号" onChange={setAutoRemoveInvalidAccounts} />
            <ToggleField checked={Boolean(config.auto_remove_rate_limited_accounts)} label="自动移除限流账号" onChange={setAutoRemoveRateLimitedAccounts} />
          </div>
        </div>

        <div className="rounded-[16px] border border-border/80 bg-muted/25 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-foreground">全局代理</div>
            </div>
            <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={() => void handleTestProxy()} disabled={isTestingProxy}>
              {isTestingProxy ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />}测试代理
            </Button>
          </div>
          <Input aria-label="全局代理地址" value={String(config.proxy || "")} onChange={(event) => { setProxy(event.target.value); setProxyTestResult(null); }} placeholder="http://127.0.0.1:7890" className={settingsInputClassName} />
          <div className="mt-3"><ProxyResult result={proxyTestResult} /></div>
        </div>
      </div>
    </SettingsCard>
  );
}
