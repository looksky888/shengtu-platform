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
          <DialogTitle>{"\u6e05\u7406\u5386\u53f2\u65e5\u5fd7"}</DialogTitle>
          <DialogDescription>{"\u5c06\u5220\u9664\u4fdd\u7559\u5929\u6570\u4e4b\u524d\u7684\u65e5\u5fd7\u8bb0\u5f55\uff0c\u4e0d\u4f1a\u5220\u9664\u56fe\u7247\u6587\u4ef6\u6216\u8d26\u53f7\u6570\u636e\u3002"}</DialogDescription>
        </DialogHeader>
        <div className={settingsPanelClassName}>
          {"\u5f53\u524d\u4fdd\u7559\u5929\u6570\u4e3a"} {retentionDays} {"\u5929\uff0c\u786e\u8ba4\u540e\u5c06\u6e05\u7406\u66f4\u65e9\u5386\u53f2\u65e5\u5fd7\u3002"}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">{"\u53d6\u6d88"}</Button>
          </DialogClose>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={isCleaning}>
            {isCleaning ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Trash2 data-icon="inline-start" />}
            {"\u786e\u8ba4\u6e05\u7406"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
