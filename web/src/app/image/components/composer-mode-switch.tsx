import { Film, Image as ImageIcon, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";

import { preloadRoute } from "@/app/route-prefetch";
import { cn } from "@/lib/utils";

type ComposerModeSwitchProps = {
  composerMode: "chat" | "image";
  onComposerModeChange: (mode: "chat" | "image") => void;
};

export function ComposerModeSwitch({
  composerMode,
  onComposerModeChange,
}: ComposerModeSwitchProps) {
  return (
    <div className="inline-flex shrink-0 items-center gap-1">
      <div className="inline-flex h-8 shrink-0 items-center rounded-full bg-surface-muted/85 p-0.5 text-xs font-medium text-muted-foreground dark:bg-white/[0.06]">
        {[
          { value: "image" as const, label: "生图", icon: ImageIcon },
          { value: "chat" as const, label: "对话", icon: MessageCircle },
        ].map((option) => {
          const Icon = option.icon;
          const active = composerMode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={cn(
                "inline-flex h-7 items-center justify-center gap-1 rounded-full px-2.5 transition-all",
                active
                  ? "bg-surface font-semibold text-foreground shadow-2xs ring-1 ring-black/[0.04] dark:bg-white/[0.14] dark:ring-white/[0.08]"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onComposerModeChange(option.value)}
              aria-pressed={active}
              aria-label={option.label}
              title={option.label}
            >
              <Icon className="size-3.5" />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>

      <Link
        to="/video"
        onMouseEnter={() => preloadRoute("/video")}
        title="切换到视频创作工作台"
        className="hidden h-8 shrink-0 items-center gap-1 rounded-full bg-transparent px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-muted/80 hover:text-foreground sm:inline-flex dark:hover:bg-white/[0.06]"
      >
        <Film className="size-3.5" />
        <span>视频创作</span>
      </Link>
    </div>
  );
}
