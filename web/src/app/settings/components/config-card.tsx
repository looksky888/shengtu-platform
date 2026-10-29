"use client";

import { Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SettingsConfig } from "@/lib/settings-types";

import { isConfigKeysDirty } from "../settings-dirty";
import { useRegisterSettingsDirty } from "../settings-dirty-registry-hooks";
import { normalizeImageAccountSchedule } from "../settings-normalizers";
import { useSettingsStore } from "../store";
import {
  ConcurrencyOverviewStrip,
  ConfigLoadingState,
  ProxySourceStatusStrip,
  RestartBadge,
} from "./config-card-parts";
import { capacityErrors } from "./config-card-validation";
import {
  SettingsCard,
  SettingsCardSaveFooter,
  SettingsSection,
  SettingsSwitchRow,
  SettingsUnitInput,
  settingsInputClassName,
} from "./settings-ui";

const BASE_CONFIG_KEYS: readonly (keyof SettingsConfig)[] = [
  "base_url",
  "refresh_account_interval_minute",
  "image_concurrent_limit",
  "image_account_concurrency",
  "image_task_timeout_seconds",
  "image_account_schedule",
  "image_parallel_generation",
  "image_worker_count",
  "image_queue_capacity",
  "video_worker_count",
  "video_queue_capacity",
  "user_default_concurrent_limit",
  "user_default_rpm_limit",
  "api_key_default_concurrent_limit",
  "api_key_default_rpm_limit",
  "api_key_daily_request_limit",
  "image_retention_days",
  "video_retention_days",
  "auto_remove_invalid_accounts",
  "auto_remove_rate_limited_accounts",
];

export function ConfigCard() {
  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot
  );
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const savingSectionKey = useSettingsStore((state) => state.savingSectionKey);
  const saveConfigSection = useSettingsStore(
    (state) => state.saveConfigSection
  );
  const resetConfigSection = useSettingsStore(
    (state) => state.resetConfigSection
  );

  const setBaseUrl = useSettingsStore((state) => state.setBaseUrl);
  const setRefreshAccountIntervalMinute = useSettingsStore(
    (state) => state.setRefreshAccountIntervalMinute
  );
  const setImageConcurrentLimit = useSettingsStore(
    (state) => state.setImageConcurrentLimit
  );
  const setImageAccountConcurrency = useSettingsStore(
    (state) => state.setImageAccountConcurrency
  );
  const setImageTaskTimeoutSeconds = useSettingsStore(
    (state) => state.setImageTaskTimeoutSeconds
  );
  const setImageAccountSchedule = useSettingsStore(
    (state) => state.setImageAccountSchedule
  );
  const setImageProxyField = useSettingsStore(
    (state) => state.setImageProxyField
  );
  const setImageWorkerCount = useSettingsStore(
    (state) => state.setImageWorkerCount
  );
  const setImageQueueCapacity = useSettingsStore(
    (state) => state.setImageQueueCapacity
  );
  const setVideoWorkerCount = useSettingsStore(
    (state) => state.setVideoWorkerCount
  );
  const setVideoQueueCapacity = useSettingsStore(
    (state) => state.setVideoQueueCapacity
  );
  const setUserDefaultConcurrentLimit = useSettingsStore(
    (state) => state.setUserDefaultConcurrentLimit
  );
  const setUserDefaultRpmLimit = useSettingsStore(
    (state) => state.setUserDefaultRpmLimit
  );
  const setAPIKeyDefaultConcurrentLimit = useSettingsStore(
    (state) => state.setAPIKeyDefaultConcurrentLimit
  );
  const setAPIKeyDefaultRpmLimit = useSettingsStore(
    (state) => state.setAPIKeyDefaultRpmLimit
  );
  const setAPIKeyDailyRequestLimit = useSettingsStore(
    (state) => state.setAPIKeyDailyRequestLimit
  );
  const setImageRetentionDays = useSettingsStore(
    (state) => state.setImageRetentionDays
  );
  const setVideoRetentionDays = useSettingsStore(
    (state) => state.setVideoRetentionDays
  );
  const setAutoRemoveInvalidAccounts = useSettingsStore(
    (state) => state.setAutoRemoveInvalidAccounts
  );
  const setAutoRemoveRateLimitedAccounts = useSettingsStore(
    (state) => state.setAutoRemoveRateLimitedAccounts
  );

  useRegisterSettingsDirty({
    id: "base-config-validator",
    tab: "base",
    label: "基础与调度参数",
    isDirty: false,
    validate: () => {
      if (!config) return true;
      const errors = capacityErrors(config as Record<string, unknown>);
      const firstError = Object.values(errors)[0];
      if (firstError) {
        toast.error(firstError);
        return false;
      }
      return true;
    },
  });

  if (isLoadingConfig || !config) {
    return (
      <SettingsCard
        icon={Settings2}
        title="基础运行与调度参数"
        description="统一管理站点地址、号池并发、Worker 容量、默认限流与资产生命周期"
      >
        <ConfigLoadingState />
      </SettingsCard>
    );
  }

  const validationErrors = capacityErrors(config as Record<string, unknown>);
  const hasValidationError = Object.keys(validationErrors).length > 0;
  const sectionDirty = isConfigKeysDirty(
    config,
    savedConfigSnapshot,
    BASE_CONFIG_KEYS
  );
  const isSavingSection =
    isSavingConfig &&
    (savingSectionKey === "base-config" || savingSectionKey === "__all__");

  const imageWorkerCount = Math.max(1, Number(config.image_worker_count) || 1);
  const imageQueueCapacity = Math.max(
    1,
    Number(config.image_queue_capacity) || 256
  );
  const videoWorkerCount = Math.max(1, Number(config.video_worker_count) || 1);
  const videoQueueCapacity = Math.max(
    1,
    Number(config.video_queue_capacity) || 64
  );
  const imageChannelLimit = Math.max(
    1,
    Number(config.image_concurrent_limit) || 1
  );
  const userConcurrentLimit = Number(config.user_default_concurrent_limit) || 0;
  const configuredImageCeiling = Math.min(
    imageWorkerCount,
    imageChannelLimit,
    userConcurrentLimit > 0 ? userConcurrentLimit : Number.POSITIVE_INFINITY
  );

  const handleSave = async () => {
    if (hasValidationError) {
      const firstError = Object.values(validationErrors)[0];
      toast.error(firstError || "请先修正表单中标红的参数范围错误");
      return;
    }
    await saveConfigSection(BASE_CONFIG_KEYS, { sectionKey: "base-config" });
  };

  return (
    <SettingsCard
      icon={Settings2}
      title="基础运行与调度参数"
      description="统一管理站点地址、号池并发、Worker 容量、默认限流与资产生命周期"
      footer={
        <SettingsCardSaveFooter
          dirty={sectionDirty}
          saving={isSavingSection}
          disabled={isSavingConfig}
          hint={
            hasValidationError
              ? "请先修正标红的参数范围错误后再保存"
              : undefined
          }
          onReset={() => resetConfigSection(BASE_CONFIG_KEYS)}
          onSave={() => void handleSave()}
        />
      }
    >
      <div className="space-y-5">
        {/* 1. 站点基础地址 */}
        <SettingsSection
          layout="split"
          title="站点基础地址"
          description="用于拼装外部回调、邮件验证码链接与作品公开分享地址；出站代理由「代理与清障」统一接管。"
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <label
                  htmlFor="settings-base-url"
                  className="text-xs font-medium text-foreground sm:text-[13px]"
                >
                  站点访问地址
                </label>
                <span className="font-mono text-[11px] text-muted-foreground">
                  https://...
                </span>
              </div>
              <Input
                id="settings-base-url"
                type="url"
                value={String(config.base_url || "")}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://studio.example.com"
                aria-invalid={Boolean(validationErrors.base_url)}
                className={settingsInputClassName}
              />
              {validationErrors.base_url ? (
                <p className="text-xs leading-4 text-status-danger">
                  {validationErrors.base_url}
                </p>
              ) : (
                <p className="text-[11px] leading-4.5 text-muted-foreground">
                  建议填写公网 HTTPS 根域名（末尾无需斜杠）；留空时按请求 Host 自动推断。
                </p>
              )}
            </div>

            <ProxySourceStatusStrip proxy={String(config.proxy || "")} />
          </div>
        </SettingsSection>

        {/* 2. 号池刷新与任务调度 */}
        <SettingsSection
          layout="split"
          title="号池刷新与任务调度"
          description="控制本地账号池后台巡检频率、单号并发锁、任务超时及选号优先级。"
        >
          <div className="grid gap-3.5 sm:grid-cols-2">
            <SettingsUnitInput
              id="settings-refresh-interval"
              label="账号池巡检间隔"
              unit="分钟"
              min={1}
              max={1440}
              rangeHint="1–1440"
              placeholder="5"
              value={config.refresh_account_interval_minute ?? ""}
              error={validationErrors.refresh_account_interval_minute}
              onChange={setRefreshAccountIntervalMinute}
            />
            <SettingsUnitInput
              id="settings-image-concurrent-limit"
              label="本地号池生图总并发"
              unit="并发"
              min={1}
              max={100}
              rangeHint="1–100"
              placeholder="4"
              value={config.image_concurrent_limit ?? ""}
              error={validationErrors.image_concurrent_limit}
              onChange={setImageConcurrentLimit}
            />
            <SettingsUnitInput
              id="settings-image-account-concurrency"
              label="单账号并发上限（账户锁）"
              unit="并发/号"
              min={1}
              max={10}
              rangeHint="1–10"
              placeholder="1"
              value={config.image_account_concurrency ?? ""}
              error={validationErrors.image_account_concurrency}
              onChange={setImageAccountConcurrency}
            />
            <SettingsUnitInput
              id="settings-image-timeout"
              label="单次生图任务超时"
              unit="秒"
              min={30}
              max={3600}
              rangeHint="30–3600"
              placeholder="300"
              value={config.image_task_timeout_seconds ?? ""}
              error={validationErrors.image_task_timeout_seconds}
              onChange={setImageTaskTimeoutSeconds}
            />
            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="settings-image-account-schedule"
                className="text-xs font-medium text-foreground sm:text-[13px]"
              >
                号池账号调度策略
              </label>
              <Select
                value={normalizeImageAccountSchedule(
                  config.image_account_schedule
                )}
                onValueChange={(value) =>
                  setImageAccountSchedule(normalizeImageAccountSchedule(value))
                }
              >
                <SelectTrigger
                  id="settings-image-account-schedule"
                  className={settingsInputClassName}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="least_loaded">
                    最少占用（优先分配当前空闲账号）
                  </SelectItem>
                  <SelectItem value="least_fail">
                    最少失败（优先分配近期高稳定账号）
                  </SelectItem>
                  <SelectItem value="quota_aware">
                    额度优先（优先分配剩余配额充足账号）
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <SettingsSwitchRow
            id="settings-image-parallel-generation"
            title="多图请求并行分发生成"
            description="单次请求生成多张图片时并行投递子任务以缩短端到端等待耗时；关闭则顺序执行以降低瞬时并发峰值"
            checked={Boolean(config.image_parallel_generation)}
            onCheckedChange={(checked) =>
              setImageProxyField({ image_parallel_generation: checked })
            }
          />
        </SettingsSection>

        {/* 3. Worker 与队列容量 */}
        <SettingsSection
          layout="split"
          title="Worker 与队列容量"
          description="决定进程内异步消费协程数量与等待队列缓冲深度，修改保存后需重启后端服务生效。"
        >
          <ConcurrencyOverviewStrip
            configuredImageCeiling={configuredImageCeiling}
            imageWorkerCount={imageWorkerCount}
            imageQueueCapacity={imageQueueCapacity}
            videoWorkerCount={videoWorkerCount}
            videoQueueCapacity={videoQueueCapacity}
          />
          <div className="grid gap-3.5 sm:grid-cols-2">
            <SettingsUnitInput
              id="settings-image-worker-count"
              label="图片消费协程"
              unit="Worker"
              min={1}
              max={100}
              rangeHint="1–100"
              placeholder="8"
              badge={<RestartBadge />}
              value={config.image_worker_count ?? ""}
              error={validationErrors.image_worker_count}
              onChange={setImageWorkerCount}
            />
            <SettingsUnitInput
              id="settings-image-queue-capacity"
              label="图片等待队列容量"
              unit="队列"
              min={1}
              max={2000}
              rangeHint="1–2000"
              placeholder="256"
              badge={<RestartBadge />}
              value={config.image_queue_capacity ?? ""}
              error={validationErrors.image_queue_capacity}
              onChange={setImageQueueCapacity}
            />
            <SettingsUnitInput
              id="settings-video-worker-count"
              label="视频消费协程"
              unit="Worker"
              min={1}
              max={32}
              rangeHint="1–32"
              placeholder="2"
              badge={<RestartBadge />}
              value={config.video_worker_count ?? ""}
              error={validationErrors.video_worker_count}
              onChange={setVideoWorkerCount}
            />
            <SettingsUnitInput
              id="settings-video-queue-capacity"
              label="视频等待队列容量"
              unit="队列"
              min={1}
              max={1000}
              rangeHint="1–1000"
              placeholder="64"
              badge={<RestartBadge />}
              value={config.video_queue_capacity ?? ""}
              error={validationErrors.video_queue_capacity}
              onChange={setVideoQueueCapacity}
            />
          </div>
        </SettingsSection>

        {/* 4. 用户与 API Key 默认限流 */}
        <SettingsSection
          layout="split"
          title="用户与 API Key 默认限流"
          description="为未单独配置专属配额的注册用户与外部 API Key 提供默认并发及调用速率保护。"
        >
          <div className="grid gap-3.5 sm:grid-cols-2">
            <SettingsUnitInput
              id="settings-user-concurrent"
              label="用户默认并发限制"
              unit="并发"
              min={0}
              rangeHint="0 = 不限制"
              placeholder="0"
              value={config.user_default_concurrent_limit ?? ""}
              error={validationErrors.user_default_concurrent_limit}
              onChange={setUserDefaultConcurrentLimit}
            />
            <SettingsUnitInput
              id="settings-user-rpm"
              label="用户默认速率限制"
              unit="RPM"
              min={0}
              rangeHint="0 = 不限制"
              placeholder="0"
              value={config.user_default_rpm_limit ?? ""}
              error={validationErrors.user_default_rpm_limit}
              onChange={setUserDefaultRpmLimit}
            />
            <SettingsUnitInput
              id="settings-api-key-concurrent"
              label="API Key 默认并发限制"
              unit="并发"
              min={0}
              max={10000}
              rangeHint="0 = 不限制"
              placeholder="0"
              value={config.api_key_default_concurrent_limit ?? ""}
              error={validationErrors.api_key_default_concurrent_limit}
              onChange={setAPIKeyDefaultConcurrentLimit}
            />
            <SettingsUnitInput
              id="settings-api-key-rpm"
              label="API Key 默认速率限制"
              unit="RPM"
              min={0}
              max={100000}
              rangeHint="0 = 不限制"
              placeholder="0"
              value={config.api_key_default_rpm_limit ?? ""}
              error={validationErrors.api_key_default_rpm_limit}
              onChange={setAPIKeyDefaultRpmLimit}
            />
            <SettingsUnitInput
              id="settings-api-key-daily"
              label="API Key 每日请求配额"
              unit="次/日"
              min={0}
              max={10000000}
              rangeHint="0 = 不限制"
              placeholder="0"
              value={config.api_key_daily_request_limit ?? ""}
              error={validationErrors.api_key_daily_request_limit}
              onChange={setAPIKeyDailyRequestLimit}
              className="sm:col-span-2"
            />
          </div>
        </SettingsSection>

        {/* 5. 资产保留期与异常账号治理 */}
        <SettingsSection
          layout="split"
          title="资产保留期与异常账号治理"
          description="管理创作媒体文件的自动清理保留天数，以及失效或高频限流账号的自动隔离策略。"
        >
          <div className="grid gap-3.5 sm:grid-cols-2">
            <SettingsUnitInput
              id="settings-retention-days"
              label="图片资产保留期"
              unit="天"
              min={1}
              max={3650}
              rangeHint="1–3650"
              placeholder="30"
              value={config.image_retention_days ?? ""}
              error={validationErrors.image_retention_days}
              onChange={setImageRetentionDays}
            />
            <SettingsUnitInput
              id="settings-video-retention-days"
              label="视频资产保留期"
              unit="天"
              min={1}
              max={3650}
              rangeHint="1–3650"
              placeholder="30"
              value={config.video_retention_days ?? ""}
              error={validationErrors.video_retention_days}
              onChange={setVideoRetentionDays}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SettingsSwitchRow
              id="settings-auto-remove-invalid"
              title="自动移除异常失效账号"
              description="检测到账号鉴权失效或封禁时，自动从可用调度池中摘除"
              checked={Boolean(config.auto_remove_invalid_accounts)}
              onCheckedChange={setAutoRemoveInvalidAccounts}
            />
            <SettingsSwitchRow
              id="settings-auto-remove-rate-limited"
              title="自动移除持续限流账号"
              description="账号连续触发上游速率限制时，自动移出轮询避免拖慢队列"
              checked={Boolean(config.auto_remove_rate_limited_accounts)}
              onCheckedChange={setAutoRemoveRateLimitedAccounts}
            />
          </div>
        </SettingsSection>
      </div>
    </SettingsCard>
  );
}
