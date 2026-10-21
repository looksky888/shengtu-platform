import { Megaphone, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Announcement } from "@/lib/api";

import { formatAnnouncementDate, getAnnouncementTitle } from "./announcement-utils";

type AnnouncementDialogProps = {
  activeAnnouncement: Announcement | null;
  activeIndex: number;
  totalCount: number;
  autoQueueLength: number;
  onClose: (muteCurrent?: boolean, muteAll?: boolean) => void;
};

export function AnnouncementDialog({
  activeAnnouncement,
  activeIndex,
  totalCount,
  autoQueueLength,
  onClose,
}: AnnouncementDialogProps) {
  return (
    <Dialog open={Boolean(activeAnnouncement)} onOpenChange={(open) => (!open ? onClose(false) : null)}>
      <DialogContent className="max-w-2xl overflow-hidden rounded-[28px] border-0 p-0 shadow-2xl">
        <DialogHero activeAnnouncement={activeAnnouncement} activeIndex={activeIndex} totalCount={totalCount} />
        <div className="max-h-[62vh] overflow-y-auto px-6 py-5">
          <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground/90">
            {activeAnnouncement?.content || ""}
          </div>
          {activeAnnouncement?.image_url ? (
            <img src={activeAnnouncement.image_url} alt={"公告图片"} className="mt-5 max-h-[42vh] w-full rounded-3xl object-contain ring-1 ring-border" />
          ) : null}
        </div>
        <DialogFooter className="flex-col gap-2 border-t border-border bg-muted/20 px-6 py-4 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" className="h-10 rounded-xl px-4" onClick={() => onClose(false, true)}>
            {"全部今日不再提醒"}
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" className="h-10 rounded-xl px-5" onClick={() => onClose(true)}>
              {"当前今日不再提醒"}
            </Button>
            <Button type="button" className="h-10 rounded-xl px-5" onClick={() => onClose(false)}>
              {autoQueueLength > 1 ? "下一条" : "我知道了"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogHero({
  activeAnnouncement,
  activeIndex,
  totalCount,
}: {
  activeAnnouncement: Announcement | null;
  activeIndex: number;
  totalCount: number;
}) {
  return (
    <div className="relative bg-gradient-to-br from-amber-50 via-orange-50 to-white px-6 pb-5 pt-6 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-background">
      <div className="absolute right-5 top-5 opacity-20">
        <Sparkles className="size-14 text-amber-500" />
      </div>
      <DialogHeader className="relative gap-3 text-left">
        <div className="flex items-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900/60">
            <Megaphone className="size-5" />
          </span>
          <Badge variant="warning" className="rounded-md">
            {activeIndex >= 0 ? `${activeIndex + 1} / ${totalCount}` : "公告"}
          </Badge>
        </div>
        <DialogTitle className="text-2xl font-semibold tracking-tight text-foreground">
          {activeAnnouncement ? getAnnouncementTitle(activeAnnouncement) : "公告"}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {formatAnnouncementDate(activeAnnouncement?.updated_at || activeAnnouncement?.created_at)}
        </DialogDescription>
      </DialogHeader>
    </div>
  );
}
