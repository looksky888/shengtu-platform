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
    <div className="inline-flex h-8 shrink-0 items-center rounded-lg border border-border/75 bg-muted/50 p-0.5 text-xs font-medium text-muted-foreground">
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
              "inline-flex h-7 items-center justify-center gap-1 rounded-md px-2.5 transition-colors",
              active
                ? "bg-card font-semibold text-primary shadow-2xs"
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
