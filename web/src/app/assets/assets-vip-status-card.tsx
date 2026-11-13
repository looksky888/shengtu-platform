import { ArrowUpRight, Cloud } from "lucide-react";
import { Link } from "react-router-dom";

import { preloadRoute } from "@/app/route-prefetch";
import type { StorageEntitlement } from "@/lib/user-payment-api";

function formatRemainingDays(value?: string): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const days = Math.max(0, Math.ceil((parsed - Date.now()) / 86_400_000));
  if (days === 0) return "今日到期";
  return `剩余 ${days} 天`;
}

export function AssetsVipStatusCard({
  cloudStorageEnabled,
  entitlement,
  freeRetentionDays,
  vipGraceDays,
  canOpenWallet = true,
}: {
  cloudStorageEnabled: boolean;
  entitlement: StorageEntitlement | null;
  freeRetentionDays: number;
  vipGraceDays: number;
  canOpenWallet?: boolean;
}) {
  if (!cloudStorageEnabled) {
    return null;
  }

  const tier = entitlement?.tier || "free";

  if (tier === "active") {
    const expiryLabel = formatRemainingDays(entitlement?.expires_at);
    return (
      <div className="rounded-xl border border-border/60 bg-surface p-3.5 dark:border-white/[0.08] dark:bg-[#17181c]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <span className="size-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.65)]" />
            <span>云存储 VIP 生效中</span>
          </div>
          {expiryLabel ? (
            <span className="font-mono text-[10.5px] font-medium text-emerald-600 tabular-nums dark:text-emerald-300">
              {expiryLabel}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-[11px] leading-4.5 text-muted-foreground">
          有效期内不限张数畅存
          {entitlement?.asset_count
            ? ` · 已保护 ${entitlement.asset_count} 张`
            : ""}
        </p>
        {canOpenWallet ? (
          <Link
            to="/wallet?tab=storage"
            onMouseEnter={() => preloadRoute("/wallet")}
            className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-foreground transition-opacity hover:opacity-80"
          >
            <span>续费顺延</span>
            <ArrowUpRight className="size-3" />
          </Link>
        ) : null}
      </div>
    );
  }

  if (tier === "grace") {
    return (
      <div className="rounded-xl border border-amber-500/35 bg-surface p-3.5 dark:border-amber-400/30 dark:bg-[#17181c]">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
          <span>VIP 到期 · {vipGraceDays} 天缓冲期</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-4.5 text-muted-foreground">
          宽限期后超期图片将按新规清理，续费立即恢复畅存
        </p>
        {canOpenWallet ? (
          <Link
            to="/wallet?tab=storage"
            onMouseEnter={() => preloadRoute("/wallet")}
            className="mt-2.5 inline-flex h-7.5 w-full items-center justify-center gap-1 rounded-lg bg-amber-500 px-3 text-[11px] font-semibold text-zinc-950 transition-opacity hover:opacity-90"
          >
            <span>立即续费</span>
            <ArrowUpRight className="size-3" />
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-3.5 dark:border-white/[0.08] dark:bg-[#17181c]">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Cloud className="size-3.5 text-muted-foreground" />
        <span>免费云端保留 {freeRetentionDays} 天</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-4.5 text-muted-foreground">
        超期自动清理云端副本 · ¥9.9 / 30天不限张数畅存
      </p>
      {canOpenWallet ? (
        <Link
          to="/wallet?tab=storage"
          onMouseEnter={() => preloadRoute("/wallet")}
          className="mt-2.5 inline-flex h-7.5 w-full items-center justify-center gap-1 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <span>开通云存储 VIP</span>
          <ArrowUpRight className="size-3" />
        </Link>
      ) : null}
    </div>
  );
}

export function AssetsVipStatusMobilePill({
  cloudStorageEnabled,
  entitlement,
  freeRetentionDays,
  vipGraceDays,
  canOpenWallet = true,
}: {
  cloudStorageEnabled: boolean;
  entitlement: StorageEntitlement | null;
  freeRetentionDays: number;
  vipGraceDays: number;
  canOpenWallet?: boolean;
}) {
  if (!cloudStorageEnabled) {
    return null;
  }

  const tier = entitlement?.tier || "free";

  if (tier === "active") {
    const expiryLabel = formatRemainingDays(entitlement?.expires_at);
    const content = (
      <>
        <span className="size-1.5 rounded-full bg-emerald-400" />
        <span>VIP 畅存{expiryLabel ? ` · ${expiryLabel}` : ""}</span>
      </>
    );
    const pillClass =
      "inline-flex h-7.5 shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300";
    if (!canOpenWallet) {
      return <span className={pillClass}>{content}</span>;
    }
    return (
      <Link
        to="/wallet?tab=storage"
        onMouseEnter={() => preloadRoute("/wallet")}
        className={pillClass}
      >
        {content}
      </Link>
    );
  }

  if (tier === "grace") {
    const pillClass =
      "inline-flex h-7.5 shrink-0 items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/12 px-2.5 text-[11px] font-semibold text-amber-800 dark:border-amber-400/35 dark:bg-amber-400/12 dark:text-amber-300";
    if (!canOpenWallet) {
      return (
        <span className={pillClass}>
          <span className="size-1.5 animate-pulse rounded-full bg-amber-400" />
          <span>VIP 缓冲 {vipGraceDays}天</span>
        </span>
      );
    }
    return (
      <Link
        to="/wallet?tab=storage"
        onMouseEnter={() => preloadRoute("/wallet")}
        className={pillClass}
      >
        <span className="size-1.5 animate-pulse rounded-full bg-amber-400" />
        <span>VIP 缓冲 {vipGraceDays}天 · 续费</span>
        <ArrowUpRight className="size-3" />
      </Link>
    );
  }

  const freeClass =
    "inline-flex h-7.5 shrink-0 items-center gap-1 rounded-full border border-border/80 bg-surface px-2.5 text-[11px] font-medium text-foreground shadow-2xs dark:border-white/[0.1] dark:bg-[#17181c]";
  if (!canOpenWallet) {
    return (
      <span className={freeClass}>
        <Cloud className="size-3 text-muted-foreground" />
        <span>保留 {freeRetentionDays}天</span>
      </span>
    );
  }

  return (
    <Link
      to="/wallet?tab=storage"
      onMouseEnter={() => preloadRoute("/wallet")}
      className={freeClass}
    >
      <Cloud className="size-3 text-muted-foreground" />
      <span>保留 {freeRetentionDays}天 · 开通VIP</span>
      <ArrowUpRight className="size-3 text-muted-foreground" />
    </Link>
  );
}
