import { Compass, FileJson2, LoaderCircle, SquareTerminal, Webhook } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { GrokProvider } from "@/lib/grok-provider-accounts-api";

export function GrokProviderImportDialog({
  open,
  busy,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (provider: GrokProvider, document: string, options: { autoSyncQuota: boolean; convertToConsole: boolean }) => Promise<boolean>;
}) {
  const [provider, setProvider] = useState<GrokProvider>("web");
  const [document, setDocument] = useState("");
  const [autoSyncQuota, setAutoSyncQuota] = useState(true);
  const [convertToConsole, setConvertToConsole] = useState(false);
  useEffect(() => {
    if (!open) setDocument("");
  }, [open]);
  const submit = async () => {
    if (!document.trim()) return;
    if (await onSubmit(provider, document, { autoSyncQuota, convertToConsole: provider === "web" && convertToConsole })) onOpenChange(false);
  };
  const options = [
    { value: "web", label: "Grok Web", detail: "粘贴 SSO 或 JSON", icon: Compass },
    { value: "console", label: "Grok Console", detail: "粘贴 Console SSO", icon: Webhook },
    { value: "build", label: "Grok Build", detail: "粘贴 OAuth JSON", icon: SquareTerminal },
  ] as const;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>导入 Grok 账号</DialogTitle>
          <DialogDescription>选择凭据类型并粘贴凭据文档。</DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2"><legend className="mb-2 text-sm font-medium">选择账号类型</legend><div className="grid gap-2 sm:grid-cols-3">{options.map((option) => {
          const Icon = option.icon;
          const active = provider === option.value;
          return <button key={option.value} type="button" aria-pressed={active} className={`grid gap-1 rounded-2xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#1456f0]/30 ${active ? "border-[#1456f0] bg-blue-50 text-[#1456f0]" : "border-border hover:bg-muted/50"}`} onClick={() => setProvider(option.value)}><Icon className="size-4" /><span className="mt-1 text-sm font-medium">{option.label}</span><span className="text-[11px] text-muted-foreground">{option.detail}</span></button>;
        })}</div></fieldset>
        <label className="grid gap-2 text-sm font-medium">
          <span className="inline-flex items-center gap-1.5"><FileJson2 className="size-4 text-[#1456f0]" />凭据文档</span>
          <Textarea
            aria-label="Grok Provider 凭据文档"
            className="min-h-48 rounded-[16px] font-mono text-xs"
            value={document}
            onChange={(event) => setDocument(event.target.value)}
            placeholder={provider === "build" ? '{"access_token":"...","refresh_token":"..."}' : "每行一个 SSO，或粘贴 JSON 文档"}
          />
        </label>
        <p className="text-xs text-muted-foreground">单次最多 10,000 个账号；Provider 不匹配、格式错误或凭据缺失时整批拒绝。</p>
        <div className="grid gap-2 rounded-[16px] border border-border/70 bg-muted/30 p-3">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox checked={autoSyncQuota} onCheckedChange={(checked) => setAutoSyncQuota(checked === true)} className="mt-0.5" />
            <span className="font-medium">自动同步本次导入账号额度</span>
          </label>
          <label className={`flex items-start gap-3 border-t border-border/70 pt-3 text-sm ${provider === "web" ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>
            <Checkbox checked={provider === "web" && convertToConsole} disabled={provider !== "web"} onCheckedChange={(checked) => setConvertToConsole(checked === true)} className="mt-0.5" />
            <span className="font-medium">自动转换并同步 Console 额度</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button>
          <Button onClick={() => void submit()} disabled={busy || !document.trim()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}开始导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
