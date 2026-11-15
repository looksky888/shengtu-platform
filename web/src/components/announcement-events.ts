import webConfig from "@/constants/common-env";
import {
  fetchVisibleAnnouncements,
  type Announcement,
  type AnnouncementTarget,
} from "@/lib/api";
import { AUTH_SESSION_CHANGE_EVENT } from "@/lib/auth-session-events";

const announcementsCache = new Map<
  AnnouncementTarget,
  { items: Announcement[]; fetchedAt: number }
>();
const announcementsInFlight = new Map<
  AnnouncementTarget,
  Promise<Announcement[]>
>();
const ANNOUNCEMENTS_CACHE_TTL_MS = 15_000;
let announcementsCacheGeneration = 0;

function clearAnnouncementsCache() {
  announcementsCacheGeneration += 1;
  announcementsCache.clear();
  announcementsInFlight.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_SESSION_CHANGE_EVENT, clearAnnouncementsCache);
}

type StreamHub = {
  source: EventSource;
  listeners: Set<(items?: Announcement[]) => void>;
};

const targetStreams = new Map<AnnouncementTarget, StreamHub>();

function buildAnnouncementEventsUrl(target: AnnouncementTarget): string {
  const base = webConfig.apiUrl.replace(/\/$/, "");
  return `${base}/api/announcements/events?target=${encodeURIComponent(target)}`;
}

export function subscribeAnnouncementEvents(
  target: AnnouncementTarget,
  onUpdate: (items?: Announcement[]) => void,
): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }

  let hub = targetStreams.get(target);
  if (!hub) {
    const source = new EventSource(buildAnnouncementEventsUrl(target), {
      withCredentials: true,
    });
    const listeners = new Set<(items?: Announcement[]) => void>();
    const dispatchInvalidate = () => {
      announcementsCache.delete(target);
      listeners.forEach((listener) => listener());
    };
    const handleMessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(String(event.data || "{}")) as {
          items?: Announcement[];
        };
        if (Array.isArray(parsed.items)) {
          announcementsCache.set(target, {
            items: parsed.items,
            fetchedAt: Date.now(),
          });
          listeners.forEach((listener) => listener(parsed.items));
          return;
        }
      } catch {
        // Fall through to cache invalidation if payload is non-JSON.
      }
      dispatchInvalidate();
    };
    source.addEventListener("message", handleMessage);
    source.addEventListener("announcement_updated", dispatchInvalidate);
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

export function loadSharedAnnouncements(
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
  if (existing) return existing;
  const generation = announcementsCacheGeneration;
  const req = fetchVisibleAnnouncements(target)
    .then((data) => {
      const items = Array.isArray(data.items) ? data.items : [];
      if (generation === announcementsCacheGeneration) {
        announcementsCache.set(target, { items, fetchedAt: Date.now() });
      }
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
