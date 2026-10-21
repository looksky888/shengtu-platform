import { LoaderCircle, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { LogGovernanceSummary, LogCleanupResult } from "@/lib/api";

import { SettingsNotice, settingsInputClassName } from "./settings-ui";
import { formatLogTime, LOG_LEVEL_OPTIONS } from "./log-governance-utils";

export function LogRetentionSection({
  retentionDays,
  isLoading,
  onRetentionDaysChange,
  onRefresh,
}: {
  retentionDays: string;
  isLoading: boolean;
  onRetentionDaysChange: (value: string) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="truncate text-sm leading-6 font-semibold text-foreground">保留规则</h3>
        <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={onRefresh} disabled={isLoading}>
          {isLoading ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <RefreshCw data-icon="inline-start" />}
          {"刷新统计"}
        </Button>
      </div>
      <Field className="gap-1.5">
        <FieldLabel htmlFor="settings-log-retention-days">日志保留天数</FieldLabel>
        <Input
          id="settings-log-retention-days"
          type="number"
          min={1}
          max={3650}
          value={retentionDays}
          onChange={(event) => onRetentionDaysChange(event.target.value)}
          placeholder="7"
          className={settingsInputClassName}
        />
        <FieldDescription>清理时会保留最近 N 天日志，删除更早历史日志。</FieldDescription>
      </Field>
    </section>
  );
}

export function LogLevelSection({
  selectedLevels,
  onLevelChange,
}: {
  selectedLevels: string[] | undefined;
  onLevelChange: (level: string, checked: boolean) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="truncate text-sm leading-6 font-semibold text-foreground">控制台日志级别</h3>
      <div className="grid grid-cols-2 gap-2">
        {LOG_LEVEL_OPTIONS.map((level) => (
          <LogLevelOption
            key={level}
            checked={Boolean(selectedLevels?.includes(level))}
            onCheckedChange={(checked) => onLevelChange(level, checked)}
            label={level.charAt(0).toUpperCase() + level.slice(1)}
          />
        ))}
      </div>
      <SettingsNotice>未选时默认记录 info、warning 和 error；开启 debug 会增加日志量。</SettingsNotice>
    </section>
  );
}

export function LogStatsSection({
  governance,
  lastCleanup,
  isLoading,
  isCleaning,
  onOpenCleanup,
}: {
  governance: LogGovernanceSummary | null;
  lastCleanup: LogCleanupResult | null;
  isLoading: boolean;
  isCleaning: boolean;
  onOpenCleanup: () => void;
}) {
  const total = governance?.total ?? 0;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="truncate text-sm leading-6 font-semibold text-foreground">数据概览</h3>
        <Button type="button" variant="destructive" size="sm" className="w-full sm:w-auto" onClick={onOpenCleanup} disabled={isCleaning || total === 0}>
          {isCleaning ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Trash2 data-icon="inline-start" />}
          {"清理过期日志"}
        </Button>
      </div>
      {isLoading ? <LogStatsLoading /> : <LogStatsGrid governance={governance} />}
      {lastCleanup ? (
        <SettingsNotice>
          {"上次清理删除"} {lastCleanup.deleted} {"条，截止"} {lastCleanup.cutoff_date} {"之前的日志。"}
        </SettingsNotice>
      ) : null}
    </section>
  );
}

function LogLevelOption({ checked, label, onCheckedChange }: { checked: boolean; label: string; onCheckedChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-10 min-w-0 items-center gap-2.5 rounded-[12px] border border-border/70 bg-background/75 px-3 py-2 text-sm font-medium text-foreground">
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(Boolean(value))} />
      <span className="min-w-0 leading-5">{label}</span>
    </label>
  );
}

function LogStatsLoading() {
  return (
    <div className="flex items-center justify-center rounded-[16px] border border-border/80 bg-background py-8">
      <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function LogStatsGrid({ governance }: { governance: LogGovernanceSummary | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatBlock label={"日志总数"} value={String(governance?.total ?? 0)} />
      <StatBlock label={"最早日志"} value={formatLogTime(governance?.oldest_time)} />
      <StatBlock label={"最新日志"} value={formatLogTime(governance?.latest_time)} />
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-20 flex-col justify-between rounded-[16px] border border-border/80 bg-background px-4 py-3 shadow-[0_4px_6px_rgba(0,0,0,0.04)]">
      <span className="text-xs leading-5 font-medium text-muted-foreground">{label}</span>
      <span className="truncate text-lg leading-7 font-semibold text-foreground">{value}</span>
    </div>
  );
}
