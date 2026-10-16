import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, KeyRound, RefreshCcw, ShieldAlert, ShieldOff } from "lucide-react";

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
  const selectTab = (next: CabinTab) => { setTabPicked(true); setTab(next); };

  return (
    <Card className="overflow-hidden border-stone-200/90 bg-white shadow-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div><div className="flex items-center gap-2 text-sm font-semibold text-stone-800"><span className="flex size-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-100"><ShieldAlert className="size-3.5" /></span>隔离仓</div><p className="mt-1 text-[11px] text-stone-400">按类型分栏 · 全量可滚动 · 数字即真实条数</p></div>
          <div className="rounded-lg bg-stone-900 px-2.5 py-1 text-center text-white shadow-sm"><div className="text-[10px] font-medium uppercase tracking-wide text-stone-300">合计</div><div className="text-lg font-bold tabular-nums leading-none">{temporaryCount + permanentCount + otherCount}</div></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CabinTabButton active={tab === "temporary"} tone="temporary" count={temporaryCount} onClick={() => selectTab("temporary")} />
          <CabinTabButton active={tab === "permanent"} tone="permanent" count={permanentCount} onClick={() => selectTab("permanent")} />
        </div>
        {tab === "permanent" && permanentCount > 0 ? (
          <Button type="button" variant="outline" className="h-9 w-full rounded-lg border-blue-200 text-xs text-blue-700 hover:bg-blue-50" disabled={matchingICloudAPIs} onClick={onMatchICloudAPIs}>
            <KeyRound className="mr-1.5 size-3.5" />{matchingICloudAPIs ? "匹配中…" : "一键匹配 iCloud API"}
          </Button>
        ) : null}
        {otherCount > 0 ? <div className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[11px] text-stone-500"><AlertTriangle className="size-3.5 text-stone-400" />另有 {otherCount} 条无明确等级，可在接口全量中查看</div> : null}
        <div className={cn("rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed", tab === "temporary" ? "border border-amber-100 bg-amber-50/70 text-amber-900/80" : "border border-rose-100 bg-rose-50/70 text-rose-900/80")}>
          {tab === "temporary" ? "额度用尽 / 限流：定时自动探活可回号池，也可手动「恢复」。" : "token 过期等死号：不会自动回池。可「恢复」试回池，或「删除」清掉记录（不回池）。"}
        </div>
        {activeCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-stone-200 bg-stone-50/50 py-8 text-center"><RefreshCcw className="size-5 text-stone-300" /><p className="text-xs font-medium text-stone-500">{tab === "temporary" ? "暂无临时隔离账号" : "暂无永久隔离账号"}</p><p className="text-[11px] text-stone-400">有账号进入后会显示在此</p></div>
        ) : <QuarantineAccountList items={activeItems} permanent={tab === "permanent"} busyHash={busyHash} onRestore={onRestore} onPurge={onPurge} />}
        {activeCount > 0 ? <div className="flex items-center justify-between text-[11px] text-stone-400"><span>本栏 <b className="text-stone-600">{activeItems.length}</b> / <b className="text-stone-600">{activeCount}</b> 条</span><span>已显示全部 · 可滚动</span></div> : null}
      </CardContent>
    </Card>
  );
}

function CabinTabButton({ active, tone, count, onClick }: { active: boolean; tone: CabinTab; count: number; onClick: () => void }) {
  const temporary = tone === "temporary";
  return (
    <button type="button" onClick={onClick} className={cn("rounded-xl border px-3 py-2.5 text-left transition", active ? (temporary ? "border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm ring-2 ring-amber-200/60" : "border-rose-300 bg-gradient-to-br from-rose-50 to-red-50 shadow-sm ring-2 ring-rose-200/60") : (temporary ? "border-stone-200 bg-stone-50/80 hover:border-amber-200 hover:bg-amber-50/40" : "border-stone-200 bg-stone-50/80 hover:border-rose-200 hover:bg-rose-50/40"))}>
      <div className={cn("flex items-center gap-1.5 text-[11px] font-medium", temporary ? "text-amber-800" : "text-rose-800")}>{temporary ? <Clock3 className="size-3.5" /> : <ShieldOff className="size-3.5" />}{temporary ? "临时隔离" : "永久隔离"}</div>
      <div className="mt-1 flex items-end justify-between"><span className={cn("text-2xl font-bold tabular-nums", temporary ? "text-amber-700" : "text-rose-700")}>{count}</span><Badge variant={temporary ? "warning" : "danger"} className="rounded-md px-1.5 py-0 text-[10px]">{temporary ? "可回池" : "死号"}</Badge></div>
    </button>
  );
}
