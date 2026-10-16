import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { QuarantineItem } from "@/lib/api";

export function QuarantinePurgeDialog({ item, busy, onCancel, onConfirm }: {
  item: QuarantineItem | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-rose-100 bg-white shadow-xl">
        <div className="border-b border-rose-50 bg-rose-50/80 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-900"><Trash2 className="size-4 text-rose-600" />删除永久隔离记录？</div>
        </div>
        <div className="space-y-2 px-4 py-3">
          <p className="text-xs leading-relaxed text-stone-600">将从永久隔离仓移除：</p>
          <div className="rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-800">{item.email || item.token_hash || "该账号"}</div>
          <p className="text-[11px] leading-relaxed text-stone-400">不会重新导入号池，操作不可恢复。仅清除隔离仓中的记录。</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-stone-100 px-4 py-3">
          <Button type="button" variant="outline" className="h-8 rounded-lg text-xs" disabled={busy} onClick={onCancel}>取消</Button>
          <Button type="button" className="h-8 rounded-lg bg-rose-600 text-xs text-white hover:bg-rose-700" disabled={busy} onClick={onConfirm}>
            {busy ? <><Loader2 className="mr-1 size-3 animate-spin" />删除中…</> : "确认删除"}
          </Button>
        </div>
      </div>
    </div>
  );
}
