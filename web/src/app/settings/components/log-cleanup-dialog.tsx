import { LoaderCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { settingsPanelClassName } from "./settings-ui";

type LogCleanupDialogProps = {
  open: boolean;
  retentionDays: number;
  isCleaning: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function LogCleanupDialog({ open, retentionDays, isCleaning, onOpenChange, onConfirm }: LogCleanupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>清理历史日志</DialogTitle>
          <DialogDescription>将删除保留天数之前的日志记录，不会删除图片文件或账号数据。</DialogDescription>
        </DialogHeader>
        <div className={settingsPanelClassName}>
          {"当前保留天数为"} {retentionDays} {"天，确认后将清理更早历史日志。"}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">取消</Button>
          </DialogClose>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={isCleaning}>
            {isCleaning ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Trash2 data-icon="inline-start" />}
            {"确认清理"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
