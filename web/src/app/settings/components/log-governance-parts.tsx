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
        <h3 className="truncate text-sm leading-6 font-semibold text-foreground">{"\u4fdd\u7559\u89c4\u5219"}</h3>
        <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={onRefresh} disabled={isLoading}>
          {isLoading ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <RefreshCw data-icon="inline-start" />}
          {"\u5237\u65b0\u7edf\u8ba1"}
        </Button>
      </div>
      <Field className="gap-1.5">
        <FieldLabel htmlFor="settings-log-retention-days">{"\u65e5\u5fd7\u4fdd\u7559\u5929\u6570"}</FieldLabel>
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
        <FieldDescription>{"\u6e05\u7406\u65f6\u4f1a\u4fdd\u7559\u6700\u8fd1 N \u5929\u65e5\u5fd7\uff0c\u5220\u9664\u66f4\u65e9\u5386\u53f2\u65e5\u5fd7\u3002"}</FieldDescription>
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
      <h3 className="truncate text-sm leading-6 font-semibold text-foreground">{"\u63a7\u5236\u53f0\u65e5\u5fd7\u7ea7\u522b"}</h3>
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
      <SettingsNotice>{"\u672a\u9009\u65f6\u9ed8\u8ba4\u8bb0\u5f55 info\u3001warning \u548c error\uff1b\u5f00\u542f debug \u4f1a\u589e\u52a0\u65e5\u5fd7\u91cf\u3002"}</SettingsNotice>
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
        <h3 className="truncate text-sm leading-6 font-semibold text-foreground">{"\u6570\u636e\u6982\u89c8"}</h3>
        <Button type="button" variant="destructive" size="sm" className="w-full sm:w-auto" onClick={onOpenCleanup} disabled={isCleaning || total === 0}>
          {isCleaning ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Trash2 data-icon="inline-start" />}
          {"\u6e05\u7406\u8fc7\u671f\u65e5\u5fd7"}
        </Button>
      </div>
      {isLoading ? <LogStatsLoading /> : <LogStatsGrid governance={governance} />}
      {lastCleanup ? (
        <SettingsNotice>
          {"\u4e0a\u6b21\u6e05\u7406\u5220\u9664"} {lastCleanup.deleted} {"\u6761\uff0c\u622a\u6b62"} {lastCleanup.cutoff_date} {"\u4e4b\u524d\u7684\u65e5\u5fd7\u3002"}
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
      <StatBlock label={"\u65e5\u5fd7\u603b\u6570"} value={String(governance?.total ?? 0)} />
      <StatBlock label={"\u6700\u65e9\u65e5\u5fd7"} value={formatLogTime(governance?.oldest_time)} />
      <StatBlock label={"\u6700\u65b0\u65e5\u5fd7"} value={formatLogTime(governance?.latest_time)} />
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
