import type { CreditsAdminState } from "@/app/credits-admin/use-credits-admin";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function CopyAssistDialog({ state }: { state: CreditsAdminState }) {
  return (
    <Dialog open={state.copyAssistText !== ""} onOpenChange={(open) => (!open ? state.setCopyAssistText("") : null)}>
      <DialogContent className="max-w-2xl rounded-2xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>手动复制兑换码</DialogTitle>
          <DialogDescription className="text-sm leading-6">当前浏览器环境未能可靠确认复制结果。请直接选中下面内容手动复制。</DialogDescription>
        </DialogHeader>
        <textarea
          readOnly
          value={state.copyAssistText}
          className="min-h-[160px] w-full rounded-xl border border-border bg-muted/20 p-3 font-mono text-sm text-foreground"
          onFocus={(event) => event.currentTarget.select()}
        />
        <DialogFooter>
          <Button type="button" variant="secondary" className="h-10 rounded-xl px-5" onClick={() => state.setCopyAssistText("")}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}