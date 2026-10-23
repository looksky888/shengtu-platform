import { Image as ImageIcon, MessageCircle } from "lucide-react";

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
    <div className="inline-flex h-7.5 shrink-0 items-center rounded-lg bg-surface-muted/95 p-0.5 text-xs font-medium text-muted-foreground">
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
              "inline-flex h-6.5 items-center justify-center gap-1 rounded-md px-2.5 transition-all",
              active
                ? "bg-surface font-semibold text-foreground shadow-2xs ring-1 ring-black/[0.04] dark:bg-zinc-800 dark:ring-white/[0.08]"
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
  );
}
