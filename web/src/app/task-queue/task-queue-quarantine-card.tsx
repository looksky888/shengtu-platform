import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, KeyRound, RefreshCcw, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { QuarantineItem } from "@/lib/api";
import { cn } from "@/lib/utils";

import { QuarantineAccountList } from "./quarantine-account-list";

type CabinTab = "temporary" | "permanent";

export function TaskQueueQuarantineCard({ items, temporaryCount, permanentCount, busyHash, onRestore, onPurge, onMatchICloudAPIs, matchingICloudAPIs }: {
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
  const selectTab = (next: CabinTab) => { setTabPicked(true); setTab(next); };

  return (
    <Card className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-2xs">
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-foreground">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldAlert className="size-3.5" />
              </span>
              <span className="whitespace-nowrap text-sm font-semibold">隔离仓</span>
            </div>
            <Badge variant="secondary">合计 {total}</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">按类型分栏 · 全量可滚动 · 数字即真实条数</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CabinTabButton active={tab === "temporary"} tone="temporary" count={temporaryCount} onClick={() => selectTab("temporary")} />
          <CabinTabButton active={tab === "permanent"} tone="permanent" count={permanentCount} onClick={() => selectTab("permanent")} />
        </div>
        {tab === "permanent" && permanentCount > 0 ? (
          <Button type="button" variant="outline" className="h-9 w-full rounded-lg border-primary/30 text-xs text-primary hover:bg-primary/10" disabled={matchingICloudAPIs} onClick={onMatchICloudAPIs}>
            <KeyRound className="mr-1.5 size-3.5" />{matchingICloudAPIs ? "匹配中…" : "一键匹配 iCloud API"}
          </Button>
        ) : null}
        {otherCount > 0 ? <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground"><AlertTriangle className="size-3.5 text-muted-foreground" />另有 {otherCount} 条无明确等级，可在接口全量中查看</div> : null}
        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {tab === "temporary" ? "额度用尽 / 限流：定时自动探活可回号池，也可手动「恢复」。" : "token 过期等死号：不会自动回池。可「恢复」试回池，或「删除」清掉记录（不回池）。"}
        </div>
        {activeCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-muted/20 py-8 text-center"><RefreshCcw className="size-5 text-muted-foreground" /><p className="text-xs font-medium text-muted-foreground">{tab === "temporary" ? "暂无临时隔离账号" : "暂无永久隔离账号"}</p><p className="text-[11px] text-muted-foreground">有账号进入后会显示在此</p></div>
        ) : <QuarantineAccountList items={activeItems} permanent={tab === "permanent"} busyHash={busyHash} onRestore={onRestore} onPurge={onPurge} />}
        {activeCount > 0 ? <div className="flex items-center justify-between text-[11px] text-muted-foreground"><span>本栏 <b className="text-foreground">{activeItems.length}</b> / <b className="text-foreground">{activeCount}</b> 条</span><span>已显示全部 · 可滚动</span></div> : null}
      </CardContent>
    </Card>
  );
}

function CabinTabButton({ active, tone, count, onClick }: { active: boolean; tone: CabinTab; count: number; onClick: () => void }) {
  const temporary = tone === "temporary";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border border-border/70 bg-muted/20 p-3 text-left transition",
        active ? "border-primary/40 bg-muted/40 ring-1 ring-primary/20" : "hover:bg-muted/35",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn("size-2 rounded-full", temporary ? "bg-amber-500" : "bg-rose-500")} />
        <span>{temporary ? "临时隔离" : "永久隔离"}</span>
      </div>
      <div className="mt-1 flex items-end justify-between gap-1">
        <span className="text-lg font-semibold tabular-nums text-foreground">{count}</span>
        <Badge variant={temporary ? "warning" : "danger"} className="rounded-md px-1.5 py-0 text-[10px]">{temporary ? "可回池" : "死号"}</Badge>
      </div>
    </button>
  );
}
