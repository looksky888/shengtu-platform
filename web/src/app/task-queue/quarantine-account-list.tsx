import { Loader2, Trash2, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { QuarantineItem } from "@/lib/api";

export function QuarantineAccountList({ items, permanent, busyHash, onRestore, onPurge }: {
  items: QuarantineItem[];
  permanent: boolean;
  busyHash: string | null;
  onRestore: (item: QuarantineItem) => void;
  onPurge: (item: QuarantineItem) => void;
}) {
  return (
    <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-0.5">
      {items.map((item, index) => {
        const busy = busyHash === item.token_hash;
        return (
          <div
            key={item.token_hash || `${item.email || "row"}-${item.removed_at || index}`}
            className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs transition"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-foreground">{item.email || item.token_hash || "—"}</div>
                <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{shortReason(item.reason)}</div>
              </div>
              <Badge variant={permanent ? "danger" : "warning"} className="shrink-0 rounded-md px-1.5 py-0 text-[10px]">{gradeLabel(item.grade)}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
              <span className="text-[10px] text-muted-foreground">{item.source || "—"}{item.removed_at ? ` · ${item.removed_at}` : ""}</span>
              <div className="flex items-center gap-1.5">
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 rounded-lg border-blue-200 px-2 text-[11px] text-blue-700 hover:bg-blue-50" disabled={!item.token_hash || busy} onClick={() => onRestore(item)}>
                  {busy ? <Loader2 className="size-3 animate-spin" /> : <Undo2 className="size-3" />}恢复
                </Button>
                {permanent ? (
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1 rounded-lg border-rose-200 px-2 text-[11px] text-rose-700 hover:bg-rose-50" disabled={!item.token_hash || busy} onClick={() => onPurge(item)}>
                    <Trash2 className="size-3" />删除
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function shortReason(reason?: string) {
  const text = (reason || "—").replace(/\s+/g, " ").trim();
  if (text.includes("token_expired") || /token is expired|authentication token/i.test(text)) return "认证令牌已过期（token_expired）· HTTP 401";
  if (/quota exhausted|image_gen quota/i.test(text)) return "生图额度用尽 · 临时隔离，可探活回池";
  if (text.includes("限流") || /rate_limit/i.test(text)) return "账号限流 · 临时隔离";
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

function gradeLabel(grade?: string) {
  if (grade === "temporary") return "临时";
  if (grade === "permanent") return "永久";
  if (grade === "unknown") return "未知";
  return grade || "—";
}
