import { LoaderCircle, Trash2 } from "lucide-react";

import { formatCreditNumber, formatDateTime, formatInactiveDays } from "@/app/users/users-utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ManagedUser } from "@/lib/api";

type DeleteUserDialogProps = {
  user: ManagedUser | null;
  creditBalance?: number;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
};

export function DeleteUserDialog({
  user,
  creditBalance = 0,
  isPending,
  onOpenChange,
  onDelete,
}: DeleteUserDialogProps) {
  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl p-6">
        <DialogHeader className="gap-2">
          <DialogTitle>删除用户</DialogTitle>
          <DialogDescription className="space-y-2 text-sm leading-6">
            <p>
              确认永久删除「{user?.name || user?.username || user?.id}」吗？此操作不可恢复。
            </p>
            {user ? (
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>用户 ID：{user.id}</li>
                {user.username ? <li>用户名：{user.username}</li> : null}
                <li>积分：{formatCreditNumber(creditBalance)}</li>
                <li>{formatInactiveDays(user.inactive_days)}</li>
                <li>上次活跃：{formatDateTime(user.last_used_at)}</li>
              </ul>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
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
