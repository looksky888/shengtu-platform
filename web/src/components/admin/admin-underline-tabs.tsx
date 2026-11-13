"use client";

import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { cn } from "@/lib/utils";

export type AdminUnderlineTabItem<T extends string = string> = {
  value: T;
  label: string;
  badge?: number | string | null;
  icon?: LucideIcon;
};

export function AdminUnderlineTabs<T extends string>({
  items,
  value,
  onValueChange,
  defaultValue,
  queryParam,
  syncQueryParam,
  ariaLabel,
  className,
}: {
  items: readonly AdminUnderlineTabItem<T>[];
  value?: T;
  onValueChange?: (next: T) => void;
  defaultValue?: T;
  /** Optional URL query parameter name (e.g. "tab") for automatic URL sync. */
  queryParam?: string;
  /** Alias for queryParam. */
  syncQueryParam?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramName = queryParam ?? syncQueryParam;
  const fallback = (defaultValue ?? items[0]?.value) as T;

  const queryRaw = paramName ? searchParams.get(paramName) : null;
  const queryMatched = queryRaw
    ? items.find((item) => item.value === queryRaw)?.value
    : undefined;
  const lastSyncedQueryRef = useRef<T | undefined>(undefined);
  const didMountSyncRef = useRef(false);

  useEffect(() => {
    if (!paramName || !onValueChange) return;
    const target = queryMatched ?? fallback;
    if (didMountSyncRef.current && lastSyncedQueryRef.current === target) {
      return;
    }
    didMountSyncRef.current = true;
    lastSyncedQueryRef.current = target;
    if (value !== undefined && target !== undefined && value !== target) {
      onValueChange(target);
    }
  }, [fallback, onValueChange, paramName, queryMatched, value]);

  const resolvedValue: T = (() => {
    if (paramName && queryMatched !== undefined) {
      return queryMatched;
    }
    if (value !== undefined) return value;
    return fallback;
  })();

  const handleSelect = (next: T) => {
    if (paramName) {
      const nextParams = new URLSearchParams(searchParams);
      if (next === fallback) {
        nextParams.delete(paramName);
      } else {
        nextParams.set(paramName, next);
      }
      setSearchParams(nextParams, { replace: true });
    }
    onValueChange?.(next);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("admin-underline-tabs", className)}
    >
      {items.map((item) => {
        const active = item.value === resolvedValue;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => handleSelect(item.value)}
            className={cn("admin-underline-tab", active && "is-active")}
          >
            {Icon ? <Icon className="size-3.5 shrink-0 opacity-80" /> : null}
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge !== null ? (
              <span className="admin-underline-tab-badge">{item.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
