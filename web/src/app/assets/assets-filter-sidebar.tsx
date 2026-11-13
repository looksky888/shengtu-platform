import type {
  AssetsOrientationFilter,
  AssetsScope,
  AssetsTypeTab,
  AssetsVisibilityFilter,
} from "@/app/assets/assets-cloud-policy";
import { AssetsVipStatusCard } from "@/app/assets/assets-vip-status-card";
import type { StorageEntitlement } from "@/lib/user-payment-api";
import { cn } from "@/lib/utils";

type FilterOption<T extends string> = Readonly<{ value: T; label: string }>;

type AssetsFilterSidebarProps = {
  cloudStorageEnabled: boolean;
  entitlement: StorageEntitlement | null;
  freeRetentionDays: number;
  vipGraceDays: number;
  canOpenWallet: boolean;
  activeType: AssetsTypeTab;
  effectiveScope: AssetsScope;
  scopeOptions: readonly FilterOption<AssetsScope>[];
  visibilityFilter: AssetsVisibilityFilter;
  orientationFilter: AssetsOrientationFilter;
  orientationOptions: readonly FilterOption<AssetsOrientationFilter>[];
  onScopeChange: (scope: AssetsScope) => void;
  onVisibilityChange: (visibility: AssetsVisibilityFilter) => void;
  onOrientationChange: (orientation: AssetsOrientationFilter) => void;
};

export function AssetsFilterSidebar({
  cloudStorageEnabled,
  entitlement,
  freeRetentionDays,
  vipGraceDays,
  canOpenWallet,
  activeType,
  effectiveScope,
  scopeOptions,
  visibilityFilter,
  orientationFilter,
  orientationOptions,
  onScopeChange,
  onVisibilityChange,
  onOrientationChange,
}: AssetsFilterSidebarProps) {
  return (
    <aside className="hidden flex-col gap-4 lg:sticky lg:top-4 lg:flex">
      {/* Strictly Gated Cloud Storage VIP Status Card */}
      <AssetsVipStatusCard
        cloudStorageEnabled={cloudStorageEnabled}
        entitlement={entitlement}
        freeRetentionDays={freeRetentionDays}
        vipGraceDays={vipGraceDays}
        canOpenWallet={canOpenWallet}
      />

      {/* Scope Filter */}
      <div className="space-y-1">
        <div className="px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          浏览范围
        </div>
        {scopeOptions.map((opt) => {
          const active = effectiveScope === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={activeType === "expiring" && opt.value !== "mine"}
              onClick={() => onScopeChange(opt.value)}
              className={cn(
                "flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                active
                  ? "bg-foreground/[0.10] font-semibold text-foreground"
                  : "font-medium text-muted-foreground hover:bg-surface hover:text-foreground",
              )}
            >
              <span>{opt.label}</span>
              {active ? (
                <span className="size-1.5 rounded-full bg-foreground" />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Visibility Filter (only for mine or all) */}
      {effectiveScope !== "public" ? (
        <div className="space-y-1">
          <div className="px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            公开状态
          </div>
          {(
            [
              { value: "all" as const, label: "全部" },
              { value: "private" as const, label: "私密" },
              { value: "public" as const, label: "已公开" },
            ] as const
          ).map((opt) => {
            const active = visibilityFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onVisibilityChange(opt.value)}
                className={cn(
                  "flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-xs transition-colors",
                  active
                    ? "bg-foreground/[0.10] font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:bg-surface hover:text-foreground",
                )}
              >
                <span>{opt.label}</span>
                {active ? (
                  <span className="size-1.5 rounded-full bg-foreground" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Aspect Ratio Filter */}
      <div className="space-y-1">
        <div className="px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          画幅比例
        </div>
        {orientationOptions.map((opt) => {
          const active = orientationFilter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onOrientationChange(opt.value)}
              className={cn(
                "flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-xs transition-colors",
                active
                  ? "bg-foreground/[0.10] font-semibold text-foreground"
                  : "font-medium text-muted-foreground hover:bg-surface hover:text-foreground",
              )}
            >
              <span>{opt.label}</span>
              {active ? (
                <span className="size-1.5 rounded-full bg-foreground" />
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
