import { AlertTriangle, Cloud } from "lucide-react";

type StorageEntitlement = {
  storage_bytes: number;
  used_bytes: number;
  expires_at?: string;
};

export function StorageEntitlementPanel({ entitlement }: { entitlement: StorageEntitlement }) {
  const total = Math.max(0, entitlement.storage_bytes);
  const used = Math.max(0, entitlement.used_bytes);
  const percent = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const daysLeft = remainingDays(entitlement.expires_at);
  const urgent = percent >= 100 || (daysLeft !== null && daysLeft <= 3);
  const warning = !urgent && (percent >= 80 || (daysLeft !== null && daysLeft <= 7));
  const tone = urgent
    ? "border-status-danger/30 bg-status-danger-soft text-status-danger"
    : warning
      ? "border-status-warning/30 bg-status-warning-soft text-status-warning"
      : "border-status-info/25 bg-status-info-soft text-status-info";
  const bar = urgent ? "bg-status-danger" : warning ? "bg-status-warning" : "bg-status-info";

  return (
    <section className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium">
          <Cloud className="size-4" />云存储
        </div>
        <strong className="tabular-nums">{percent.toFixed(percent >= 10 ? 0 : 1)}%</strong>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/70">
        <div className={`h-full rounded-full transition-[width] ${bar}`} style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-foreground/70">
        <span>已使用 {formatStorage(used)} / {formatStorage(total)}</span>
        <span>{expiryText(entitlement.expires_at, daysLeft)}</span>
      </div>
      {urgent || warning ? (
        <div className="mt-3 flex items-center gap-2 text-xs font-medium">
          <AlertTriangle className="size-3.5" />
          {urgent ? "容量或有效期即将用尽，请及时续费" : "云存储即将达到提醒阈值"}
        </div>
      ) : null}
    </section>
  );
}

function remainingDays(value?: string) {
  if (!value) return null;
  const expiresAt = Date.parse(value);
  if (!Number.isFinite(expiresAt)) return null;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 86_400_000));
}

function expiryText(value: string | undefined, daysLeft: number | null) {
  if (!value) return "未记录到期时间";
  if (daysLeft === null) return "到期时间格式异常";
  if (daysLeft === 0) return "今天到期";
  return `${daysLeft} 天后到期`;
}

function formatStorage(bytes: number) {
  const gb = bytes / 1024 ** 3;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}
