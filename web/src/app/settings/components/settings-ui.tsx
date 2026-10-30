"use client";

import * as React from "react";
import type { ReactNode } from "react";
import { Eye, EyeOff, HelpCircle, RotateCcw, Save, X, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type SettingsCardTone =
  | "blue"
  | "amber"
  | "slate"
  | "violet"
  | "warning"
  | "danger";

const toneClassNames: Record<SettingsCardTone, string> = {
  amber: "bg-surface-muted text-foreground ring-1 ring-border/70",
  blue: "bg-surface-muted text-foreground ring-1 ring-border/70",
  slate: "bg-surface-muted text-muted-foreground ring-1 ring-border/70",
  violet: "bg-surface-muted text-foreground ring-1 ring-border/70",
  warning:
    "bg-status-warning-soft text-status-warning ring-1 ring-status-warning/25",
  danger:
    "bg-status-danger-soft text-status-danger ring-1 ring-status-danger/25",
};

export type SettingsCardProps = {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  description?: string;
  footer?: ReactNode;
  icon: LucideIcon;
  meta?: ReactNode;
  title: string;
  tone?: SettingsCardTone;
};

export const settingsInputClassName =
  "bg-surface border-border/85 focus-visible:bg-surface disabled:bg-surface-muted/70";
export const settingsDialogInputClassName =
  "bg-surface border-border/85 focus-visible:bg-surface disabled:bg-surface-muted/70";
export const settingsInlineCodeClassName =
  "min-w-0 break-all rounded-md bg-surface-muted px-2.5 py-1.5 font-mono text-xs leading-5 text-muted-foreground ring-1 ring-border/60";
export const settingsListItemClassName =
  "rounded-xl border border-border/75 bg-surface-subtle/50 p-4 transition-colors";
export const settingsPanelClassName =
  "rounded-xl border border-border/70 bg-surface-subtle/45 p-4";
export const settingsToggleClassName =
  "flex min-h-10 items-center gap-3 rounded-xl border border-border/75 bg-surface-subtle/45 px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover/60";
export const settingsInlineToggleClassName =
  "flex min-h-9 items-center gap-3 rounded-xl border border-border/75 bg-surface-subtle/45 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover/60";

export function SettingsCard({
  action,
  children,
  className,
  contentClassName,
  description,
  footer,
  icon: Icon,
  meta,
  title,
  tone = "blue",
}: SettingsCardProps) {
  return (
    <Card
      className={cn(
        "flex flex-col overflow-hidden rounded-[14px] border border-border/80 bg-surface p-5 shadow-2xs",
        className
      )}
    >
      <CardHeader className="gap-3.5 border-b border-border/60 bg-transparent p-0 pb-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              toneClassNames[tone]
            )}
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <CardTitle className="text-sm leading-5 font-semibold tracking-tight text-foreground sm:text-[15px]">
              {title}
            </CardTitle>
            {description ? (
              <p className="text-xs leading-5 text-muted-foreground">
                {description}
              </p>
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
      <CardContent className={cn("flex-1 p-0 pt-4", contentClassName)}>
        {children}
      </CardContent>
      {footer ? (
        <div className="-mx-5 -mb-5 mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/65 bg-surface-subtle/55 px-5 py-3">
          {footer}
        </div>
      ) : null}
    </Card>
  );
}

export type SettingsCardSaveFooterProps = {
  hint?: ReactNode;
  dirty?: boolean;
  saving?: boolean;
  saveLabel?: string;
  resetLabel?: string;
  disabled?: boolean;
  onReset?: () => void;
  onSave: () => void;
  extraActions?: ReactNode;
};

export function SettingsCardSaveFooter({
  hint,
  dirty = true,
  saving = false,
  saveLabel = "保存更改",
  resetLabel = "重置",
  disabled = false,
  onReset,
  onSave,
  extraActions,
}: SettingsCardSaveFooterProps) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        {dirty ? (
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-status-warning"
          />
        ) : null}
        <span className="leading-5">
          {hint ?? (dirty ? "当前卡片存在未保存更改" : "所有更改已与服务端同步")}
        </span>
      </div>
      <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
        {extraActions}
        {onReset && dirty ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving || disabled}
            onClick={onReset}
            className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            <span>{resetLabel}</span>
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          loading={saving}
          disabled={disabled || !dirty}
          onClick={onSave}
          className="h-8 gap-1.5 rounded-lg px-3.5 text-xs"
        >
          <Save className="size-3.5" />
          <span>{saveLabel}</span>
        </Button>
      </div>
    </>
  );
}

/** De-nested architectural section with hairline divider instead of box-in-box borders. */
export function SettingsSection({
  title,
  description,
  badge,
  hint,
  action,
  layout = "stack",
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  hint?: string;
  action?: ReactNode;
  layout?: "stack" | "split";
  children: ReactNode;
  className?: string;
}) {
  if (layout === "split") {
    return (
      <div
        className={cn(
          "grid gap-4 border-t border-border/60 pt-4 first:border-t-0 first:pt-0 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-6",
          className
        )}
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            {badge}
            {hint ? <SettingsHelp content={hint} /> : null}
          </div>
          {description ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
          {action ? <div className="pt-1">{action}</div> : null}
        </div>
        <div className="min-w-0 space-y-3">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "space-y-3 border-t border-border/60 pt-4 first:border-t-0 first:pt-0",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            {badge}
            {hint ? <SettingsHelp content={hint} /> : null}
          </div>
          {description ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Standard binary policy switch row replacing raw square checkboxes. */
export function SettingsSwitchRow({
  id,
  title,
  description,
  badge,
  checked,
  disabled = false,
  size = "default",
  onCheckedChange,
  className,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  size?: "sm" | "default";
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  const generatedId = React.useId();
  const switchId = id ?? `settings-switch-${generatedId}`;

  return (
    <div
      onClick={() => {
        if (!disabled) onCheckedChange(!checked);
      }}
      className={cn(
        "flex items-center justify-between gap-3.5 rounded-xl border border-border/75 bg-surface-subtle/45 px-3.5 py-2.5 transition-colors",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:border-border-strong/75 hover:bg-surface-hover/55",
        className
      )}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={switchId}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "text-sm font-medium text-foreground",
              !disabled && "cursor-pointer"
            )}
          >
            {title}
          </label>
          {badge}
        </div>
        {description ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <Switch
        id={switchId}
        size={size}
        checked={checked}
        disabled={disabled}
        onClick={(event) => event.stopPropagation()}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

/** Numeric or text field with right-aligned unit suffix and inline range/error hint. */
export function SettingsUnitInput({
  id,
  label,
  unit,
  value,
  onChange,
  placeholder,
  min,
  max,
  step = 1,
  rangeHint,
  description,
  badge,
  error,
  disabled = false,
  inputMode = "numeric",
  type = "number",
  className,
}: {
  id?: string;
  label: ReactNode;
  unit?: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  rangeHint?: string;
  description?: ReactNode;
  badge?: ReactNode;
  error?: string;
  disabled?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  type?: "number" | "text";
  className?: string;
}) {
  const generatedId = React.useId();
  const inputId = id ?? `settings-unit-${generatedId}`;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-foreground sm:text-[13px]"
          >
            {label}
          </label>
          {badge}
        </div>
        {rangeHint ? (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {rangeHint}
          </span>
        ) : null}
      </div>
      <div className="relative flex items-center">
        <Input
          id={inputId}
          type={type}
          inputMode={inputMode}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            settingsInputClassName,
            "tabular-nums",
            unit && "pr-14"
          )}
        />
        {unit ? (
          <span className="pointer-events-none absolute right-2.5 rounded bg-surface-muted/85 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="text-xs leading-4 text-status-danger">{error}</p>
      ) : description ? (
        <p className="text-[11px] leading-4.5 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** Secret / API Key input with show/hide eye toggle, configured status pill, and optional copy/clear. */
export function SettingsSecretInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  configured = false,
  configuredLabel = "已加密保存",
  maskedHint,
  description,
  allowCopy = false,
  onClear,
  disabled = false,
  className,
}: {
  id?: string;
  label?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  configured?: boolean;
  configuredLabel?: string;
  maskedHint?: string;
  description?: ReactNode;
  allowCopy?: boolean;
  onClear?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const generatedId = React.useId();
  const inputId = id ?? `settings-secret-${generatedId}`;
  const [visible, setVisible] = React.useState(false);

  const resolvedPlaceholder =
    placeholder ??
    (configured
      ? maskedHint
        ? `当前 ${maskedHint} · 留空保持不变`
        : "已加密保存，留空表示不修改"
      : "输入密钥或凭据");

  return (
    <div className={cn("space-y-1.5", className)}>
      {label || configured ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {label ? (
            <label
              htmlFor={inputId}
              className="text-xs font-medium text-foreground sm:text-[13px]"
            >
              {label}
            </label>
          ) : (
            <span />
          )}
          {configured ? (
            <Badge
              variant="outline"
              className="h-5 gap-1.5 rounded-md border-status-success/25 bg-status-success-soft px-1.5 text-[10px] font-medium text-status-success"
            >
              <span className="size-1.5 rounded-full bg-status-success" />
              {configuredLabel}
            </Badge>
          ) : null}
        </div>
      ) : null}
      <div className="relative flex items-center">
        <Input
          id={inputId}
          type={visible ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={disabled}
          placeholder={resolvedPlaceholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            settingsInputClassName,
            "font-mono text-xs sm:text-[13px]",
            allowCopy && value ? "pr-20" : "pr-11"
          )}
        />
        <div className="absolute right-1.5 flex items-center gap-0.5">
          {value && onClear ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled}
              aria-label="清空输入"
              title="清空输入"
              onClick={onClear}
              className="size-7 rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
          {allowCopy && value ? (
            <CopyButton
              value={value}
              toastMessage="已复制到剪贴板"
              className="size-7 rounded-md text-muted-foreground hover:text-foreground"
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={disabled}
            aria-label={visible ? "隐藏密钥内容" : "显示密钥内容"}
            title={visible ? "隐藏密钥" : "显示密钥"}
            onClick={() => setVisible((prev) => !prev)}
            className="size-7 rounded-md text-muted-foreground hover:text-foreground"
          >
            {visible ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
          </Button>
        </div>
      </div>
      {description ? (
        <p className="text-[11px] leading-4.5 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
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
          className="size-6.5 rounded-lg text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs leading-5 text-muted-foreground">
        {content}
      </PopoverContent>
    </Popover>
  );
}

export type SettingsNoticeTone = "default" | "success" | "warning" | "danger";

const noticeToneClassNames: Record<SettingsNoticeTone, string> = {
  default: "border-border/75 bg-surface-subtle/55 text-muted-foreground",
  success: "border-status-success/25 bg-status-success-soft text-status-success",
  warning: "border-status-warning/25 bg-status-warning-soft text-status-warning",
  danger: "border-status-danger/25 bg-status-danger-soft text-status-danger",
};

export function SettingsNotice({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: SettingsNoticeTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-xs leading-5 sm:text-[13px]",
        noticeToneClassNames[tone],
        className
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
  action,
}: {
  description: string;
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
}) {
  return (
    <EmptyState
      icon={Icon}
      title={title}
      description={description}
      action={action}
      className="rounded-xl border border-dashed border-border/70 bg-surface-subtle/40 py-10"
    />
  );
}


/**
 * Horizontal key-control row inspired by ddcat-ai/open-ai-canvas `SettingsRow`,
 * pairing a left title/description with a right-aligned action or input slot.
 */
export function SettingsRow({
  title,
  description,
  badge,
  hint,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-3 border-t border-border/55 py-3.5 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{title}</span>
          {badge}
          {hint ? <SettingsHelp content={hint} /> : null}
        </div>
        {description ? (
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center sm:justify-end">{children}</div>
    </div>
  );
}
