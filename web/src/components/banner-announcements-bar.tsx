"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  ChevronLeft,
  ChevronRight,
  Gift,
  Sparkles,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";

import type {
  Announcement,
  AnnouncementBannerTone,
  AnnouncementTarget,
} from "@/lib/api";
import { cn } from "@/lib/utils";

import {
  loadSharedAnnouncements,
  subscribeAnnouncementEvents,
} from "./announcement-banner";

const DISMISSED_BANNERS_STORAGE_KEY = "shengtu:v6:dismissed-banners";
const BANNER_ROTATE_INTERVAL_MS = 4500;

export const BANNER_TONE_META: Record<
  AnnouncementBannerTone,
  {
    label: string;
    cssVar: string;
    darkHex: string;
    lightHex: string;
    icon: typeof Bell;
  }
> = {
  notice: {
    label: "通知",
    cssVar: "var(--banner-notice-bg, #3f4590)",
    darkHex: "#3f4590",
    lightHex: "#5c67e2",
    icon: Bell,
  },
  activity: {
    label: "活动",
    cssVar: "var(--banner-activity-bg, #7b3552)",
    darkHex: "#7b3552",
    lightHex: "#da2470",
    icon: Gift,
  },
  update: {
    label: "更新",
    cssVar: "var(--banner-update-bg, #235450)",
    darkHex: "#235450",
    lightHex: "#138279",
    icon: Sparkles,
  },
  warning: {
    label: "预警",
    cssVar: "var(--banner-warning-bg, #6a4424)",
    darkHex: "#6a4424",
    lightHex: "#b55b0c",
    icon: AlertTriangle,
  },
};

export function normalizeBannerTone(
  raw?: string | null,
): AnnouncementBannerTone {
  if (raw === "activity" || raw === "update" || raw === "warning") {
    return raw;
  }
  return "notice";
}

export function buildBannerSnapshotKey(item: Announcement): string {
  const version = item.popup_version ?? 1;
  const tone = normalizeBannerTone(item.banner_tone);
  return [
    item.id,
    String(version),
    item.title || "",
    item.content || "",
    tone,
    item.link_url || "",
    item.last_broadcast_at || "",
  ].join("|");
}

export function filterVisibleBannerAnnouncements(
  items: Announcement[],
  dismissedSnapshots: ReadonlySet<string>,
): Announcement[] {
  return items.filter(
    (item) =>
      item.display_mode === "banner" &&
      item.enabled !== false &&
      Boolean((item.content || item.title || "").trim()) &&
      !dismissedSnapshots.has(buildBannerSnapshotKey(item)),
  );
}

function readDismissedBanners(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_BANNERS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((item): item is string => typeof item === "string"));
    }
  } catch {
    // ignore storage errors
  }
  return new Set();
}

function writeDismissedBanners(set: ReadonlySet<string>) {
  if (typeof window === "undefined") return;
  try {
    const recent = Array.from(set).slice(-64);
    window.localStorage.setItem(
      DISMISSED_BANNERS_STORAGE_KEY,
      JSON.stringify(recent),
    );
  } catch {
    // ignore storage errors
  }
}

export function BannerAnnouncementsBar({
  target = "image",
  className,
}: {
  target?: AnnouncementTarget;
  className?: string;
}) {
  const [allItems, setAllItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() =>
    readDismissedBanners(),
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let mounted = true;
    const refresh = (force = false) => {
      loadSharedAnnouncements(target, { force })
        .then((items) => {
          if (mounted) setAllItems(items);
        })
        .catch(() => {
          if (mounted && !force) setAllItems([]);
        });
    };

    refresh(false);
    const unsubscribe = subscribeAnnouncementEvents(target, (pushed) => {
      if (pushed && mounted) {
        setAllItems(pushed);
        return;
      }
      refresh(true);
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refresh(true);
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      mounted = false;
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [target]);

  const banners = useMemo(
    () => filterVisibleBannerAnnouncements(allItems, dismissed),
    [allItems, dismissed],
  );

  const safeIndex = banners.length > 0 ? index % banners.length : 0;

  useEffect(() => {
    if (banners.length <= 1 || paused) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % banners.length);
    }, BANNER_ROTATE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [banners.length, paused]);

  if (banners.length === 0) return null;

  const active = banners[safeIndex];
  const tone = normalizeBannerTone(active.banner_tone);
  const meta = BANNER_TONE_META[tone];
  const Icon = meta.icon;
  const linkUrl = (active.link_url || "").trim();
  const isInternalLink = linkUrl.startsWith("/") && !linkUrl.startsWith("//");
  const isExternalLink = /^https?:\/\//i.test(linkUrl);

  const headline =
    active.title && active.title !== "公告" && active.title !== active.content
      ? `${active.title} · ${active.content}`
      : active.content || active.title;

  const handleDismiss = () => {
    const key = buildBannerSnapshotKey(active);
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(key);
      writeDismissedBanners(next);
      return next;
    });
  };

  const innerContent = (
    <span className="inline-flex min-w-0 items-center gap-2 text-xs font-medium leading-5 text-white">
      <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-white/16 px-2 text-[11px] font-semibold tracking-wide text-white">
        <Icon className="size-3 shrink-0" />
        <span>{meta.label}</span>
      </span>
      <span className="truncate">{headline}</span>
      {(isInternalLink || isExternalLink) && (
        <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold underline decoration-white/60 underline-offset-3">
          <span>查看详情</span>
          <ArrowUpRight className="size-3.5" />
        </span>
      )}
    </span>
  );

  return (
    <div
      role="region"
      aria-label="站点顶部通知横幅"
      style={{ backgroundColor: meta.cssVar }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "relative z-40 border-b border-black/10 text-white transition-colors duration-300 dark:border-white/10",
        className,
      )}
    >
      <div className="mx-auto flex min-h-9 max-w-[1600px] items-center justify-between gap-2 px-3 py-1 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center justify-center">
          {isInternalLink ? (
            <Link
              to={linkUrl}
              className="flex min-w-0 max-w-full items-center rounded-md px-1.5 py-0.5 transition-opacity hover:opacity-90"
            >
              {innerContent}
            </Link>
          ) : isExternalLink ? (
            <a
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 max-w-full items-center rounded-md px-1.5 py-0.5 transition-opacity hover:opacity-90"
            >
              {innerContent}
            </a>
          ) : (
            <div className="flex min-w-0 max-w-full items-center px-1.5 py-0.5">
              {innerContent}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {banners.length > 1 ? (
            <div className="flex items-center gap-0.5 rounded-full bg-black/15 px-1.5 py-0.5 text-[11px] tabular-nums text-white/90">
              <button
                type="button"
                aria-label="上一条横幅"
                onClick={() =>
                  setIndex((prev) => (prev - 1 + banners.length) % banners.length)
                }
                className="rounded p-0.5 hover:bg-white/15"
              >
                <ChevronLeft className="size-3" />
              </button>
              <span className="px-1">
                {safeIndex + 1}/{banners.length}
              </span>
              <button
                type="button"
                aria-label="下一条横幅"
                onClick={() => setIndex((prev) => (prev + 1) % banners.length)}
                className="rounded p-0.5 hover:bg-white/15"
              >
                <ChevronRight className="size-3" />
              </button>
            </div>
          ) : null}
          <button
            type="button"
            aria-label="关闭当前横幅通知"
            title="不再显示此条横幅"
            onClick={handleDismiss}
            className="inline-flex size-6 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/15 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
