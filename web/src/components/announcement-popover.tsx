import { Bell, ChevronRight, Megaphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Announcement } from "@/lib/api";
import { cn } from "@/lib/utils";

import { formatAnnouncementDate, getAnnouncementTitle } from "./announcement-utils";

type AnnouncementPopoverProps = {
  announcements: Announcement[];
  className?: string;
  onOpenAnnouncement: (announcementId: string) => void;
};

export function AnnouncementPopover({ announcements, className, onOpenAnnouncement }: AnnouncementPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "relative size-9 rounded-lg border-amber-200/80 bg-amber-50/80 p-0 text-amber-800 shadow-2xs hover:bg-amber-100/80 hover:text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200",
            className,
          )}
          aria-label={`查看 ${announcements.length} 条公告`}
        >
          <Bell className="size-4" />
          <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-amber-600 px-1.5 text-[10px] font-semibold leading-5 text-white shadow-2xs">
            {announcements.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(calc(100vw-2rem),440px)] overflow-hidden rounded-xl p-0">
        <div className="border-b border-border/70 bg-muted/30 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Bell className="size-4 text-amber-700 dark:text-amber-300" />
              {"通知提醒"}
            </div>
            <Badge variant="warning" className="rounded-md">{announcements.length} {"条"}</Badge>
          </div>
        </div>
        <div aria-live="polite" className="max-h-[min(64vh,520px)] overflow-y-auto p-3">
          <div className="flex flex-col gap-2.5">
            {announcements.map((announcement, index) => (
              <AnnouncementListItem
                key={announcement.id}
                announcement={announcement}
                index={index}
                onClick={() => onOpenAnnouncement(announcement.id)}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AnnouncementListItem({ announcement, index, onClick }: { announcement: Announcement; index: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex gap-3 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3.5 py-3 text-left transition hover:bg-amber-50 hover:shadow-2xs dark:border-amber-900/50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30"
    >
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800 ring-1 ring-amber-200/70 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900/50">
        <Megaphone className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{getAnnouncementTitle(announcement, index)}</p>
          <ChevronRight className="size-4 shrink-0 text-amber-600 transition group-hover:translate-x-0.5 dark:text-amber-300" />
        </div>
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{announcement.content}</p>
        <div className="mt-2 text-xs text-muted-foreground">{formatAnnouncementDate(announcement.updated_at || announcement.created_at)}</div>
        {announcement.image_url ? (
          <img src={announcement.image_url} alt="" className="mt-3 max-h-32 w-full rounded-lg object-cover ring-1 ring-amber-200/70 dark:ring-amber-900/50" />
        ) : null}
      </div>
    </button>
  );
}
