import { Check, LoaderCircle } from "lucide-react";

import { PaymentChannelEditorFields } from "@/app/payment-admin/payment-channel-editor-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  PaymentChannelInput,
  PaymentCredentialsInput,
} from "@/lib/payment-admin-api";

type ChannelEditorProps = {
  open: boolean;
  editing: boolean;
  channel: PaymentChannelInput;
  credentials: PaymentCredentialsInput;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onChannelChange: <K extends keyof PaymentChannelInput>(
    key: K,
    value: PaymentChannelInput[K],
  ) => void;
  onCredentialsChange: (
    key: keyof PaymentCredentialsInput,
    value: string,
  ) => void;
  onSave: () => void;
  onRotate: () => void;
};

export function ChannelEditorDialog({
  open,
  editing,
  channel,
  credentials,
  saving,
  onOpenChange,
  onChannelChange,
  onCredentialsChange,
  onSave,
  onRotate,
}: ChannelEditorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(94vw,760px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑支付渠道" : "新增支付渠道"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "保存基础配置；支付平台和支付方式创建后保持不变。"
              : "按平台填写基础信息、回调地址和商户凭据。"}
          </DialogDescription>
        </DialogHeader>
        <PaymentChannelEditorFields editing={editing} channel={channel} credentials={credentials} onChannelChange={onChannelChange} onCredentialsChange={onCredentialsChange} onRotate={onRotate} />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {editing ? "保存配置" : "创建渠道"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
