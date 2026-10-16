import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import type { LoginChannelState } from "@/lib/icloud-api";

export function LoginStateChip({
  label,
  state,
  status,
}: {
  label: string;
  /** Canonical channel state: absent | saved | ok | error | expired */
  state: LoginChannelState;
  /** Optional backend status text for tooltip. */
  status?: string;
}) {
  const title = status?.trim() || undefined;
  switch (state) {
    case "absent":
      return (
        <Badge variant="secondary" title={title} className="border-border/60 bg-muted/50 font-normal text-muted-foreground">
          {label}·未登录
        </Badge>
      );
    case "saved":
      return (
        <Badge
          variant="secondary"
          title={title || "已保存登录态，尚未完成可用性检测"}
          className="border-status-info/30 bg-status-info-soft font-medium text-status-info"
        >
          {label}·已保存
        </Badge>
      );
    case "error":
      return (
        <Badge variant="warning" title={title || "登录态检测异常，可点「检测状态」重试"} className="font-medium">
          {label}·异常
        </Badge>
      );
    case "expired":
      return (
        <Badge variant="danger" title={title || "登录态已过期，请重新登录"} className="font-medium">
          {label}·已过期
        </Badge>
      );
    case "ok":
    default:
      return (
        <Badge variant="success" title={title || "登录态正常"} className="font-medium">
          {label}·正常
        </Badge>
      );
  }
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: "default" | "ok" | "warn" | "bad";
}) {
  const valueClass =
    tone === "ok"
      ? "text-status-success"
      : tone === "warn"
        ? "text-status-warning"
        : tone === "bad"
          ? "text-status-danger"
          : "text-foreground";
  const accentClass =
    tone === "ok" ? "bg-status-success" : tone === "warn" ? "bg-status-warning" : tone === "bad" ? "bg-status-danger" : "bg-muted-foreground/40";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card px-4 py-4 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${accentClass}`} aria-hidden="true" />
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${valueClass}`}>{value}</div>
      {detail ? <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  action,
  children,
  tone = "default",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <section
      className={`space-y-3 rounded-2xl border p-5 shadow-sm ${
        tone === "accent"
          ? "border-status-info/30 bg-gradient-to-br from-status-info-soft via-card to-card"
          : "border-border/80 bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SectionLoadError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="rounded-xl border border-status-warning/30 bg-status-warning-soft px-3 py-2 text-sm text-status-warning">
      {message}
    </p>
  );
}
