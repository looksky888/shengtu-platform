"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { fetchVisibleAnnouncements, type Announcement, type AnnouncementTarget } from "@/lib/api";

import { AnnouncementDialog } from "./announcement-dialog";
import { AnnouncementPopover } from "./announcement-popover";
import { muteStorageKey, todayKey } from "./announcement-utils";

const announcementsCache = new Map<AnnouncementTarget, { items: Announcement[]; fetchedAt: number }>();
const announcementsInFlight = new Map<AnnouncementTarget, Promise<Announcement[]>>();
const ANNOUNCEMENTS_CACHE_TTL_MS = 15_000;

function loadSharedAnnouncements(target: AnnouncementTarget): Promise<Announcement[]> {
  const cached = announcementsCache.get(target);
  if (cached && Date.now() - cached.fetchedAt < ANNOUNCEMENTS_CACHE_TTL_MS) {
    return Promise.resolve(cached.items);
  }
  const existing = announcementsInFlight.get(target);
  if (existing) return existing;
  const req = fetchVisibleAnnouncements(target)
    .then((data) => {
      const items = Array.isArray(data.items) ? data.items : [];
      announcementsCache.set(target, { items, fetchedAt: Date.now() });
      return items;
    })
    .finally(() => {
      if (announcementsInFlight.get(target) === req) {
        announcementsInFlight.delete(target);
      }
    });
  announcementsInFlight.set(target, req);
  return req;
}

export function AnnouncementNotifications({
  target,
  className,
  autoOpen = true,
}: {
  target: AnnouncementTarget;
  className?: string;
  autoOpen?: boolean;
}) {
  const location = useLocation();
  const pathname = location.pathname;
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeAnnouncementId, setActiveAnnouncementId] = useState("");
  const [autoQueue, setAutoQueue] = useState<string[]>([]);

  const activeAnnouncement = useMemo(
    () => announcements.find((item) => item.id === activeAnnouncementId) ?? null,
    [activeAnnouncementId, announcements],
  );
  const activeIndex = activeAnnouncement ? announcements.findIndex((item) => item.id === activeAnnouncement.id) : -1;

  useEffect(() => {
    let active = true;
    loadSharedAnnouncements(target)
      .then((items) => {
        if (active) setAnnouncements(items);
      })
      .catch(() => {
        if (active) setAnnouncements([]);
      });
    return () => {
      active = false;
    };
  }, [target]);

  useEffect(() => {
    if (!autoOpen) return;
    const shouldAutoOpen = target === "login" || (target === "image" && pathname.startsWith("/image"));
    if (!shouldAutoOpen || announcements.length === 0) return;
    const today = todayKey();
    const queue = announcements.flatMap((announcement) => {
      try {
        return window.localStorage.getItem(muteStorageKey(announcement.id)) === today ? [] : [announcement.id];
      } catch {
        return [announcement.id];
      }
    });
    setAutoQueue(queue);
    setActiveAnnouncementId(queue[0] || "");
  }, [announcements, autoOpen, pathname, target]);

  const openAnnouncement = (announcementId: string) => {
    setAutoQueue([]);
    setActiveAnnouncementId(announcementId);
  };

  const closeAndMaybeOpenNext = (muteCurrent = false, muteAll = false) => {
    if (muteAll) {
      muteAnnouncementsForToday(announcements);
      setAutoQueue([]);
      setActiveAnnouncementId("");
      return;
    }
    if (muteCurrent && activeAnnouncement) {
      muteAnnouncementsForToday([activeAnnouncement]);
    }
    const nextQueue = activeAnnouncement ? autoQueue.filter((id) => id !== activeAnnouncement.id) : autoQueue;
    setAutoQueue(nextQueue);
    setActiveAnnouncementId(nextQueue[0] || "");
  };

  if (announcements.length === 0) return null;

  return (
    <>
      <AnnouncementPopover announcements={announcements} className={className} onOpenAnnouncement={openAnnouncement} />
      <AnnouncementDialog
        activeAnnouncement={activeAnnouncement}
        activeIndex={activeIndex}
        totalCount={announcements.length}
        autoQueueLength={autoQueue.length}
        onClose={closeAndMaybeOpenNext}
      />
    </>
  );
}

function muteAnnouncementsForToday(announcements: Announcement[]) {
  try {
    const today = todayKey();
    announcements.forEach((item) => window.localStorage.setItem(muteStorageKey(item.id), today));
  } catch {
    // ignore storage failures
  }
}
