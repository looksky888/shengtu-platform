import { Film, Images, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
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
      layoutId="media-library-scope-tabs"
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

  const items = [
    { value: "image" as const, label: "图片资产", href: "/image-manager", icon: Images },
    { value: "video" as const, label: "视频资产", href: "/video-library", icon: Film },
  ];

  return (
    <div
      role="tablist"
      aria-label="素材类型切换"
      className="inline-flex max-w-full items-center gap-0.5 rounded-xl bg-surface-muted/95 p-1 dark:bg-zinc-900"
    >
      {items.map((item) => {
        const active = current === item.value;
        const Icon = item.icon;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onMouseEnter={() => preloadRoute(item.href)}
            onClick={() => {
              if (!active) navigate(item.href);
            }}
            className={cn(
              "relative inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active ? (
              <motion.span
                layoutId="media-asset-type-pill"
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                className="absolute inset-0 rounded-lg bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_1px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.04] dark:bg-zinc-800 dark:ring-white/[0.08]"
              />
            ) : null}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              <Icon
                className={cn(
                  "size-3.5 shrink-0 transition-colors",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              />
              <span>{item.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
