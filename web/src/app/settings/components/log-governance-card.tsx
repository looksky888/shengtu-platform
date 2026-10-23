"use client";

import { useCallback, useState } from "react";
import { LoaderCircle, ScrollText } from "lucide-react";
import { toast } from "sonner";

import type { SettingsConfig } from "@/lib/settings-types";

import { extractSavedConfigSection, isConfigKeysDirty } from "../settings-dirty";
import { useRegisterSettingsDirty } from "../settings-dirty-registry";
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

export function LogGovernanceCard() {
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);

  const config = useSettingsStore((state) => state.config);
  const savedConfigSnapshot = useSettingsStore(
    (state) => state.savedConfigSnapshot
  );
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const savingSectionKey = useSettingsStore((state) => state.savingSectionKey);
  const logGovernance = useSettingsStore((state) => state.logGovernance);
  const lastLogCleanup = useSettingsStore((state) => state.lastLogCleanup);
  const isLoadingLogGovernance = useSettingsStore(
    (state) => state.isLoadingLogGovernance
  );
  const isCleaningLogs = useSettingsStore((state) => state.isCleaningLogs);

  const setLogRetentionDays = useSettingsStore(
    (state) => state.setLogRetentionDays
  );
  const setLogLevel = useSettingsStore((state) => state.setLogLevel);
  const saveConfigSection = useSettingsStore(
    (state) => state.saveConfigSection
  );
  const resetConfigSection = useSettingsStore(
    (state) => state.resetConfigSection
  );
  const loadLogGovernance = useSettingsStore(
    (state) => state.loadLogGovernance
  );
  const cleanupLogsByRetention = useSettingsStore(
    (state) => state.cleanupLogsByRetention
  );

  const isDirty = isConfigKeysDirty(
    config,
    savedConfigSnapshot,
    LOG_CONFIG_KEYS
  );
  const isRetentionDirty = isConfigKeysDirty(config, savedConfigSnapshot, [
    "log_retention_days",
  ]);

  const validateLogConfig = useCallback(() => {
    if (!config) return true;
    const days = Number(config.log_retention_days);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      toast.error("日志保留天数需在 1 - 3650 天之间");
      return false;
    }
    return true;
  }, [config]);

  useRegisterSettingsDirty({
    id: "log-governance-validator",
    tab: "maintenance",
    label: "维护与日志",
    isDirty: false,
    validate: validateLogConfig,
  });

  if (isLoadingConfig || !config) {
    return (
      <SettingsCard
        icon={ScrollText}
        title="日志治理与保留策略"
        description="管理日志采集等级、保留天数上限与过期历史记录清理"
        tone="amber"
      >
        <div className="flex items-center justify-center py-12">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
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
      Number(savedBaseline.log_retention_days ?? config.log_retention_days) || 7
    )
  );
  const retentionDays = Math.min(
    3650,
    Math.max(1, Number(config.log_retention_days) || 7)
  );

  const isSavingThisCard =
    isSavingConfig &&
    (savingSectionKey === "log_governance" ||
      savingSectionKey === "log_retention_cleanup" ||
      savingSectionKey === "__all__");

  const handleSave = async () => {
    if (!validateLogConfig()) return;
    await saveConfigSection(LOG_CONFIG_KEYS, {
      sectionKey: "log_governance",
    });
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
        <SettingsCardSaveFooter
          dirty={isDirty}
          saving={isSavingThisCard}
          disabled={isCleaningLogs}
          onReset={() => resetConfigSection(LOG_CONFIG_KEYS)}
          onSave={() => void handleSave()}
        />
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
          onRetentionDaysChange={setLogRetentionDays}
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
