"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import type {
  Announcement,
  AnnouncementTarget,
} from "@/lib/api";

import { AnnouncementDialog } from "./announcement-dialog";
import {
  loadSharedAnnouncements,
  subscribeAnnouncementEvents,
} from "./announcement-events";
import { AnnouncementPopover } from "./announcement-popover";
import {
  hasUnseenBroadcast,
  isAnnouncementMutedToday,
  markBroadcastSeen,
  muteStorageKey,
  todayKey,
} from "./announcement-utils";

const ADMIN_POPUP_MUTED_ROUTE_PREFIXES = [
  "/admin",
  "/settings",
  "/overview",
  "/task-queue",
  "/accounts",
  "/icloud",
  "/users",
  "/credits-admin",
  "/payment-admin",
  "/rbac",
  "/logs",
] as const;

function isAdminPopupMutedRoute(pathname: string): boolean {
  return ADMIN_POPUP_MUTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// Singleton auto-open owner per target so multiple mounted AnnouncementNotifications
// (e.g. desktop rail + mobile header) can never stack duplicate modal dialogs.
const autoOpenOwners = new Map<AnnouncementTarget, symbol>();
const autoOpenWaiters = new Map<AnnouncementTarget, Set<() => void>>();

function notifyAutoOpenWaiters(target: AnnouncementTarget) {
  const set = autoOpenWaiters.get(target);
  if (!set) return;
  set.forEach((listener) => listener());
}

export function AnnouncementNotifications({
  target,
  className,
  autoOpen = true,
  triggerless = false,
}: {
  target: AnnouncementTarget;
  className?: string;
  autoOpen?: boolean;
  triggerless?: boolean;
}) {
  const location = useLocation();
  const pathname = location.pathname;
  const [rawAnnouncements, setRawAnnouncements] = useState<Announcement[]>([]);
  const [activeAnnouncementId, setActiveAnnouncementId] = useState("");
  const [autoQueue, setAutoQueue] = useState<string[]>([]);
  const [ownerEpoch, setOwnerEpoch] = useState(0);
  const didAutoOpenStandardRef = useRef(false);
  const instanceIdRef = useRef<symbol | null>(null);
  if (instanceIdRef.current === null) {
    instanceIdRef.current = Symbol("announcement-notifications");
  }
  const instanceId = instanceIdRef.current;

  // All active announcements (both modal and banner) stay accessible in the bell popover,
  // even after a user dismisses BannerAnnouncementsBar with X.
  const visibleAnnouncements = useMemo(
    () =>
      rawAnnouncements.filter(
        (item) =>
          item.enabled !== false &&
          Boolean((item.content || item.title || "").trim()),
      ),
    [rawAnnouncements],
  );

  // Only non-banner announcements participate in automatic modal popups.
  const modalAnnouncements = useMemo(
    () =>
      visibleAnnouncements.filter((item) => item.display_mode !== "banner"),
    [visibleAnnouncements],
  );

  const activeAnnouncement = useMemo(
    () =>
      visibleAnnouncements.find((item) => item.id === activeAnnouncementId) ??
      null,
    [activeAnnouncementId, visibleAnnouncements],
  );
  const activeIndex = activeAnnouncement
    ? visibleAnnouncements.findIndex(
        (item) => item.id === activeAnnouncement.id,
      )
    : -1;

  useEffect(() => {
    if (!autoOpen) {
      if (autoOpenOwners.get(target) === instanceId) {
        autoOpenOwners.delete(target);
        notifyAutoOpenWaiters(target);
      }
      return;
    }

    let waiters = autoOpenWaiters.get(target);
    if (!waiters) {
      waiters = new Set();
      autoOpenWaiters.set(target, waiters);
    }
    const handleOwnerReleased = () => setOwnerEpoch((prev) => prev + 1);
    waiters.add(handleOwnerReleased);

    if (!autoOpenOwners.has(target)) {
      autoOpenOwners.set(target, instanceId);
    }

    return () => {
      const currentWaiters = autoOpenWaiters.get(target);
      if (currentWaiters) {
        currentWaiters.delete(handleOwnerReleased);
        if (currentWaiters.size === 0) {
          autoOpenWaiters.delete(target);
        }
      }
      if (autoOpenOwners.get(target) === instanceId) {
        autoOpenOwners.delete(target);
        notifyAutoOpenWaiters(target);
      }
    };
  }, [autoOpen, instanceId, target]);

  useEffect(() => {
    let active = true;
    const refresh = (force = false) => {
      loadSharedAnnouncements(target, { force })
        .then((items) => {
          if (active) setRawAnnouncements(items);
        })
        .catch(() => {
          if (active && !force) setRawAnnouncements([]);
        });
    };

    refresh(false);
    const unsubscribeStream = subscribeAnnouncementEvents(target, (pushed) => {
      if (pushed && active) {
        setRawAnnouncements(pushed);
        return;
      }
      refresh(true);
    });
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
    const isAdminRoute = isAdminPopupMutedRoute(pathname);
    const isAutoOpenOwner =
      autoOpen &&
      (autoOpenOwners.get(target) === instanceId ||
        (!autoOpenOwners.has(target) &&
          (autoOpenOwners.set(target, instanceId), true)));
    if (!isAutoOpenOwner || isAdminRoute || modalAnnouncements.length === 0) {
      return;
    }

    const today = todayKey();
    const shouldAutoOpenStandard =
      target === "login" ||
      (target === "image" &&
        (pathname.startsWith("/image") || pathname.startsWith("/video")));

    // 1. Check urgent/live broadcast items across ALL user pages (/image, /video, /gallery, /recharge, /login, etc.)
    const broadcastIds: string[] = [];
    for (const item of modalAnnouncements) {
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
      for (const item of modalAnnouncements) {
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
      return merged;
    });
  }, [autoOpen, instanceId, modalAnnouncements, ownerEpoch, pathname, target]);

  useEffect(() => {
    if (!activeAnnouncementId && autoQueue.length > 0) {
      setActiveAnnouncementId(autoQueue[0]);
    }
  }, [activeAnnouncementId, autoQueue]);

  const openAnnouncement = (announcementId: string) => {
    setAutoQueue([]);
    setActiveAnnouncementId(announcementId);
  };

  const closeAndMaybeOpenNext = (muteCurrent = false, muteAll = false) => {
    if (muteAll) {
      muteAnnouncementsForToday(
        modalAnnouncements.length > 0 ? modalAnnouncements : visibleAnnouncements,
      );
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

  if (triggerless) {
    if (!activeAnnouncement) return null;
    return (
      <AnnouncementDialog
        activeAnnouncement={activeAnnouncement}
        activeIndex={activeIndex}
        totalCount={visibleAnnouncements.length}
        autoQueueLength={autoQueue.length}
        onClose={closeAndMaybeOpenNext}
      />
    );
  }

  if (visibleAnnouncements.length === 0) return null;

  return (
    <>
      <AnnouncementPopover
        announcements={visibleAnnouncements}
        className={className}
        onOpenAnnouncement={openAnnouncement}
      />
      <AnnouncementDialog
        activeAnnouncement={activeAnnouncement}
        activeIndex={activeIndex}
        totalCount={visibleAnnouncements.length}
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
