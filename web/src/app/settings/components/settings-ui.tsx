"use client";

import type { ReactNode } from "react";
import { HelpCircle, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SettingsCardTone = "blue" | "amber" | "slate" | "violet";

const toneClassNames: Record<SettingsCardTone, string> = {
  amber: "bg-status-warning-soft text-status-warning ring-1 ring-status-warning/20",
  blue: "bg-surface-muted text-foreground ring-1 ring-border/60",
  slate: "bg-surface-muted text-muted-foreground ring-1 ring-border/60",
  violet: "bg-surface-muted text-foreground ring-1 ring-border/60",
};

type SettingsCardProps = {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  description?: string;
  icon: LucideIcon;
  meta?: ReactNode;
  title: string;
  tone?: SettingsCardTone;
};

export const settingsInputClassName = "bg-background";
export const settingsDialogInputClassName = "bg-background";
export const settingsInlineCodeClassName =
  "min-w-0 break-all rounded-md bg-surface-muted px-2.5 py-1.5 font-mono text-xs leading-5 text-muted-foreground ring-1 ring-border/60";
export const settingsListItemClassName =
  "rounded-xl border border-border/75 bg-surface-muted/30 p-4";
export const settingsPanelClassName =
  "rounded-xl border border-border/75 bg-surface-muted/30 p-4";
export const settingsToggleClassName =
  "flex min-h-10 items-center gap-3 rounded-xl border border-border/75 bg-surface-muted/30 px-3.5 py-2.5 text-sm font-medium text-foreground";
export const settingsInlineToggleClassName =
  "flex min-h-9 items-center gap-3 rounded-xl border border-border/75 bg-surface-muted/30 px-3 py-2 text-sm font-medium text-foreground";

export function SettingsCard({
  action,
  children,
  className,
  contentClassName,
  description,
  icon: Icon,
  meta,
  title,
  tone = "blue",
}: SettingsCardProps) {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-[14px] border border-border/80 bg-surface p-5 shadow-2xs",
        className,
      )}
    >
      <CardHeader className="gap-3.5 border-b border-border/60 bg-transparent p-0 pb-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              toneClassNames[tone],
            )}
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <CardTitle className="text-sm leading-5 font-semibold tracking-tight text-foreground sm:text-[15px]">
              {title}
            </CardTitle>
            {description ? (
              <p className="text-xs leading-5 text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {meta || action ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {meta}
            {action}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className={cn("p-0 pt-4", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

/** Lightweight section title used inside settings cards for grouped fields. */
export function SettingsSectionLabel({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
      <div className="text-sm font-semibold text-foreground">{children}</div>
      {hint ? <SettingsHelp content={hint} /> : null}
    </div>
  );
}

export function SettingsHelp({ content }: { content: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="查看设置说明"
          className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs leading-5 text-muted-foreground">
        {content}
      </PopoverContent>
    </Popover>
  );
}

export function SettingsNotice({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/75 bg-surface-muted/35 px-4 py-3 text-xs leading-5 text-muted-foreground sm:text-[13px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingsEmptyState({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <EmptyState
      icon={Icon}
      title={title}
      description={description}
      className="rounded-xl border border-dashed border-border/70 bg-surface-muted/30 py-10"
    />
  );
}
