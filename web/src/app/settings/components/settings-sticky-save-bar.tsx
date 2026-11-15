"use client";

import { useEffect } from "react";
import { RotateCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SettingsStickySaveBarProps = {
  dirtyCount: number;
  dirtyLabels: readonly string[];
  isSaving: boolean;
  isDiscarding: boolean;
  onSave: () => void;
  onDiscard: () => void;
  className?: string;
};

export function SettingsStickySaveBar({
  dirtyCount,
  dirtyLabels,
  isSaving,
  isDiscarding,
  onSave,
  onDiscard,
  className,
}: SettingsStickySaveBarProps) {
  useEffect(() => {
    if (dirtyCount <= 0) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "s") return;

      event.preventDefault();
      if (!isSaving && !isDiscarding) {
        onSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dirtyCount, isDiscarding, isSaving, onSave]);

  if (dirtyCount <= 0) {
    return null;
  }

  const busy = isSaving || isDiscarding;

  return (
    <div
      role="region"
      aria-label="未保存修改操作栏"
      aria-live="polite"
      className={cn(
        "sticky bottom-4 z-30 animate-in fade-in slide-in-from-bottom-2 duration-200",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-amber-500/35 bg-card/95 px-4 py-2.5 shadow-[0_12px_32px_rgba(15,23,42,0.12)] ring-1 ring-amber-500/15 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-amber-500 ring-4 ring-amber-500/15"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-medium text-foreground">
                当前有 {dirtyCount} 项未保存修改
              </span>
              {dirtyLabels.length > 0 ? (
                <span className="truncate text-xs text-muted-foreground">
                  （{dirtyLabels.join("、")}）
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <kbd className="hidden rounded border border-border/80 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
            Ctrl + S
          </kbd>
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={isDiscarding}
            disabled={busy}
            onClick={onDiscard}
            className="h-8 gap-1.5 rounded-lg px-3 text-xs"
          >
            <RotateCcw className="size-3.5" />
            <span>放弃修改</span>
          </Button>
          <Button
            type="button"
            size="sm"
            loading={isSaving}
            disabled={busy}
            onClick={onSave}
            className="h-8 gap-1.5 rounded-lg px-3.5 text-xs"
          >
            <Save className="size-3.5" />
            <span>保存修改</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
