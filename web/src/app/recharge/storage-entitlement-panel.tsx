import { AlertTriangle, Cloud } from "lucide-react";

import { formatStorageQuota as formatStorage } from "@/lib/format";

type StorageEntitlement = {
  storage_bytes: number;
  used_bytes: number;
  unlimited?: boolean;
  tier?: string;
  asset_count?: number;
  expires_at?: string;
  grace_expires_at?: string;
};

export function StorageEntitlementPanel({ entitlement }: { entitlement: StorageEntitlement }) {
  const isUnlimited = Boolean(entitlement.unlimited) || entitlement.storage_bytes === 0;
  const total = Math.max(0, entitlement.storage_bytes);
  const used = Math.max(0, entitlement.used_bytes);
  const percent = !isUnlimited && total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const inGrace = entitlement.tier === "grace";
  const daysLeft = remainingDays(inGrace && entitlement.grace_expires_at ? entitlement.grace_expires_at : entitlement.expires_at);
  const urgent = inGrace || (!isUnlimited && percent >= 100) || (daysLeft !== null && daysLeft <= 3);
  const warning = !urgent && ((!isUnlimited && percent >= 80) || (daysLeft !== null && daysLeft <= 7));
  const tone = urgent
    ? "border-status-danger/30 bg-status-danger-soft text-status-danger"
    : warning
      ? "border-status-warning/30 bg-status-warning-soft text-status-warning"
      : "border-border/70 bg-card text-foreground shadow-2xs";
  const bar = urgent ? "bg-status-danger" : warning ? "bg-status-warning" : "bg-foreground";

  return (
    <section className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium">
          <Cloud className="size-4 text-muted-foreground" />云存储
        </div>
        <strong className="tabular-nums">
          {isUnlimited ? "不限张数畅存" : `${percent.toFixed(percent >= 10 ? 0 : 1)}%`}
        </strong>
      </div>
      {!isUnlimited ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
          <div className={`h-full rounded-full transition-[width] ${bar}`} style={{ width: `${percent}%` }} />
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground tabular-nums">
        <span>
          {isUnlimited
            ? `有效期内不限张数畅存${typeof entitlement.asset_count === "number" ? ` · 当前 ${entitlement.asset_count} 张` : ""}（${formatStorage(used)}）`
            : `已使用 ${formatStorage(used)} / ${formatStorage(total)}`}
        </span>
        <span>
          {inGrace
            ? `宽限期剩余 ${daysLeft ?? 0} 天`
            : expiryText(entitlement.expires_at, daysLeft)}
        </span>
      </div>
      {urgent || warning ? (
        <div className="mt-3 flex items-center gap-2 text-xs font-medium">
          <AlertTriangle className="size-3.5" />
          {inGrace
            ? "云存储已进入宽限缓冲期，续费后继续畅存全部图片"
            : urgent
              ? "云存储有效期即将到期，请及时续费"
              : "云存储即将达到提醒阈值"}
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
