import { LoaderCircle } from "lucide-react";

import type { PendingCpaImport } from "@/app/accounts/components/account-import-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type AccountImportConfirmDialogProps = {
  open: boolean;
  pendingCpaImport: PendingCpaImport | null;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function AccountImportConfirmDialog({
  open,
  pendingCpaImport,
  isSubmitting,
  onOpenChange,
  onConfirm,
}: AccountImportConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>确认导入 CPA Token</DialogTitle>
          <DialogDescription className="text-sm leading-6">
            {pendingCpaImport ? `确认识别到 ${pendingCpaImport.parsedFileCount} 个 Token，是否确认导入？` : "尚未读取到可导入的 Token。"}
            {pendingCpaImport?.errorCount ? `，另有 ${pendingCpaImport.errorCount} 个文件未提取成功。` : "。"}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="pt-2">
          <Button
            variant="secondary"
            className="h-10 rounded-xl bg-stone-100 px-5 text-stone-700 hover:bg-stone-200"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            返回
          </Button>
          <Button
            className="h-10 rounded-xl bg-stone-950 px-5 text-white hover:bg-stone-800"
            onClick={onConfirm}
            disabled={isSubmitting || !pendingCpaImport}
          >
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
            确认导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}