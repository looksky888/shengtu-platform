import { LoaderCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ManagedRole, ManagedUser } from "@/lib/api";

type UserRoleDialogProps = {
  user: ManagedUser | null;
  roles: ManagedRole[];
  selectedRoleId: string;
  isSavingRole: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectedRoleIdChange: (value: string) => void;
  onSave: () => void;
};

export function UserRoleDialog({ user, roles, selectedRoleId, isSavingRole, onOpenChange, onSelectedRoleIdChange, onSave }: UserRoleDialogProps) {
  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            分配角色
          </DialogTitle>
          <DialogDescription className="truncate text-sm">{user?.name || "普通用户"} · {user?.id}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">角色</label>
          <Select value={selectedRoleId} onValueChange={onSelectedRoleIdChange}>
            <SelectTrigger className="h-9 rounded-lg"><SelectValue placeholder="选择角色" /></SelectTrigger>
            <SelectContent>{roles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" className="h-9 rounded-lg px-4" onClick={() => onOpenChange(false)} disabled={isSavingRole}>取消</Button>
          <Button type="button" className="h-9 rounded-lg px-4" onClick={onSave} disabled={isSavingRole || !user || !selectedRoleId}>
            {isSavingRole ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}