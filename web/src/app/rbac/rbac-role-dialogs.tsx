import { LoaderCircle, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ManagedRole } from "@/lib/api";

type RBACCreateRoleDialogProps = {
  open: boolean;
  createName: string;
  createDescription: string;
  isCreating: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateNameChange: (value: string) => void;
  onCreateDescriptionChange: (value: string) => void;
  onCreate: () => void;
};

type RBACDeleteRoleDialogProps = {
  deletingRole: ManagedRole | null;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
};

export function RBACCreateRoleDialog({
  open,
  createName,
  createDescription,
  isCreating,
  onOpenChange,
  onCreateNameChange,
  onCreateDescriptionChange,
  onCreate,
}: RBACCreateRoleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>新建角色</DialogTitle>
          <DialogDescription className="text-sm leading-6">
            新角色会复制默认用户权限，创建后可继续调整
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium text-stone-700 dark:text-foreground">名称</label>
          <Input aria-label="新角色名称" value={createName} onChange={(event) => onCreateNameChange(event.target.value)} placeholder="例如：运营人员" className="h-11 rounded-xl" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-stone-700 dark:text-foreground">描述</label>
          <Input aria-label="新角色描述" value={createDescription} onChange={(event) => onCreateDescriptionChange(event.target.value)} placeholder="角色职责或使用范围" className="h-11 rounded-xl" />
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" className="h-10 rounded-xl px-5" onClick={() => onOpenChange(false)} disabled={isCreating}>取消</Button>
          <Button type="button" className="h-10 rounded-xl px-5" onClick={onCreate} disabled={isCreating}>
            {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RBACDeleteRoleDialog({ deletingRole, isDeleting, onOpenChange, onDelete }: RBACDeleteRoleDialogProps) {
  return (
    <Dialog open={Boolean(deletingRole)} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>删除角色</DialogTitle>
          <DialogDescription className="text-sm leading-6">
            确认删除“{deletingRole?.name}”？只有未关联用户的自定义角色可删除。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="secondary" className="h-10 rounded-xl px-5" onClick={() => onOpenChange(false)} disabled={isDeleting}>取消</Button>
          <Button type="button" variant="destructive" className="h-10 rounded-xl px-5" onClick={onDelete} disabled={isDeleting}>
            {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
