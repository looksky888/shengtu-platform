"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  getSettingsDomainForTab,
  getSettingsDomainGroup,
  getSettingsTabMeta,
  type SettingsTabKey,
} from "../settings-tab-types";
import { SETTINGS_TAB_ICON_MAP } from "./settings-secondary-nav";

export function SettingsHeader({
  activeTab,
  dirtyModules = [],
  isRefreshing = false,
  onRefresh,
}: {
  activeTab: SettingsTabKey;
  dirtyModules?: string[];
  isRefreshing?: boolean;
  onRefresh?: () => void;
}) {
  const activeTabMeta = getSettingsTabMeta(activeTab);
  const activeDomain = getSettingsDomainGroup(
    getSettingsDomainForTab(activeTab),
  );
  const ActiveIcon = SETTINGS_TAB_ICON_MAP[activeTab];

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-3.5">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-surface text-foreground shadow-2xs">
            <ActiveIcon className="size-3.5" />
          </span>
          <h1 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
            {activeTabMeta.label}
          </h1>
          <Badge
            variant="outline"
            className="border-border/75 bg-surface-subtle text-[11px] font-normal text-muted-foreground"
          >
            {activeDomain.label}
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
          {activeTabMeta.description}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {dirtyModules.length > 0 ? (
          <div
            role="status"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-status-warning/30 bg-status-warning-soft px-2.5 text-xs font-medium text-status-warning"
          >
            <AlertTriangle className="size-3.5 shrink-0" />
            <span className="max-w-48 truncate">
              未保存：{dirtyModules.join("、")}
            </span>
          </div>
        ) : null}

        {onRefresh ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={isRefreshing}
            onClick={onRefresh}
            className="hidden h-8 gap-1.5 rounded-lg px-3 text-xs md:inline-flex"
          >
            <RefreshCw className="size-3.5" />
            <span>刷新当前页</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
