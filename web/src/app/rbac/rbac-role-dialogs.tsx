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
          <DialogTitle>{"\u65b0\u5efa\u89d2\u8272"}</DialogTitle>
          <DialogDescription className="text-sm leading-6">
            {"\u65b0\u89d2\u8272\u4f1a\u590d\u5236\u9ed8\u8ba4\u7528\u6237\u6743\u9650\uff0c\u521b\u5efa\u540e\u53ef\u7ee7\u7eed\u8c03\u6574"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium text-stone-700 dark:text-foreground">{"\u540d\u79f0"}</label>
          <Input aria-label="新角色名称" value={createName} onChange={(event) => onCreateNameChange(event.target.value)} placeholder={"\u4f8b\u5982\uff1a\u8fd0\u8425\u4eba\u5458"} className="h-11 rounded-xl" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-stone-700 dark:text-foreground">{"\u63cf\u8ff0"}</label>
          <Input aria-label="新角色描述" value={createDescription} onChange={(event) => onCreateDescriptionChange(event.target.value)} placeholder={"\u89d2\u8272\u804c\u8d23\u6216\u4f7f\u7528\u8303\u56f4"} className="h-11 rounded-xl" />
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" className="h-10 rounded-xl px-5" onClick={() => onOpenChange(false)} disabled={isCreating}>{"\u53d6\u6d88"}</Button>
          <Button type="button" className="h-10 rounded-xl px-5" onClick={onCreate} disabled={isCreating}>
            {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {"\u521b\u5efa"}
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
          <DialogTitle>{"\u5220\u9664\u89d2\u8272"}</DialogTitle>
          <DialogDescription className="text-sm leading-6">
            {"\u786e\u8ba4\u5220\u9664\u201c"}{deletingRole?.name}{"\u201d\uff1f\u53ea\u6709\u672a\u5173\u8054\u7528\u6237\u7684\u81ea\u5b9a\u4e49\u89d2\u8272\u53ef\u5220\u9664\u3002"}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="secondary" className="h-10 rounded-xl px-5" onClick={() => onOpenChange(false)} disabled={isDeleting}>{"\u53d6\u6d88"}</Button>
          <Button type="button" variant="destructive" className="h-10 rounded-xl px-5" onClick={onDelete} disabled={isDeleting}>
            {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {"\u5220\u9664"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
