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
    <div className="inline-flex h-9 shrink-0 items-center rounded-full bg-transparent p-0 text-xs font-medium text-[#45515e] dark:text-muted-foreground sm:h-8 sm:bg-[#f0f0f0] sm:p-0.5 sm:dark:bg-muted/70">
      {[
        { value: "chat" as const, label: "对话", icon: MessageCircle },
        { value: "image" as const, label: "作画", icon: ImageIcon },
      ].map((option) => {
        const Icon = option.icon;
        const active = composerMode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={cn(
              "inline-flex size-9 items-center justify-center gap-1.5 rounded-full transition sm:h-7 sm:w-auto sm:px-2.5",
              active && option.value === "chat"
                ? "bg-[#fff1f7] text-[#ea5ec1] dark:bg-rose-950/30 dark:text-pink-300 sm:bg-white sm:text-[#18181b] sm:shadow-sm sm:dark:bg-background sm:dark:text-foreground"
                : active
                  ? "bg-[#eef4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300 sm:bg-white sm:text-[#18181b] sm:shadow-sm sm:dark:bg-background sm:dark:text-foreground"
                  : "text-[#686b73] hover:bg-black/[0.05] hover:text-[#18181b] dark:text-muted-foreground dark:hover:bg-accent/60 dark:hover:text-foreground sm:text-[#45515e] sm:hover:bg-transparent sm:dark:text-muted-foreground sm:dark:hover:bg-transparent",
            )}
            onClick={() => onComposerModeChange(option.value)}
            aria-pressed={active}
            aria-label={option.label}
            title={option.label}
          >
            <Icon className="size-5 sm:size-3.5" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
