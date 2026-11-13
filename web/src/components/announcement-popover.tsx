import { useState } from "react";
import { ArrowUpRight, Bell, ChevronRight, Megaphone } from "lucide-react";
import { Link } from "react-router-dom";

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

function resolveBannerTagLabel(announcement: Announcement): string | null {
  if (announcement.display_mode !== "banner") return null;
  if (announcement.banner_tone === "activity") return "活动横幅";
  if (announcement.banner_tone === "update") return "更新横幅";
  if (announcement.banner_tone === "warning") return "预警横幅";
  return "顶部通知";
}

export function AnnouncementPopover({
  announcements,
  className,
  onOpenAnnouncement,
}: AnnouncementPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "relative size-8 rounded-lg p-0 text-muted-foreground shadow-none hover:bg-surface-hover hover:text-foreground",
            className,
          )}
          aria-label={`查看 ${announcements.length} 条公告`}
          title={`站内通知（${announcements.length}）`}
        >
          <Bell className="size-3.5" />
          <span className="absolute top-1 right-1 flex size-2 items-center justify-center rounded-full bg-amber-500 ring-2 ring-background" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(calc(100vw-2rem),420px)] overflow-hidden rounded-xl p-0">
        <div className="border-b border-border/70 bg-surface-subtle/70 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Bell className="size-4 text-muted-foreground" />
              {"站内公告"}
            </div>
            <Badge variant="secondary" className="rounded-md">
              {announcements.length} {"条"}
            </Badge>
          </div>
        </div>
        <div aria-live="polite" className="max-h-[min(64vh,520px)] overflow-y-auto p-3">
          <div className="flex flex-col gap-2">
            {announcements.map((announcement, index) => (
              <AnnouncementListItem
                key={announcement.id}
                announcement={announcement}
                index={index}
                onOpenDetail={() => {
                  setOpen(false);
                  onOpenAnnouncement(announcement.id);
                }}
                onNavigateLink={() => setOpen(false)}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AnnouncementListItem({
  announcement,
  index,
  onOpenDetail,
  onNavigateLink,
}: {
  announcement: Announcement;
  index: number;
  onOpenDetail: () => void;
  onNavigateLink: () => void;
}) {
  const bannerTag = resolveBannerTagLabel(announcement);
  const linkUrl = (announcement.link_url || "").trim();
  const isInternalLink = linkUrl.startsWith("/") && !linkUrl.startsWith("//");
  const isExternalLink = /^https?:\/\//i.test(linkUrl);

  return (
    <div className="group flex flex-col rounded-xl border border-border/75 bg-surface transition hover:bg-surface-hover hover:shadow-2xs">
      <button
        type="button"
        onClick={onOpenDetail}
        className="flex gap-3 px-3.5 py-3 text-left"
      >
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground">
          <Megaphone className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-foreground">
                {getAnnouncementTitle(announcement, index)}
              </p>
              {bannerTag ? (
                <span className="shrink-0 rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {bannerTag}
                </span>
              ) : null}
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
          <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
            {announcement.content}
          </p>
          <div className="mt-2 text-[11px] text-muted-foreground/80">
            {formatAnnouncementDate(announcement.updated_at || announcement.created_at)}
          </div>
          {announcement.image_url ? (
            <img
              src={announcement.image_url}
              alt=""
              className="mt-3 max-h-32 w-full rounded-lg object-cover ring-1 ring-border/70"
            />
          ) : null}
        </div>
      </button>

      {isInternalLink || isExternalLink ? (
        <div className="flex items-center justify-end border-t border-border/55 px-3.5 py-2">
          {isInternalLink ? (
            <Link
              to={linkUrl}
              onClick={onNavigateLink}
              className="inline-flex items-center gap-1 text-xs font-semibold text-foreground transition-opacity hover:opacity-80"
            >
              <span>查看详情</span>
              <ArrowUpRight className="size-3.5" />
            </Link>
          ) : (
            <a
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onNavigateLink}
              className="inline-flex items-center gap-1 text-xs font-semibold text-foreground transition-opacity hover:opacity-80"
            >
              <span>查看详情</span>
              <ArrowUpRight className="size-3.5" />
            </a>
          )}
        </div>
      ) : null}
    </div>
  );
}
