import type { ReactNode } from "react";

import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  pendingLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({ open, title, description, confirmLabel = "确认", pendingLabel = "处理中…", destructive = false, pending = false, onClose, onConfirm }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen && !pending ? onClose() : null)}>
      <DialogContent showCloseButton={false} className="rounded-2xl p-6">
        <DialogHeader className="gap-2"><DialogTitle>{title}</DialogTitle><DialogDescription className="text-sm leading-6">{description}</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>取消</Button>
          <Button type="button" variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : null}{pending ? pendingLabel : confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
