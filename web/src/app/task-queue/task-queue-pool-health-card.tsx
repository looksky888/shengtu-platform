import { Activity } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AccountPoolHealth } from "@/lib/api";
import { cn } from "@/lib/utils";

export function TaskQueuePoolHealthCard({ pool }: { pool: AccountPoolHealth | null }) {
  const ops = pool?.ops || {};
  const dispose = pool?.dispose;
  const deleted = dispose?.deleted_permanent ?? ops.deleted_permanent ?? 0;
  const quarantinedToday = dispose?.quarantined_temporary ?? ops.quarantined_temporary ?? 0;
  const recovered =
    (dispose?.refresh_recovered ?? ops.refresh_recovered ?? 0) +
    (dispose?.auto_restored_temporary ?? ops.auto_restored_temporary ?? 0) +
    (dispose?.manual_restored ?? ops.manual_restored ?? 0);
  const qFail = dispose?.quarantine_write_failed ?? ops.quarantine_write_failed ?? 0;
  const qFailPct = typeof dispose?.quarantine_fail_share === "number" ? Math.round(dispose.quarantine_fail_share * 100) : null;
  const recoverPct = typeof dispose?.recover_share === "number" ? Math.round(dispose.recover_share * 100) : null;

  return (
    <Card className="overflow-hidden border-stone-200/90 bg-gradient-to-b from-white to-slate-50/80 shadow-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
            <span className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
              <Activity className="size-3.5" />
            </span>
            号池健康
          </div>
          <Badge variant="info" className="rounded-md font-normal">{pool?.schedule || "least_loaded"}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="可用" value={pool?.available} tone="emerald" />
          <Stat label="锁定" value={pool?.locked} tone="blue" />
          <Stat label="冷却" value={pool?.cooling} tone="amber" />
          <Stat label="号池总计" value={pool?.total} tone="slate" />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <MiniMetric label="限流" value={pool?.rate_limited ?? 0} />
          <MiniMetric label="异常" value={pool?.invalid ?? 0} danger={(pool?.invalid ?? 0) > 0} />
          <MiniMetric label="禁用" value={pool?.disabled ?? 0} />
        </div>
        <div className="rounded-xl border border-stone-100 bg-white/80 px-3 py-2 text-[11px] leading-relaxed text-stone-500">
          <div>今日处置 · 删除 <b className="text-stone-700">{deleted}</b>{" · "}临时入仓 <b className="text-amber-700">{quarantinedToday}</b>{" · "}恢复 <b className="text-emerald-700">{recovered}</b></div>
          <div className="mt-0.5">写仓失败 <b className={cn(qFail > 0 ? "text-rose-600" : "text-stone-700")}>{qFail}</b>{qFailPct != null ? `（${qFailPct}%）` : ""}{recoverPct != null ? ` · 永久恢复率 ${recoverPct}%` : ""}</div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-8 flex-1 rounded-lg border-stone-200 text-xs"><Link to="/accounts">号池管理</Link></Button>
          <Button asChild variant="outline" className="h-8 flex-1 rounded-lg border-stone-200 text-xs"><Link to="/register">注册机</Link></Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value?: number; tone: "emerald" | "blue" | "amber" | "slate" }) {
  const tones = {
    emerald: "from-emerald-50 to-white text-emerald-700 ring-emerald-100",
    blue: "from-blue-50 to-white text-blue-700 ring-blue-100",
    amber: "from-amber-50 to-white text-amber-700 ring-amber-100",
    slate: "from-slate-50 to-white text-slate-700 ring-slate-100",
  };
  return <div className={cn("rounded-xl bg-gradient-to-b px-2.5 py-2 ring-1", tones[tone])}><div className="text-[11px] opacity-70">{label}</div><div className="text-xl font-bold tabular-nums leading-tight">{value ?? "—"}</div></div>;
}

function MiniMetric({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return <div className="rounded-lg border border-stone-100 bg-white px-2 py-1.5 text-center"><div className="text-[10px] text-stone-400">{label}</div><div className={cn("text-sm font-semibold tabular-nums", danger ? "text-rose-600" : "text-stone-700")}>{value}</div></div>;
}
