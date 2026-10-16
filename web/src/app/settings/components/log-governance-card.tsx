"use client";

import { useState } from "react";
import { LoaderCircle, Save, ScrollText } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useSettingsStore } from "../store";
import { LogCleanupDialog } from "./log-cleanup-dialog";
import { LogLevelSection, LogRetentionSection, LogStatsSection } from "./log-governance-parts";
import { SettingsCard } from "./settings-ui";

export function LogGovernanceCard() {
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const config = useSettingsStore((state) => state.config);
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const isSavingConfig = useSettingsStore((state) => state.isSavingConfig);
  const logGovernance = useSettingsStore((state) => state.logGovernance);
  const lastLogCleanup = useSettingsStore((state) => state.lastLogCleanup);
  const isLoadingLogGovernance = useSettingsStore((state) => state.isLoadingLogGovernance);
  const isCleaningLogs = useSettingsStore((state) => state.isCleaningLogs);
  const setLogRetentionDays = useSettingsStore((state) => state.setLogRetentionDays);
  const setLogLevel = useSettingsStore((state) => state.setLogLevel);
  const saveConfigSection = useSettingsStore((state) => state.saveConfigSection);
  const loadLogGovernance = useSettingsStore((state) => state.loadLogGovernance);
  const cleanupLogsByRetention = useSettingsStore((state) => state.cleanupLogsByRetention);

  const retentionDays = Math.max(1, Number(config?.log_retention_days) || 7);

  const handleCleanup = async () => {
    await cleanupLogsByRetention();
    setCleanupDialogOpen(false);
  };

  if (isLoadingConfig) {
    return (
      <SettingsCard icon={ScrollText} title={"\u65e5\u5fd7\u6cbb\u7406"} tone="amber">
        <div className="flex items-center justify-center py-10">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        </div>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      icon={ScrollText}
      title={"\u65e5\u5fd7\u6cbb\u7406"}
      tone="amber"
      action={<SaveLogConfigButton isSaving={isSavingConfig} onSave={() => void saveConfigSection(["log_retention_days", "log_levels"])} />}
    >
      <div className="flex flex-col gap-5">
        <LogRetentionSection
          retentionDays={String(config?.log_retention_days || "")}
          isLoading={isLoadingLogGovernance}
          onRetentionDaysChange={setLogRetentionDays}
          onRefresh={() => void loadLogGovernance()}
        />
        <LogLevelSection selectedLevels={config?.log_levels} onLevelChange={setLogLevel} />
        <LogStatsSection
          governance={logGovernance}
          lastCleanup={lastLogCleanup}
          isLoading={isLoadingLogGovernance}
          isCleaning={isCleaningLogs}
          onOpenCleanup={() => setCleanupDialogOpen(true)}
        />
      </div>
      <LogCleanupDialog
        open={cleanupDialogOpen}
        retentionDays={retentionDays}
        isCleaning={isCleaningLogs}
        onOpenChange={setCleanupDialogOpen}
        onConfirm={() => void handleCleanup()}
      />
    </SettingsCard>
  );
}

function SaveLogConfigButton({ isSaving, onSave }: { isSaving: boolean; onSave: () => void }) {
  return (
    <Button size="lg" onClick={onSave} disabled={isSaving}>
      {isSaving ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
      {"\u4fdd\u5b58"}
    </Button>
  );
}
