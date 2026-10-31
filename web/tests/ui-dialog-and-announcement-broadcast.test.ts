import assert from "node:assert/strict";
import test from "node:test";

import {
  hasUnseenBroadcast,
  isAnnouncementMutedToday,
  legacyMuteStorageKey,
  markBroadcastSeen,
  muteStorageKey,
  seenBroadcastStorageKey,
} from "../src/components/announcement-popup-state.ts";
import { resolveDialogMaxWidthClass } from "../src/components/ui/dialog-width.ts";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) ?? null) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

test("resolveDialogMaxWidthClass lifts 560px clamp for w-[min(...)] wide dialogs", () => {
  assert.equal(resolveDialogMaxWidthClass(), "max-w-[560px]");
  assert.equal(resolveDialogMaxWidthClass("p-4 rounded-xl"), "max-w-[560px]");
  assert.equal(
    resolveDialogMaxWidthClass("max-h-[90dvh] w-[min(96vw,1000px)] p-6"),
    "max-w-none",
  );
  assert.equal(
    resolveDialogMaxWidthClass("w-[min(96vw,960px)] max-w-[960px] p-0"),
    "",
  );
  assert.equal(
    resolveDialogMaxWidthClass("sm:max-w-[680px] p-6"),
    "max-w-[560px]",
  );
});

test("versioned announcement mute and broadcast state bypass older daily mutes on new broadcast", () => {
  const storage = new MemoryStorage();
  const today = "2026-10-31";

  // Legacy unversioned mute is respected for v1 non-broadcast announcements
  storage.setItem(legacyMuteStorageKey("ann-1"), today);
  assert.equal(
    isAnnouncementMutedToday({ id: "ann-1", popup_version: 1 }, today, storage),
    true,
  );

  // Admin triggers live broadcast -> popup_version bumps to 2 and sets last_broadcast_at
  const broadcasted = {
    id: "ann-1",
    popup_version: 2,
    last_broadcast_at: "2026-10-31T04:30:00Z",
  };
  assert.equal(isAnnouncementMutedToday(broadcasted, today, storage), false);
  assert.equal(hasUnseenBroadcast(broadcasted, storage), true);

  // Once popped open via SSE, markBroadcastSeen prevents duplicate popups on page reload
  markBroadcastSeen(broadcasted, storage);
  assert.equal(hasUnseenBroadcast(broadcasted, storage), false);
  assert.equal(
    storage.getItem(seenBroadcastStorageKey("ann-1", 2)),
    "2026-10-31T04:30:00Z",
  );

  // User mutes v2 for today; if admin broadcasts again (v3), v3 pops open again!
  storage.setItem(muteStorageKey("ann-1", 2), today);
  assert.equal(isAnnouncementMutedToday(broadcasted, today, storage), true);

  const reBroadcasted = {
    id: "ann-1",
    popup_version: 3,
    last_broadcast_at: "2026-10-31T05:00:00Z",
  };
  assert.equal(isAnnouncementMutedToday(reBroadcasted, today, storage), false);
  assert.equal(hasUnseenBroadcast(reBroadcasted, storage), true);
});
