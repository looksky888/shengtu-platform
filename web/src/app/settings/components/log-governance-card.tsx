"use client";

import { useCallback, useState } from "react";
import { ScrollText } from "lucide-react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import type { SettingsConfig } from "@/lib/settings-types";

import {
  extractSavedConfigSection,
  isConfigKeysDirty,
} from "../settings-dirty";
import { useRegisterSettingsDirty } from "../settings-dirty-registry-hooks";
import { useSettingsStore } from "../store";
import { LogCleanupDialog } from "./log-cleanup-dialog";
import {
  LogLevelSection,
  LogRetentionSection,
  LogStatsSection,
} from "./log-governance-parts";
import { SettingsCard, SettingsCardSaveFooter } from "./settings-ui";

const LOG_CONFIG_KEYS: readonly (keyof SettingsConfig)[] = [
  "log_retention_days",
  "log_levels",
];

function getLogRetentionError(raw: unknown): string | undefined {
  const text = raw === undefined || raw === null ? "" : String(raw).trim();
  const num = text === "" ? Number.NaN : Number(text);
  if (!Number.isInteger(num) || num < 1 || num > 3650) {
    return "日志保留天数需为 1–3650 天之间的整数";
  }
  return undefined;
}

export function LogGovernanceCard({
  hideFooter = false,
}: {
  hideFooter?: boolean;
} = {}) {
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);

  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot,
  );
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const savingSectionKey = useSettingsStore((state) => state.savingSectionKey);
  const logGovernance = useSettingsStore((state) => state.logGovernance);
  const lastLogCleanup = useSettingsStore((state) => state.lastLogCleanup);
  const isLoadingLogGovernance = useSettingsStore(
    (state) => state.isLoadingLogGovernance,
  );
  const isCleaningLogs = useSettingsStore((state) => state.isCleaningLogs);

  const setLogRetentionDays = useSettingsStore(
    (state) => state.setLogRetentionDays,
  );
  const setLogLevel = useSettingsStore((state) => state.setLogLevel);
  const saveConfigSection = useSettingsStore(
    (state) => state.saveConfigSection,
  );
  const resetConfigSection = useSettingsStore(
    (state) => state.resetConfigSection,
  );
  const loadLogGovernance = useSettingsStore(
    (state) => state.loadLogGovernance,
  );
  const cleanupLogsByRetention = useSettingsStore(
    (state) => state.cleanupLogsByRetention,
  );

  const isDirty = isConfigKeysDirty(
    config,
    savedConfigSnapshot,
    LOG_CONFIG_KEYS,
  );
  const isRetentionDirty = isConfigKeysDirty(config, savedConfigSnapshot, [
    "log_retention_days",
  ]);

  const validateLogConfig = useCallback(() => {
    const latest = useSettingsStore.getState().config;
    if (!latest) return true;
    const err = getLogRetentionError(latest.log_retention_days ?? 7);
    if (err) {
      toast.error(err);
      return false;
    }
    return true;
  }, []);

  const handleSave = useCallback(async () => {
    if (!validateLogConfig()) return false;
    const receipt = await saveConfigSection(LOG_CONFIG_KEYS, {
      sectionKey: "log_governance",
    });
    return receipt !== null;
  }, [saveConfigSection, validateLogConfig]);

  const handleDiscard = useCallback(() => {
    resetConfigSection(LOG_CONFIG_KEYS);
    return true;
  }, [resetConfigSection]);

  useRegisterSettingsDirty({
    id: "log-governance",
    tab: "backup",
    label: "日志治理与保留策略",
    isDirty,
    validate: validateLogConfig,
    save: handleSave,
    discard: handleDiscard,
  });

  if (isLoadingConfig || !config) {
    return (
      <SettingsCard
        icon={ScrollText}
        title="日志治理与保留策略"
        description="管理日志采集等级、保留天数上限与过期历史记录清理"
        tone="amber"
      >
        <div className="space-y-3 py-1">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Skeleton className="h-22 w-full" />
            <Skeleton className="h-22 w-full" />
            <Skeleton className="h-22 w-full" />
            <Skeleton className="h-22 w-full" />
          </div>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </SettingsCard>
    );
  }

  const savedBaseline = extractSavedConfigSection(savedConfigSnapshot, [
    "log_retention_days",
  ]);
  const savedRetentionDays = Math.min(
    3650,
    Math.max(
      1,
      Number(savedBaseline.log_retention_days ?? config.log_retention_days) ||
        7,
    ),
  );
  const retentionDays = Math.min(
    3650,
    Math.max(1, Number(config.log_retention_days) || 7),
  );
  const retentionError = getLogRetentionError(config.log_retention_days ?? 7);

  const isSavingThisCard =
    isSavingConfig &&
    (savingSectionKey === "log_governance" ||
      savingSectionKey === "log_retention_cleanup" ||
      savingSectionKey === "__all__");

  const handleRetentionBlur = () => {
    const raw = String(config.log_retention_days ?? "").trim();
    if (!raw) {
      setLogRetentionDays(String(savedRetentionDays));
      return;
    }
    if (/^-?\d+$/.test(raw)) {
      const parsed = Number(raw);
      if (Number.isSafeInteger(parsed)) {
        setLogRetentionDays(String(parsed));
      }
    }
  };

  const handleResetDefaultLevels = () => {
    for (const level of config.log_levels ?? []) {
      setLogLevel(level, false);
    }
  };

  const handleCleanup = async () => {
    if (!validateLogConfig()) return;
    if (isRetentionDirty) {
      const receipt = await saveConfigSection(["log_retention_days"], {
        sectionKey: "log_retention_cleanup",
        silentToast: true,
      });
      if (!receipt) return;
    }
    await cleanupLogsByRetention(retentionDays);
    setCleanupDialogOpen(false);
  };

  return (
    <SettingsCard
      icon={ScrollText}
      title="日志治理与保留策略"
      description="监控审计日志留存规模，配置采集级别过滤与过期日志滚动回收"
      tone="amber"
      footer={
        hideFooter ? undefined : (
          <SettingsCardSaveFooter
            dirty={isDirty}
            saving={isSavingThisCard}
            disabled={isCleaningLogs}
            hint={
              retentionError
                ? "请先修正标红的日志保留天数错误后再保存"
                : undefined
            }
            onReset={handleDiscard}
            onSave={() => void handleSave()}
          />
        )
      }
    >
      <div className="flex flex-col gap-5">
        <LogStatsSection
          governance={logGovernance}
          lastCleanup={lastLogCleanup}
          savedRetentionDays={savedRetentionDays}
          draftRetentionDays={retentionDays}
          isRetentionDirty={isRetentionDirty}
          isLoading={isLoadingLogGovernance}
          isCleaning={isCleaningLogs}
          onRefresh={() => void loadLogGovernance()}
          onOpenCleanup={() => setCleanupDialogOpen(true)}
        />

        <LogRetentionSection
          retentionDays={String(config.log_retention_days ?? "")}
          error={retentionError}
          onRetentionDaysChange={setLogRetentionDays}
          onRetentionDaysBlur={handleRetentionBlur}
        />

        <LogLevelSection
          selectedLevels={config.log_levels}
          onLevelChange={setLogLevel}
          onResetDefaultLevels={handleResetDefaultLevels}
        />
      </div>

      <LogCleanupDialog
        open={cleanupDialogOpen}
        retentionDays={retentionDays}
        savedRetentionDays={savedRetentionDays}
        isRetentionDirty={isRetentionDirty}
        isCleaning={isCleaningLogs || isSavingThisCard}
        onOpenChange={setCleanupDialogOpen}
        onConfirm={() => void handleCleanup()}
      />
    </SettingsCard>
  );
}
