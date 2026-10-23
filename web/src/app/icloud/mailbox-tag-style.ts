import type { ICloudMailbox, ICloudMailboxTagColor } from "@/lib/icloud-api";

const cardClass: Record<ICloudMailboxTagColor, string> = {
  slate: "border-l-4 border-l-zinc-400 bg-surface-muted/40",
  blue: "border-l-4 border-l-indigo-500 bg-indigo-500/[0.04]",
  green: "border-l-4 border-l-emerald-500 bg-emerald-500/[0.04]",
  amber: "border-l-4 border-l-amber-500 bg-amber-500/[0.04]",
  red: "border-l-4 border-l-rose-500 bg-rose-500/[0.04]",
  violet: "border-l-4 border-l-fuchsia-500 bg-fuchsia-500/[0.04]",
};

function tagColor(value?: string): ICloudMailboxTagColor {
  return value && value in cardClass ? (value as ICloudMailboxTagColor) : "blue";
}

export function mailboxTagCardClass(mailbox: ICloudMailbox) {
  return mailbox.tag ? cardClass[tagColor(mailbox.tag_color)] : "";
}
