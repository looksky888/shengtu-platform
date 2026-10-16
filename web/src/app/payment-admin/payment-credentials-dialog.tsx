import { LoaderCircle, RotateCcw } from "lucide-react";

import { PaymentCredentialsForm } from "@/app/payment-admin/payment-credentials-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PaymentCredentialsInput } from "@/lib/payment-admin-api";

export function CredentialsDialog({
  open,
  saving,
  provider,
  value,
  onOpenChange,
  onChange,
  onSubmit,
}: {
  open: boolean;
  saving: boolean;
  provider: string;
  value: PaymentCredentialsInput;
  onOpenChange: (open: boolean) => void;
  onChange: (key: keyof PaymentCredentialsInput, value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(94vw,680px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>轮换支付凭据</DialogTitle>
          <DialogDescription>请完整填写新凭据。提交后旧版本停止作为当前凭据使用。</DialogDescription>
        </DialogHeader>
        <PaymentCredentialsForm provider={provider} value={value} onChange={onChange} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button type="button" onClick={onSubmit} disabled={saving}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            确认轮换
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
