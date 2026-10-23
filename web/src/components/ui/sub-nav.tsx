"use client";

import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface SubNavItem<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

export interface SubNavProps<T extends string = string> {
  items: readonly SubNavItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  variant?: "pill" | "underline";
  size?: "sm" | "default";
  layoutId?: string;
  ariaLabel?: string;
  className?: string;
  fullWidth?: boolean;
}

export function SubNav<T extends string = string>({
  items,
  value,
  onValueChange,
  variant = "pill",
  size = "default",
  layoutId,
  ariaLabel,
  className,
  fullWidth = false,
}: SubNavProps<T>) {
  const generatedId = React.useId();
  const activeIndicatorId = layoutId ?? `subnav-indicator-${generatedId}`;
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const enabledIndices = items
      .map((item, idx) => (item.disabled ? -1 : idx))
      .filter((idx) => idx >= 0);
    if (enabledIndices.length <= 1) {
      return;
    }

    const currentIndex = items.findIndex((item) => item.value === value);
    const currentPos = enabledIndices.indexOf(currentIndex);

    let nextIndex = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const nextPos = currentPos >= 0 ? (currentPos + 1) % enabledIndices.length : 0;
      nextIndex = enabledIndices[nextPos] ?? -1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const prevPos =
        currentPos >= 0
          ? (currentPos - 1 + enabledIndices.length) % enabledIndices.length
          : 0;
      nextIndex = enabledIndices[prevPos] ?? -1;
    } else if (event.key === "Home") {
      event.preventDefault();
      nextIndex = enabledIndices[0] ?? -1;
    } else if (event.key === "End") {
      event.preventDefault();
      nextIndex = enabledIndices[enabledIndices.length - 1] ?? -1;
    }

    if (nextIndex >= 0 && items[nextIndex]) {
      onValueChange(items[nextIndex].value);
      itemRefs.current[nextIndex]?.focus();
    }
  };

  if (variant === "underline") {
    return (
      <div
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex items-center gap-1 overflow-x-auto border-b border-border/70 scrollbar-none",
          className
        )}
      >
        {items.map((item, index) => {
          const active = item.value === value;
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                if (!item.disabled && item.value !== value) {
                  onValueChange(item.value);
                }
              }}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 pb-2.5 pt-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-45",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {Icon ? (
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                />
              ) : null}
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge !== null ? (
                <span
                  className={cn(
                    "inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1.5 text-[11px] font-medium tabular-nums transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
              {active ? (
                <motion.span
                  layoutId={activeIndicatorId}
                  transition={{ type: "spring", stiffness: 460, damping: 36 }}
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-surface-muted/95 p-1 scrollbar-none dark:bg-zinc-900",
        fullWidth && "flex w-full",
        className
      )}
    >
      {items.map((item, index) => {
        const active = item.value === value;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            title={item.title}
            onClick={() => {
              if (!item.disabled && item.value !== value) {
                onValueChange(item.value);
              }
            }}
            className={cn(
              "relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 disabled:pointer-events-none disabled:opacity-45",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              fullWidth && "flex-1",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active ? (
              <motion.span
                layoutId={activeIndicatorId}
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                className="absolute inset-0 rounded-lg bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_1px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.04] dark:bg-zinc-800 dark:ring-white/[0.08]"
              />
            ) : null}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {Icon ? (
                <Icon
                  className={cn(
                    "size-3.5 shrink-0 transition-colors",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                />
              ) : null}
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge !== null ? (
                <span
                  className={cn(
                    "inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-md px-1.5 text-[10px] font-semibold tabular-nums transition-colors",
                    active
                      ? "bg-surface-muted text-foreground"
                      : "bg-background/70 text-muted-foreground"
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
