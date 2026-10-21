import { LoaderCircle, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteGrokProviderAccounts,
  previewGrokProviderAccountDeletion,
  type GrokProvider,
  type GrokProviderDeletePreview,
} from "@/lib/grok-provider-accounts-api";

const LABELS: Record<GrokProvider, string> = { web: "Grok Web", build: "Grok Build", console: "Grok Console" };

export function GrokProviderDeleteDialog({
  open,
  provider,
  accountIds,
  onOpenChange,
  onDeleted,
}: {
  open: boolean;
  provider: GrokProvider | null;
  accountIds: string[];
  onOpenChange: (open: boolean) => void;
  onDeleted: () => Promise<void>;
}) {
  const [targets, setTargets] = useState<GrokProvider[]>([]);
  const [preview, setPreview] = useState<GrokProviderDeletePreview | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTargets([]); setPreview(null); }, [open, provider, accountIds.length]);
  const peers = (["web", "build", "console"] as GrokProvider[]).filter((item) => item !== provider);
  const toggleTarget = (target: GrokProvider, checked: boolean) => {
    setTargets((current) => checked ? [...new Set([...current, target])] : current.filter((item) => item !== target));
    setPreview(null);
  };
  const loadPreview = async () => {
    if (!provider) return;
    setBusy(true);
    try {
      setPreview(await previewGrokProviderAccountDeletion(provider, accountIds, targets));
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "删除预览失败");
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await deleteGrokProviderAccounts(preview);
      toast.success(`已删除 ${result.deleted} 个账号，其中关联账号 ${result.linked_deleted} 个`);
      await onDeleted();
      onOpenChange(false);
    } catch (reason) {
      setPreview(null);
      toast.error(reason instanceof Error ? reason.message : "账号删除失败，请重新生成预览");
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700"><ShieldAlert className="size-5" />删除 Provider 账号</DialogTitle>
          <DialogDescription>先选择是否连同关联账号删除，再生成一次性预览。关联变化后旧预览会失效。</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
          <div className="font-medium">根账号：{accountIds.length} 个 {provider ? LABELS[provider] : "Provider"}</div>
          <div className="mt-3 grid gap-2">
            {peers.map((target) => (
              <label key={target} className="flex items-center gap-2 text-muted-foreground">
                <Checkbox checked={targets.includes(target)} onCheckedChange={(value) => toggleTarget(target, value === true)} />
                同时删除已关联的 {LABELS[target]}
              </label>
            ))}
          </div>
        </div>
        {preview ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
            <div className="font-semibold">最终将删除 {preview.total} 个账号</div>
            <div className="mt-1 text-xs">Web {preview.by_provider.web} · Build {preview.by_provider.build} · Console {preview.by_provider.console}</div>
            {preview.linked_accounts.length ? <div className="mt-3 max-h-28 space-y-1 overflow-auto text-xs">{preview.linked_accounts.map((item) => <div key={item.id}>{LABELS[item.provider]} · {item.display_name || item.id}</div>)}</div> : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button>
          {!preview ? <Button variant="outline" onClick={() => void loadPreview()} disabled={busy || !provider}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : null}生成删除预览</Button> : null}
          {preview ? <Button variant="destructive" onClick={() => void remove()} disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : null}确认删除 {preview.total} 个</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
