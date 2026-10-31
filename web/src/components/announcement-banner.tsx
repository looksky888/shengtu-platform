"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import webConfig from "@/constants/common-env";
import {
  fetchVisibleAnnouncements,
  type Announcement,
  type AnnouncementTarget,
} from "@/lib/api";

import { AnnouncementDialog } from "./announcement-dialog";
import { AnnouncementPopover } from "./announcement-popover";
import {
  hasUnseenBroadcast,
  isAnnouncementMutedToday,
  markBroadcastSeen,
  muteStorageKey,
  todayKey,
} from "./announcement-utils";

const announcementsCache = new Map<
  AnnouncementTarget,
  { items: Announcement[]; fetchedAt: number }
>();
const announcementsInFlight = new Map<
  AnnouncementTarget,
  Promise<Announcement[]>
>();
const ANNOUNCEMENTS_CACHE_TTL_MS = 15_000;

type StreamHub = {
  source: EventSource;
  listeners: Set<() => void>;
};

const targetStreams = new Map<AnnouncementTarget, StreamHub>();

function buildAnnouncementEventsUrl(target: AnnouncementTarget): string {
  const base = webConfig.apiUrl.replace(/\/$/, "");
  return `${base}/api/announcements/events?target=${encodeURIComponent(target)}`;
}

function subscribeAnnouncementEvents(
  target: AnnouncementTarget,
  onUpdate: () => void,
): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }

  let hub = targetStreams.get(target);
  if (!hub) {
    const source = new EventSource(buildAnnouncementEventsUrl(target), {
      withCredentials: true,
    });
    const listeners = new Set<() => void>();
    const dispatch = () => {
      announcementsCache.delete(target);
      listeners.forEach((listener) => listener());
    };
    source.addEventListener("announcement_updated", dispatch);
    hub = { source, listeners };
    targetStreams.set(target, hub);
  }

  hub.listeners.add(onUpdate);

  return () => {
    const currentHub = targetStreams.get(target);
    if (!currentHub) return;
    currentHub.listeners.delete(onUpdate);
    if (currentHub.listeners.size === 0) {
      currentHub.source.close();
      targetStreams.delete(target);
    }
  };
}

function loadSharedAnnouncements(
  target: AnnouncementTarget,
  options: { force?: boolean } = {},
): Promise<Announcement[]> {
  if (options.force) {
    announcementsCache.delete(target);
  } else {
    const cached = announcementsCache.get(target);
    if (cached && Date.now() - cached.fetchedAt < ANNOUNCEMENTS_CACHE_TTL_MS) {
      return Promise.resolve(cached.items);
    }
  }
  const existing = announcementsInFlight.get(target);
  if (existing && !options.force) return existing;
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
  const didAutoOpenStandardRef = useRef(false);

  const activeAnnouncement = useMemo(
    () =>
      announcements.find((item) => item.id === activeAnnouncementId) ?? null,
    [activeAnnouncementId, announcements],
  );
  const activeIndex = activeAnnouncement
    ? announcements.findIndex((item) => item.id === activeAnnouncement.id)
    : -1;

  useEffect(() => {
    let active = true;
    const refresh = (force = false) => {
      loadSharedAnnouncements(target, { force })
        .then((items) => {
          if (active) setAnnouncements(items);
        })
        .catch(() => {
          if (active && !force) setAnnouncements([]);
        });
    };

    refresh(false);
    const unsubscribeStream = subscribeAnnouncementEvents(target, () =>
      refresh(true),
    );
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refresh(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      unsubscribeStream();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [target]);

  useEffect(() => {
    didAutoOpenStandardRef.current = false;
  }, [pathname, target]);

  useEffect(() => {
    if (!autoOpen || pathname.startsWith("/settings") || announcements.length === 0) {
      return;
    }

    const today = todayKey();
    const shouldAutoOpenStandard =
      target === "login" ||
      (target === "image" &&
        (pathname.startsWith("/image") || pathname.startsWith("/video")));

    // 1. Check urgent/live broadcast items across ALL user pages (/image, /video, /gallery, /recharge, /login, etc.)
    const broadcastIds: string[] = [];
    for (const item of announcements) {
      if (
        hasUnseenBroadcast(item) &&
        !isAnnouncementMutedToday(item, today)
      ) {
        markBroadcastSeen(item);
        broadcastIds.push(item.id);
      }
    }

    // 2. Check standard entry popup once per route entry on /login, /image, /video
    const standardIds: string[] = [];
    if (shouldAutoOpenStandard && !didAutoOpenStandardRef.current) {
      didAutoOpenStandardRef.current = true;
      for (const item of announcements) {
        if (!isAnnouncementMutedToday(item, today)) {
          if (item.last_broadcast_at) {
            markBroadcastSeen(item);
          }
          if (!broadcastIds.includes(item.id)) {
            standardIds.push(item.id);
          }
        }
      }
    }

    const incoming = [...broadcastIds, ...standardIds];
    if (incoming.length === 0) return;

    setAutoQueue((prevQueue) => {
      const merged = [...prevQueue];
      for (const id of incoming) {
        if (!merged.includes(id)) {
          merged.push(id);
        }
      }
      setActiveAnnouncementId((prevActive) => prevActive || merged[0] || "");
      return merged;
    });
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
    const nextQueue = activeAnnouncement
      ? autoQueue.filter((id) => id !== activeAnnouncement.id)
      : autoQueue;
    setAutoQueue(nextQueue);
    setActiveAnnouncementId(nextQueue[0] || "");
  };

  if (announcements.length === 0) return null;

  return (
    <>
      <AnnouncementPopover
        announcements={announcements}
        className={className}
        onOpenAnnouncement={openAnnouncement}
      />
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
    announcements.forEach((item) => {
      window.localStorage.setItem(
        muteStorageKey(item.id, item.popup_version),
        today,
      );
      if (item.last_broadcast_at) {
        markBroadcastSeen(item);
      }
    });
  } catch {
    // ignore storage failures
  }
}
