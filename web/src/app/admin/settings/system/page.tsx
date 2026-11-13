"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { capacityErrors } from "@/app/settings/components/config-card-validation";
import { LogGovernanceCard } from "@/app/settings/components/log-governance-card";
import { SystemUpdateCard } from "@/app/settings/components/system-update-card";
import { isConfigKeysDirty } from "@/app/settings/settings-dirty";
import { useRegisterSettingsDirty } from "@/app/settings/settings-dirty-registry-hooks";
import { useSettingsStore } from "@/app/settings/store";
import { useEnsureSettingsConfigLoaded } from "@/app/settings/use-ensure-settings-config";
import {
  AdminPageFrame,
  AdminSectionCard,
  AdminStatTile,
  AdminStickyCommandBar,
  AdminUnderlineTabs,
} from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SettingsConfig } from "@/lib/settings-types";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";

type SystemAdminTab = "governance" | "update";

const SYSTEM_TABS = [
  { value: "governance" as const, label: "并发配额与日志治理" },
  { value: "update" as const, label: "在线版本平滑更新" },
] as const;

const SYSTEM_GOVERNANCE_KEYS: readonly (keyof SettingsConfig)[] = [
  "image_worker_count",
  "image_queue_capacity",
  "video_worker_count",
  "video_queue_capacity",
  "user_default_concurrent_limit",
  "user_default_rpm_limit",
  "api_key_default_concurrent_limit",
  "api_key_default_rpm_limit",
  "api_key_daily_request_limit",
  "log_retention_days",
  "log_levels",
];

export default function AdminSystemSettingsPage() {
  const { isCheckingAuth, session } = useAuthGuard(
    undefined,
    "/admin/settings/system",
  );
  const [activeTab, setActiveTab] = useState<SystemAdminTab>("governance");

  const config = useSettingsStore((state) => state.config);
  const logGovernanceLoaded = useSettingsStore((state) =>
    Boolean(state.loadedAt.logGovernance),
  );
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot,
  );
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isLoadingLogGovernance = useSettingsStore(
    (state) => state.isLoadingLogGovernance,
  );
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const loadConfig = useSettingsStore((state) => state.loadConfig);
  const loadLogGovernance = useSettingsStore(
    (state) => state.loadLogGovernance,
  );
  const saveConfigSection = useSettingsStore(
    (state) => state.saveConfigSection,
  );
  const resetConfigSection = useSettingsStore(
    (state) => state.resetConfigSection,
  );
  const attemptedLogLoadRef = useRef(false);

  useEnsureSettingsConfigLoaded(Boolean(session));

  const setImageWorkerCount = useSettingsStore(
    (state) => state.setImageWorkerCount,
  );
  const setImageQueueCapacity = useSettingsStore(
    (state) => state.setImageQueueCapacity,
  );
  const setVideoWorkerCount = useSettingsStore(
    (state) => state.setVideoWorkerCount,
  );
  const setVideoQueueCapacity = useSettingsStore(
    (state) => state.setVideoQueueCapacity,
  );
  const setUserDefaultConcurrentLimit = useSettingsStore(
    (state) => state.setUserDefaultConcurrentLimit,
  );
  const setUserDefaultRpmLimit = useSettingsStore(
    (state) => state.setUserDefaultRpmLimit,
  );
  const setAPIKeyDefaultConcurrentLimit = useSettingsStore(
    (state) => state.setAPIKeyDefaultConcurrentLimit,
  );
  const setAPIKeyDefaultRpmLimit = useSettingsStore(
    (state) => state.setAPIKeyDefaultRpmLimit,
  );
  const setAPIKeyDailyRequestLimit = useSettingsStore(
    (state) => state.setAPIKeyDailyRequestLimit,
  );

  useEffect(() => {
    if (!session) {
      attemptedLogLoadRef.current = false;
      return;
    }
    if (
      !logGovernanceLoaded &&
      !isLoadingLogGovernance &&
      !attemptedLogLoadRef.current
    ) {
      attemptedLogLoadRef.current = true;
      void loadLogGovernance();
    }
  }, [
    isLoadingLogGovernance,
    loadLogGovernance,
    logGovernanceLoaded,
    session,
  ]);

  const dirty = isConfigKeysDirty(
    config,
    savedConfigSnapshot,
    SYSTEM_GOVERNANCE_KEYS,
  );

  const validateGovernance = useCallback(() => {
    if (!config) return true;
    const allErrors = capacityErrors(config as Record<string, unknown>);
    const scopedErrorKey = SYSTEM_GOVERNANCE_KEYS.find((key) =>
      Boolean(allErrors[key]),
    );
    if (scopedErrorKey) {
      toast.error(allErrors[scopedErrorKey]);
      return false;
    }
    const rawLogDays = String(config.log_retention_days ?? "").trim();
    const logDays = rawLogDays === "" ? Number.NaN : Number(rawLogDays);
    if (!Number.isInteger(logDays) || logDays < 1 || logDays > 3650) {
      toast.error("日志保留天数需在 1 - 3650 天之间");
      return false;
    }
    return true;
  }, [config]);

  const handleSaveGovernance = useCallback(async () => {
    if (!validateGovernance()) return false;
    const receipt = await saveConfigSection(SYSTEM_GOVERNANCE_KEYS, {
      sectionKey: "system-governance",
    });
    return Boolean(receipt);
  }, [saveConfigSection, validateGovernance]);

  useRegisterSettingsDirty({
    id: "admin-page-system-governance",
    tab: "maintenance",
    label: "并发配额与日志治理",
    isDirty: dirty,
    validate: validateGovernance,
    save: handleSaveGovernance,
    discard: () => {
      resetConfigSection(SYSTEM_GOVERNANCE_KEYS);
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

  return (
    <AdminPageFrame
      groupLabel="系统配置"
      title="系统维护与更新"
      description="统一治理生图/视频 Worker 并发队列配额、用户默认速率限制、审计日志留存清理与在线平滑升级。"
      actions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isLoadingConfig}
          onClick={() => {
            void loadConfig();
            void loadLogGovernance();
          }}
        >
          <RefreshCw className={cn("size-3.5", isLoadingConfig && "animate-spin")} />
          刷新状态
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminStatTile
          label="生图 / 视频 Worker 容量"
          value={`${config?.image_worker_count ?? 4} 路 / ${config?.video_worker_count ?? 2} 路`}
          hint={`队列容量 ${config?.image_queue_capacity ?? 256} / ${config?.video_queue_capacity ?? 64}`}
        />
        <AdminStatTile
          label="默认用户并发 / RPM 限流"
          value={`${config?.user_default_concurrent_limit ?? 2} 并发 · ${config?.user_default_rpm_limit ?? 30} RPM`}
          hint={`API Key 默认 ${config?.api_key_default_rpm_limit ?? 60} RPM · 日配额 ${Number(config?.api_key_daily_request_limit) > 0 ? config?.api_key_daily_request_limit : "不限制"}`}
        />
        <AdminStatTile
          label="系统日志保留周期"
          value={`${config?.log_retention_days ?? 7} 天`}
          hint="超期记录按策略自动滚动清理"
        />
      </div>

      <AdminUnderlineTabs
        items={SYSTEM_TABS}
        value={activeTab}
        onValueChange={setActiveTab}
        syncQueryParam="tab"
        defaultValue="governance"
      />

      {activeTab === "governance" ? (
        <div className="space-y-4">
          <AdminStickyCommandBar
            dirty={dirty}
            saving={isSavingConfig}
            cleanSummary="Worker 并发配额、默认限流阈值与日志保留策略已同步"
            dirtySummary="并发配额或日志治理参数有未保存修改"
            onSave={() => void handleSaveGovernance()}
            onReset={() => resetConfigSection(SYSTEM_GOVERNANCE_KEYS)}
          />

          {config ? (
            <AdminSectionCard
              title="Worker 队列容量与默认速率限制"
              description="调整全局生图/视频执行器池规模及普通用户、外部 API 密钥的默认并发、每分钟请求上限与每日请求配额"
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[var(--admin-text)]">
                    生图 Worker 并发数
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={String(config.image_worker_count ?? 4)}
                    onChange={(event) => setImageWorkerCount(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[var(--admin-text)]">
                    生图队列最大容量
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={String(config.image_queue_capacity ?? 256)}
                    onChange={(event) => setImageQueueCapacity(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[var(--admin-text)]">
                    视频 Worker 并发数
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={String(config.video_worker_count ?? 2)}
                    onChange={(event) => setVideoWorkerCount(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[var(--admin-text)]">
                    视频队列最大容量
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={String(config.video_queue_capacity ?? 64)}
                    onChange={(event) => setVideoQueueCapacity(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[var(--admin-text)]">
                    单用户默认并发上限
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={String(config.user_default_concurrent_limit ?? 2)}
                    onChange={(event) =>
                      setUserDefaultConcurrentLimit(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[var(--admin-text)]">
                    单用户默认 RPM 上限
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={String(config.user_default_rpm_limit ?? 30)}
                    onChange={(event) => setUserDefaultRpmLimit(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[var(--admin-text)]">
                    API Key 默认并发上限
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={String(config.api_key_default_concurrent_limit ?? 4)}
                    onChange={(event) =>
                      setAPIKeyDefaultConcurrentLimit(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[var(--admin-text)]">
                    API Key 默认 RPM 上限
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={String(config.api_key_default_rpm_limit ?? 60)}
                    onChange={(event) =>
                      setAPIKeyDefaultRpmLimit(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[var(--admin-text)]">
                    API Key 每日请求配额上限（0 = 不限制）
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={10000000}
                    value={String(config.api_key_daily_request_limit ?? 0)}
                    onChange={(event) =>
                      setAPIKeyDailyRequestLimit(event.target.value)
                    }
                  />
                </div>
              </div>
            </AdminSectionCard>
          ) : null}

          <LogGovernanceCard hideFooter />
        </div>
      ) : (
        <SystemUpdateCard />
      )}
    </AdminPageFrame>
  );
}
