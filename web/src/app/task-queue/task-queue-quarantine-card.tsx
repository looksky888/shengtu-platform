import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, KeyRound, RefreshCcw, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { QuarantineItem } from "@/lib/api";
import { cn } from "@/lib/utils";

import { QuarantineAccountList } from "./quarantine-account-list";

type CabinTab = "temporary" | "permanent";

export function TaskQueueQuarantineCard({
  items,
  temporaryCount,
  permanentCount,
  busyHash,
  onRestore,
  onPurge,
  onMatchICloudAPIs,
  matchingICloudAPIs,
}: {
  items: QuarantineItem[];
  temporaryCount: number;
  permanentCount: number;
  busyHash: string | null;
  onRestore: (item: QuarantineItem) => void;
  onPurge: (item: QuarantineItem) => void;
  onMatchICloudAPIs: () => void;
  matchingICloudAPIs: boolean;
}) {
  const [tab, setTab] = useState<CabinTab>("temporary");
  const [tabPicked, setTabPicked] = useState(false);
  useEffect(() => {
    if (tabPicked) return;
    if (permanentCount > 0 && temporaryCount === 0) setTab("permanent");
    else if (temporaryCount > 0) setTab("temporary");
  }, [permanentCount, temporaryCount, tabPicked]);
  const temporaryItems = useMemo(() => items.filter((item) => item.grade === "temporary"), [items]);
  const permanentItems = useMemo(() => items.filter((item) => item.grade === "permanent"), [items]);
  const activeItems = tab === "temporary" ? temporaryItems : permanentItems;
  const activeCount = tab === "temporary" ? temporaryCount : permanentCount;
  const otherCount = Math.max(0, items.length - temporaryCount - permanentCount);
  const total = temporaryCount + permanentCount + otherCount;
  const selectTab = (next: CabinTab) => {
    setTabPicked(true);
    setTab(next);
  };

  return (
    <Card className="overflow-hidden rounded-[14px] border border-border/80 bg-surface shadow-2xs">
      <CardContent className="space-y-3 p-3.5">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-foreground">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground ring-1 ring-border/60">
                <ShieldAlert className="size-3.5" />
              </span>
              <span className="whitespace-nowrap text-sm font-semibold">隔离仓</span>
            </div>
            <Badge variant="secondary" className="tabular-nums">合计 {total}</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">按等级分栏管理限流冷却与失效账号</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CabinTabButton
            active={tab === "temporary"}
            highlighted={tab === "temporary" && (tabPicked || temporaryCount > 0)}
            tone="temporary"
            count={temporaryCount}
            onClick={() => selectTab("temporary")}
          />
          <CabinTabButton
            active={tab === "permanent"}
            highlighted={tab === "permanent" && (tabPicked || permanentCount > 0)}
            tone="permanent"
            count={permanentCount}
            onClick={() => selectTab("permanent")}
          />
        </div>
        {tab === "permanent" && permanentCount > 0 ? (
          <Button type="button" variant="outline" size="sm" className="w-full text-xs" disabled={matchingICloudAPIs} onClick={onMatchICloudAPIs}>
            <KeyRound className="size-3.5" />
            {matchingICloudAPIs ? "匹配中…" : "一键匹配 iCloud API"}
          </Button>
        ) : null}
        {otherCount > 0 ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-muted/40 px-2.5 py-1.5 text-[11px] tabular-nums text-muted-foreground">
            <AlertTriangle className="size-3.5 shrink-0 text-muted-foreground" />
            另有 {otherCount} 条无明确等级，可在接口全量中查看
          </div>
        ) : null}
        <div className="rounded-lg border border-border/60 bg-surface-muted/35 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {tab === "temporary"
            ? "额度耗尽 / 限流：定时自动探活可回号池，也可手动恢复。"
            : "Token 失效等死号：不会自动回池，可尝试恢复或彻底清除。"}
        </div>
        {activeCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 bg-surface-muted/30 px-3 py-5 text-center">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-surface text-muted-foreground shadow-2xs">
              <RefreshCcw className="size-3.5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-foreground">
                {tab === "temporary" ? "暂无临时隔离账号" : "暂无永久隔离账号"}
              </p>
              <p className="text-[11px] leading-4 text-muted-foreground">
                有账号触发隔离后会在此处展示
              </p>
            </div>
          </div>
        ) : (
          <QuarantineAccountList items={activeItems} permanent={tab === "permanent"} busyHash={busyHash} onRestore={onRestore} onPurge={onPurge} />
        )}
        {activeCount > 0 ? (
          <div className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
            <span>
              本栏 <b className="text-foreground">{activeItems.length}</b> / <b className="text-foreground">{activeCount}</b> 条
            </span>
            <span>已显示全部 · 可滚动</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CabinTabButton({
  active,
  highlighted,
  tone,
  count,
  onClick,
}: {
  active: boolean;
  highlighted: boolean;
  tone: CabinTab;
  count: number;
  onClick: () => void;
}) {
  const temporary = tone === "temporary";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-xl border p-2.5 text-left transition-colors",
        highlighted
          ? "border-border-strong bg-surface shadow-xs ring-1 ring-foreground/8"
          : active
            ? "border-border/90 bg-surface-muted/55"
            : "border-border/70 bg-surface-muted/20 hover:bg-surface-hover/60",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className={cn("size-1.5 shrink-0 rounded-full", temporary ? "bg-amber-500" : "bg-rose-500")} />
        <span className="truncate">{temporary ? "临时隔离" : "永久隔离"}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-1">
        <span className="text-base font-semibold tabular-nums text-foreground">{count}</span>
        <Badge variant={temporary ? "warning" : "danger"} className="rounded px-1.5 py-0 text-[10px]">
          {temporary ? "可回池" : "死号"}
        </Badge>
      </div>
    </button>
  );
}
