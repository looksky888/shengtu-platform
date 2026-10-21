import { LoaderCircle, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ICloudMailbox } from "@/lib/icloud-api";

type DeleteMailboxDialogProps = {
  mailbox: ICloudMailbox | null;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
};

export function DeleteMailboxDialog({
  mailbox,
  isPending,
  onOpenChange,
  onDelete,
}: DeleteMailboxDialogProps) {
  const claimed = Boolean(mailbox?.openai_claimed || mailbox?.grok_claimed);

  return (
    <Dialog open={Boolean(mailbox)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-xl p-6">
        <DialogHeader className="gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/50">
              <Trash2 className="size-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-left">删除隐私邮箱</DialogTitle>
              <DialogDescription className="text-left text-sm leading-6">
                确认删除该邮箱库存记录？此操作不可恢复。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {mailbox ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/30 p-3.5">
              <p className="truncate font-mono text-sm font-medium text-foreground">
                {mailbox.email || "—"}
              </p>
              <p className="mt-1.5 truncate text-xs text-muted-foreground">
                {mailbox.label || "未命名"}
                {" · "}
                {mailbox.account_label || mailbox.account_apple_id || "未绑定账号"}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {mailbox.openai_claimed ? (
                  <Badge variant="success">GPT 已注册</Badge>
                ) : String(mailbox.status || "").toLowerCase() === "used" ? (
                  <Badge variant="warning">GPT 注册中</Badge>
                ) : (
                  <Badge variant="secondary">GPT 可用</Badge>
                )}
                {mailbox.grok_claimed ? <Badge variant="info">Grok 已注册</Badge> : null}
              </div>
            </div>

            {claimed ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                该邮箱已用于注册。删除后将无法再从本库取码或 claim，请确认不再需要。
              </div>
            ) : null}

            <p className="text-xs leading-5 text-muted-foreground">
              仅从本系统库存移除，并清除已同步的邮件记录；不会自动关闭 iCloud 端的 Hide My Email。
            </p>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-9 rounded-lg px-4"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-9 rounded-lg px-4"
            onClick={onDelete}
            disabled={isPending}
          >
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
