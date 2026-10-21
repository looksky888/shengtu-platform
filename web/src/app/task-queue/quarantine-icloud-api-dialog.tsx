import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copyText } from "@/lib/clipboard";
import type { QuarantineICloudAPIMatchResult } from "./quarantine-icloud-api-match";

type QuarantineICloudAPIDialogProps = {
  result: QuarantineICloudAPIMatchResult | null;
  open: boolean;
  onClose: () => void;
  busy: boolean;
  onPurgeAll: () => void;
};

export function QuarantineICloudAPIDialog({ result, open, busy, onPurgeAll, onClose }: QuarantineICloudAPIDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCopied(false);
      onClose();
    }
  };

  const handleCopy = async () => {
    if (!result?.copyText) return;
    try {
      await copyText(result.copyText);
      setCopied(true);
      toast.success(`已复制 ${result.matched.length} 条邮箱 API`);
    } catch {
      setCopied(false);
      toast.error("复制失败，请选中文本后手动复制");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[min(86vh,760px)] max-w-2xl overflow-hidden rounded-xl p-0">
        <DialogHeader className="border-b border-border/70 bg-muted/30 px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-lg text-foreground">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <KeyRound className="size-4" />
            </span>
            匹配 iCloud 邮箱 API
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            仅匹配永久隔离记录中的邮箱，不会恢复账号或修改邮箱状态。复制内容包含邮箱 API 访问参数，仅用于管理员操作。
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric label="隔离记录" value={result.permanentCount} />
              <Metric label="有效邮箱" value={result.requestedCount} />
              <Metric label="已匹配" value={result.matched.length} tone="success" />
              <Metric label="未找到" value={result.missing.length} tone="warning" />
              <Metric label="API 不可用" value={result.apiUnavailable.length} tone="danger" />
              <Metric label="无邮箱记录" value={result.withoutEmailCount} tone="danger" />
            </div>

            {result.copyText ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="quarantine-icloud-api-copy" className="text-xs font-semibold text-foreground">
                    可复制内容（邮箱----API）
                  </label>
                  <span className="text-[11px] text-muted-foreground">{result.matched.length} 行</span>
                </div>
                <textarea
                  id="quarantine-icloud-api-copy"
                  readOnly
                  value={result.copyText}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-h-48 w-full resize-y rounded-xl border border-border bg-muted/30 px-3 py-2.5 font-mono text-[11px] leading-5 text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  aria-label="邮箱和 iCloud API 批量复制内容"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-xs text-muted-foreground">
                没有找到可复制的邮箱 API。请检查邮箱是否已同步，以及 API 是否处于可用状态。
              </div>
            )}

            {result.withoutEmailCount > 0 ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">另有 {result.withoutEmailCount} 条永久隔离记录没有邮箱字段，已跳过。</p>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center justify-center px-6 py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />正在匹配邮箱…
          </div>
        )}

        <DialogFooter className="border-t border-border/70 bg-card px-6 py-4 sm:justify-between">
          <Button type="button" variant="ghost" className="h-9 rounded-lg text-muted-foreground" disabled={busy} onClick={() => handleOpenChange(false)}>
            <X className="mr-1.5 size-4" />关闭
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="h-9 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50" disabled={busy || !result?.permanentCount} onClick={onPurgeAll}>
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Trash2 className="mr-1.5 size-4" />}
              {busy ? "删除中…" : "全部删除"}
            </Button>
            <Button type="button" className="h-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy || !result?.copyText} onClick={() => void handleCopy()}>
              {copied ? <Check className="mr-1.5 size-4" /> : <Copy className="mr-1.5 size-4" />}
              {copied ? "已复制" : "复制全部"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "success" | "warning" | "danger" }) {
  const valueClass = tone === "success" ? "text-emerald-600" : tone === "warning" ? "text-amber-600" : tone === "danger" ? "text-rose-600" : "text-foreground";
  return (
    <div className="rounded-xl border border-border/70 bg-card px-3 py-2 shadow-2xs">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}
