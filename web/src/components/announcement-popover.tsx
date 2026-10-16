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
            "relative size-10 rounded-full border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-0 text-amber-800 shadow-sm hover:from-amber-100 hover:to-orange-100 hover:text-amber-900",
            className,
          )}
          aria-label={`\u67e5\u770b ${announcements.length} \u6761\u516c\u544a`}
        >
          <Bell className="size-4" />
          <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-amber-600 px-1.5 text-[10px] font-semibold leading-5 text-white shadow-sm">
            {announcements.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(calc(100vw-2rem),440px)] overflow-hidden rounded-2xl p-0">
        <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50 via-orange-50 to-white px-4 py-3 dark:border-amber-900/40 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-background">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Bell className="size-4 text-amber-700 dark:text-amber-300" />
              {"\u901a\u77e5\u63d0\u9192"}
            </div>
            <Badge variant="warning" className="rounded-md">{announcements.length} {"\u6761"}</Badge>
          </div>
        </div>
        <div aria-live="polite" className="max-h-[min(64vh,520px)] overflow-y-auto p-3">
          <div className="flex flex-col gap-3">
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
      className="group flex gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:bg-amber-50 hover:shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30"
    >
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 ring-1 ring-amber-200/70 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900/50">
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
          <img src={announcement.image_url} alt="" className="mt-3 max-h-32 w-full rounded-xl object-cover ring-1 ring-amber-200/70 dark:ring-amber-900/50" />
        ) : null}
      </div>
    </button>
  );
}
