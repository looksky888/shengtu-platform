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
  const dotClass =
    tone === "ok"
      ? "bg-status-success"
      : tone === "warn"
        ? "bg-status-warning"
        : tone === "bad"
          ? "bg-status-danger"
          : "bg-muted-foreground/45";
  const channelMatch =
    typeof value === "string"
      ? value.match(/^新(\d+)\s*\/\s*旧(\d+)\s*\/\s*IMAP(\d+)$/)
      : null;

  return (
    <div className="flex flex-col justify-between rounded-[14px] border border-border/80 bg-surface p-4 shadow-2xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`size-2 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
      </div>
      {channelMatch ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5" aria-label={String(value)}>
          {[
            { name: "新", count: channelMatch[1] },
            { name: "旧", count: channelMatch[2] },
            { name: "IMAP", count: channelMatch[3] },
          ].map((item) => (
            <span
              key={item.name}
              className="inline-flex items-center gap-1 rounded-md border border-border/75 bg-surface-muted/85 px-2 py-0.5 text-xs tabular-nums"
            >
              <span className="text-[11px] font-medium text-muted-foreground">{item.name}</span>
              <span className="font-mono font-semibold text-foreground">{item.count}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${valueClass}`}>
          {value}
        </div>
      )}
      {detail ? <div className="mt-1.5 text-[11px] text-muted-foreground">{detail}</div> : null}
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
      className={`space-y-4 rounded-[14px] border p-5 shadow-2xs ${
        tone === "accent"
          ? "border-border/90 bg-surface-muted/45"
          : "border-border/80 bg-surface"
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-foreground sm:text-[15px]">{title}</h2>
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
