import { LoaderCircle } from "lucide-react";

import { accountStatusOptions, accountTypeOptions } from "@/app/accounts/account-utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Account, AccountStatus, AccountType } from "@/lib/api";

type AccountEditDialogProps = {
  account: Account | null;
  editStatus: AccountStatus;
  editType: AccountType;
  editQuota: string;
  isUpdating: boolean;
  canUpdateAccount: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (value: AccountStatus) => void;
  onTypeChange: (value: AccountType) => void;
  onQuotaChange: (value: string) => void;
  onSave: () => void;
};

export function AccountEditDialog({ account, editStatus, editType, editQuota, isUpdating, canUpdateAccount, onOpenChange, onStatusChange, onTypeChange, onQuotaChange, onSave }: AccountEditDialogProps) {
  return (
    <Dialog open={Boolean(account)} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="rounded-2xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>编辑账户</DialogTitle>
          <DialogDescription className="text-sm leading-6">手动修改账号状态、类型和额度。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <EditSelect label="状态" value={editStatus} options={accountStatusOptions.filter((option) => option.value !== "all")} onChange={(value) => onStatusChange(value as AccountStatus)} />
          <EditSelect label="类型" value={editType} options={accountTypeOptions.filter((option) => option.value !== "all")} onChange={(value) => onTypeChange(value as AccountType)} />
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">额度</label>
            <Input value={editQuota} onChange={(event) => onQuotaChange(event.target.value)} className="h-11 rounded-xl border-border bg-background" />
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="secondary" className="h-10 rounded-xl bg-muted px-5 text-foreground hover:bg-muted/80" onClick={() => onOpenChange(false)} disabled={isUpdating}>取消</Button>
          <Button className="h-10 rounded-xl bg-foreground px-5 text-background hover:bg-foreground/90" onClick={onSave} disabled={isUpdating || !canUpdateAccount}>
            {isUpdating ? <LoaderCircle className="size-4 animate-spin" /> : null}保存修改
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditSelect({ label, value, options, onChange }: { label: string; value: string; options: { label: string; value: string }[]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-11 rounded-xl border-border bg-background"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
