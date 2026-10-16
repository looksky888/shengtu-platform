import type { ICloudMailbox, ICloudMailboxTagColor } from "@/lib/icloud-api";

const cardClass: Record<ICloudMailboxTagColor, string> = {
  slate: "border-l-4 border-l-slate-400 bg-slate-50/60 dark:bg-slate-950/20",
  blue: "border-l-4 border-l-blue-500 bg-blue-50/60 dark:bg-blue-950/20",
  green: "border-l-4 border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20",
  amber: "border-l-4 border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20",
  red: "border-l-4 border-l-rose-500 bg-rose-50/60 dark:bg-rose-950/20",
  violet: "border-l-4 border-l-violet-500 bg-violet-50/60 dark:bg-violet-950/20",
};

function tagColor(value?: string): ICloudMailboxTagColor {
  return value && value in cardClass ? (value as ICloudMailboxTagColor) : "blue";
}

export function mailboxTagCardClass(mailbox: ICloudMailbox) {
  return mailbox.tag ? cardClass[tagColor(mailbox.tag_color)] : "";
}
