"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LiveConnectionState =
  | "live"
  | "polling"
  | "reconnecting"
  | "offline"
  | "idle";

export interface LiveStatusBadgeProps {
  state: LiveConnectionState;
  label?: string;
  lastUpdatedAt?: string | number | Date | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  className?: string;
}

const STATE_CONFIG: Record<
  LiveConnectionState,
  { defaultLabel: string; dotClass: string; pulseClass?: string; badgeClass: string }
> = {
  live: {
    defaultLabel: "实时连接",
    dotClass: "bg-emerald-500",
    pulseClass: "bg-emerald-400 animate-ping",
    badgeClass:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  polling: {
    defaultLabel: "自动同步中",
    dotClass: "bg-foreground",
    pulseClass: "bg-foreground/40 animate-pulse",
    badgeClass:
      "border-border/80 bg-surface-muted text-foreground",
  },
  reconnecting: {
    defaultLabel: "重连中",
    dotClass: "bg-amber-500",
    pulseClass: "bg-amber-400 animate-ping",
    badgeClass:
      "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  offline: {
    defaultLabel: "连接断开",
    dotClass: "bg-rose-500",
    badgeClass:
      "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  idle: {
    defaultLabel: "手动刷新",
    dotClass: "bg-muted-foreground/60",
    badgeClass: "border-border/80 bg-surface-muted text-muted-foreground",
  },
};

function formatTime(value: string | number | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function LiveStatusBadge({
  state,
  label,
  lastUpdatedAt,
  onRefresh,
  refreshing = false,
  className,
}: LiveStatusBadgeProps) {
  const config = STATE_CONFIG[state];
  const formattedTime = formatTime(lastUpdatedAt);

  return (
    <div
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
        config.badgeClass,
        className
      )}
    >
      <span className="relative flex size-2 shrink-0">
        {config.pulseClass ? (
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75",
              config.pulseClass
            )}
          />
        ) : null}
        <span
          className={cn("relative inline-flex size-2 rounded-full", config.dotClass)}
        />
      </span>
      <span>{label ?? config.defaultLabel}</span>
      {formattedTime ? (
        <span className="text-[11px] opacity-75 tabular-nums">
          · {formattedTime}
        </span>
      ) : null}
      {onRefresh ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onRefresh}
          disabled={refreshing}
          title="立即刷新"
          aria-label="立即刷新"
          className="-mr-1 size-5 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
        >
          <RefreshCw
            className={cn("size-3", refreshing && "animate-spin")}
          />
        </Button>
      ) : null}
    </div>
  );
}
