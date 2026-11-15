"use client";

import type { AnnouncementBannerTone } from "@/lib/api";

import { BANNER_TONES, getBannerToneMeta } from "./announcement-helpers";

export function BannerTonePreviewStrip() {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {BANNER_TONES.map((tone) => (
        <div
          key={tone.value}
          className="flex items-center justify-between rounded-lg px-3 py-2 text-white shadow-2xs"
          style={{ backgroundColor: tone.cssVar }}
        >
          <div className="min-w-0">
            <div className="text-[12px] font-semibold">{tone.label}</div>
            <div className="truncate text-[11px] text-white/85">{tone.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function BannerToneBadge({
  tone,
}: {
  tone: AnnouncementBannerTone | undefined;
}) {
  const toneMeta = getBannerToneMeta(tone);
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium text-white"
      style={{ backgroundColor: toneMeta.cssVar }}
    >
      {toneMeta.shortLabel}
    </span>
  );
}

export function BannerLivePreviewBar({
  tone,
  title,
  content,
}: {
  tone: AnnouncementBannerTone;
  title: string;
  content: string;
}) {
  const toneMeta = getBannerToneMeta(tone);
  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();

  return (
    <div className="space-y-1.5">
      <span className="text-[12px] font-medium text-foreground">
        实时效果预览
      </span>
      <div
        className="flex min-h-9 items-center justify-center rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-white shadow-2xs"
        style={{ backgroundColor: toneMeta.cssVar }}
      >
        <span className="truncate">
          {trimmedTitle
            ? `${trimmedTitle} · ${trimmedContent || "在此输入横幅通知内容"}`
            : trimmedContent || "在此输入横幅通知内容"}
        </span>
      </div>
    </div>
  );
}
