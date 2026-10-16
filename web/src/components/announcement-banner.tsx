"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchVisibleAnnouncements, type Announcement, type AnnouncementTarget } from "@/lib/api";

import { AnnouncementDialog } from "./announcement-dialog";
import { AnnouncementPopover } from "./announcement-popover";
import { muteStorageKey, todayKey } from "./announcement-utils";

export function AnnouncementNotifications({ target, className }: { target: AnnouncementTarget; className?: string }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeAnnouncementId, setActiveAnnouncementId] = useState("");
  const [autoQueue, setAutoQueue] = useState<string[]>([]);
  const pathname = typeof window === "undefined" ? "" : window.location.pathname;

  const activeAnnouncement = useMemo(
    () => announcements.find((item) => item.id === activeAnnouncementId) ?? null,
    [activeAnnouncementId, announcements],
  );
  const activeIndex = activeAnnouncement ? announcements.findIndex((item) => item.id === activeAnnouncement.id) : -1;

  useEffect(() => {
    let active = true;
    const loadAnnouncements = async () => {
      try {
        const data = await fetchVisibleAnnouncements(target);
        if (active) setAnnouncements(Array.isArray(data.items) ? data.items : []);
      } catch {
        if (active) setAnnouncements([]);
      }
    };
    void loadAnnouncements();
    return () => {
      active = false;
    };
  }, [target]);

  useEffect(() => {
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
  }, [announcements, pathname, target]);

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
