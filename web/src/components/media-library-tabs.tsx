import { Film, Images, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { preloadRoute } from "@/app/route-prefetch";
import { SubNav } from "@/components/ui/sub-nav";
import { cn } from "@/lib/utils";

export function MediaLibraryTabs<T extends string>({
  value,
  label,
  options,
  onChange,
}: {
  value: T;
  label: string;
  options: Array<{ value: T; label: string; icon: LucideIcon; badge?: number | string }>;
  onChange: (value: T) => void;
}) {
  return (
    <SubNav
      ariaLabel={label}
      value={value}
      onValueChange={onChange}
      items={options.map((opt) => ({
        value: opt.value,
        label: opt.label,
        icon: opt.icon,
        badge: opt.badge,
      }))}
    />
  );
}

export function MediaAssetTypeSwitcher({
  current,
}: {
  current: "image" | "video";
}) {
  const navigate = useNavigate();

  return (
    <div
      role="tablist"
      aria-label="素材类型切换"
      className="inline-flex items-center gap-0.5 rounded-[10px] bg-surface-muted/95 p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={current === "image"}
        onMouseEnter={() => preloadRoute("/image-manager")}
        onClick={() => {
          if (current !== "image") navigate("/image-manager");
        }}
        className={cn(
          "inline-flex h-7.5 items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium transition-all",
          current === "image"
            ? "bg-surface font-semibold text-foreground shadow-xs ring-1 ring-black/[0.04] dark:bg-zinc-800/95 dark:ring-white/[0.08]"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Images className="size-3.5" />
        <span>图片资产</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={current === "video"}
        onMouseEnter={() => preloadRoute("/video-library")}
        onClick={() => {
          if (current !== "video") navigate("/video-library");
        }}
        className={cn(
          "inline-flex h-7.5 items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium transition-all",
          current === "video"
            ? "bg-surface font-semibold text-foreground shadow-xs ring-1 ring-black/[0.04] dark:bg-zinc-800/95 dark:ring-white/[0.08]"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Film className="size-3.5" />
        <span>视频资产</span>
      </button>
    </div>
  );
}
