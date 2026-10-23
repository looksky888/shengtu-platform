import {
  Check,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LogCleanupResult, LogGovernanceSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

import { formatLogTime, LOG_LEVEL_META } from "./log-governance-utils";
import {
  SettingsNotice,
  SettingsSection,
  SettingsUnitInput,
} from "./settings-ui";

export function LogStatsSection({
  governance,
  lastCleanup,
  savedRetentionDays,
  draftRetentionDays,
  isRetentionDirty,
  isLoading,
  isCleaning,
  onRefresh,
  onOpenCleanup,
}: {
  governance: LogGovernanceSummary | null;
  lastCleanup: LogCleanupResult | null;
  savedRetentionDays: number;
  draftRetentionDays: number;
  isRetentionDirty: boolean;
  isLoading: boolean;
  isCleaning: boolean;
  onRefresh: () => void;
  onOpenCleanup: () => void;
}) {
  const total = governance?.total ?? 0;

  return (
    <SettingsSection
      title="日志容量与时间跨度概览"
      description="实时统计数据库内留存的系统日志规模及首尾时间戳"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading || isCleaning}
          >
            {isLoading ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            刷新统计
          </Button>
          <Button
            type="button"
            variant="destructive-outline"
            size="sm"
            loading={isCleaning}
            onClick={onOpenCleanup}
            disabled={total === 0}
          >
            {!isCleaning ? <Trash2 className="size-3.5" /> : null}
            清理过期日志
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {isLoading && !governance ? (
          <div className="flex items-center justify-center rounded-xl border border-border/75 bg-surface-subtle/45 py-10">
            <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiMetricBlock
              label="日志总条数"
              value={total.toLocaleString("zh-CN")}
              subtext="当前数据库留存记录"
            />
            <KpiMetricBlock
              label="最早日志时间"
              value={formatLogTime(governance?.oldest_time)}
              monoTimestamp
              subtext="首条留存日志写入时刻"
            />
            <KpiMetricBlock
              label="最新日志时间"
              value={formatLogTime(governance?.latest_time)}
              monoTimestamp
              subtext="最近一条日志写入时刻"
            />
            <KpiMetricBlock
              label="生效保留策略"
              value={`${savedRetentionDays} 天`}
              badge={
                isRetentionDirty ? (
                  <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
                    草稿 {draftRetentionDays} 天
                  </Badge>
                ) : (
                  <Badge variant="success" className="h-5 px-1.5 text-[10px]">
                    已同步
                  </Badge>
                )
              }
              subtext={
                lastCleanup
                  ? `上次清理删除 ${lastCleanup.deleted} 条`
                  : "按天滚动清理历史记录"
              }
            />
          </div>
        )}

        {lastCleanup ? (
          <SettingsNotice tone="success">
            最近一次手动清理已按{" "}
            <strong className="font-mono font-semibold tabular-nums">
              {lastCleanup.retention_days}
            </strong>{" "}
            天保留期删除{" "}
            <strong className="font-mono font-semibold tabular-nums">
              {lastCleanup.deleted}
            </strong>{" "}
            条历史日志（截止时间：{lastCleanup.cutoff_date}，剩余{" "}
            {lastCleanup.remaining} 条）。
          </SettingsNotice>
        ) : null}
      </div>
    </SettingsSection>
  );
}

export function LogRetentionSection({
  retentionDays,
  onRetentionDaysChange,
}: {
  retentionDays: string;
  onRetentionDaysChange: (value: string) => void;
}) {
  return (
    <SettingsSection
      title="日志保留周期"
      description="控制手动清理与定期维护时保留的历史日志天数上限"
    >
      <div className="max-w-md">
        <SettingsUnitInput
          id="settings-log-retention-days"
          label="日志保留天数"
          unit="天"
          min={1}
          max={3650}
          rangeHint="1 - 3650"
          value={retentionDays}
          placeholder="7"
          description="执行清理时会完整保留最近 N 天内的系统日志，仅移除更早的历史记录。"
          onChange={onRetentionDaysChange}
        />
      </div>
    </SettingsSection>
  );
}

export function LogLevelSection({
  selectedLevels,
  onLevelChange,
  onResetDefaultLevels,
}: {
  selectedLevels: string[] | undefined;
  onLevelChange: (level: string, checked: boolean) => void;
  onResetDefaultLevels: () => void;
}) {
  const normalizedSelected = (selectedLevels ?? []).filter(Boolean);
  const isDefaultPolicy = normalizedSelected.length === 0;

  return (
    <SettingsSection
      title="日志采集级别"
      description="配置后端写入日志表的事件等级；未显式勾选任何项时自动启用标准生产级别"
      badge={
        isDefaultPolicy ? (
          <Badge variant="success">默认策略（Info / Warn / Error）</Badge>
        ) : (
          <Badge variant="outline">
            自定义过滤（已选 {normalizedSelected.length} 项）
          </Badge>
        )
      }
      action={
        !isDefaultPolicy ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onResetDefaultLevels}
            className="gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3" />
            恢复默认策略
          </Button>
        ) : null
      }
    >
      <div className="space-y-3">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {LOG_LEVEL_META.map((item) => {
            const explicitlyChecked = normalizedSelected.includes(item.value);
            const effectiveActive = isDefaultPolicy
              ? item.defaultActive
              : explicitlyChecked;

            return (
              <button
                key={item.value}
                type="button"
                aria-pressed={explicitlyChecked}
                onClick={() => onLevelChange(item.value, !explicitlyChecked)}
                className={cn(
                  "flex flex-col items-start justify-between gap-2 rounded-xl border p-3.5 text-left transition-colors",
                  explicitlyChecked
                    ? "border-foreground/45 bg-surface shadow-2xs ring-1 ring-foreground/15"
                    : effectiveActive
                      ? "border-border/80 bg-surface-subtle/60 hover:border-border-strong/75 hover:bg-surface-hover/55"
                      : "border-border/65 bg-surface-subtle/30 opacity-80 hover:border-border-strong/70 hover:bg-surface-hover/45 hover:opacity-100"
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[4px] border transition-colors",
                        explicitlyChecked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-surface"
                      )}
                    >
                      {explicitlyChecked ? <Check className="size-3" /> : null}
                    </span>
                    <span className="font-mono text-xs font-semibold text-foreground sm:text-[13px]">
                      {item.label}
                    </span>
                  </div>
                  <Badge
                    variant={effectiveActive ? "success" : "secondary"}
                    className="h-5 px-1.5 text-[10px]"
                  >
                    {isDefaultPolicy && effectiveActive
                      ? "默认生效"
                      : effectiveActive
                        ? "已开启"
                        : "未记录"}
                  </Badge>
                </div>
                <p className="text-[11px] leading-4.5 text-muted-foreground">
                  {item.description}
                </p>
              </button>
            );
          })}
        </div>

        <SettingsNotice>
          {isDefaultPolicy
            ? "当前采用默认生产策略：自动记录 Info、Warn 与 Error 级别日志，不采集高频 Debug 诊断信息以节省存储空间。点击任意卡片可切换为自定义过滤。"
            : "当前采用自定义过滤模式：仅记录上方勾选为「已开启」的级别。开启 Debug 会显著增加日志写入量；点击「恢复默认策略」可回到标准模式。"}
        </SettingsNotice>
      </div>
    </SettingsSection>
  );
}

function KpiMetricBlock({
  label,
  value,
  subtext,
  badge,
  monoTimestamp = false,
}: {
  label: string;
  value: string;
  subtext?: string;
  badge?: React.ReactNode;
  monoTimestamp?: boolean;
}) {
  return (
    <div className="flex min-h-22 flex-col justify-between gap-2 rounded-xl border border-border/75 bg-surface-subtle/45 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {badge}
      </div>
      <div
        className={cn(
          "tabular-nums text-foreground",
          monoTimestamp
            ? "font-mono text-xs font-semibold leading-5 break-keep sm:text-[13px]"
            : "font-mono text-base font-semibold leading-6 sm:text-lg"
        )}
      >
        {value}
      </div>
      {subtext ? (
        <div className="text-[11px] leading-4 text-muted-foreground">
          {subtext}
        </div>
      ) : null}
    </div>
  );
}
