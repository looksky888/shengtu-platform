import type { ImageTurn } from "@/store/image-conversation-types";

/**
 * Single source of truth for "this turn still has work in flight".
 * It drives the studio queue poller **and** the busy badges, so a turn can never be
 * polled as finished while the UI still shows it as running (or the reverse).
 */
export function isTurnBusy(turn: ImageTurn) {
  return turn.status === "queued" || turn.status === "generating" || turn.images.some((image) => image.status === "loading");
}
