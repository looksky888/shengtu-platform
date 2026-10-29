import type { ICloudPendingLogin } from "@/lib/icloud-api";

export type ICloudLoginChannel = "apple" | "icloud";

export type ICloudPendingLoginEntry = ICloudPendingLogin & {
  channel: ICloudLoginChannel;
  apple_id: string;
};

/** A challenge belongs to both the channel and the Apple ID. */
export function iCloudPendingLoginKey(channel: ICloudLoginChannel, appleId: string): string {
  return `${channel}:${appleId.trim().toLowerCase()}`;
}

export function upsertICloudPendingLogin(
  current: Record<string, ICloudPendingLoginEntry>,
  entry: ICloudPendingLoginEntry,
): Record<string, ICloudPendingLoginEntry> {
  return { ...current, [iCloudPendingLoginKey(entry.channel, entry.apple_id)]: entry };
}

export function removeICloudPendingLogin(
  current: Record<string, ICloudPendingLoginEntry>,
  channel: ICloudLoginChannel,
  appleId: string,
): Record<string, ICloudPendingLoginEntry> {
  const next = { ...current };
  delete next[iCloudPendingLoginKey(channel, appleId)];
  return next;
}
