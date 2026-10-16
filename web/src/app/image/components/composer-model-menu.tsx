import { Fragment, type RefObject } from "react";
import { Bot, Check, ChevronDown, Info } from "lucide-react";

import type { ImageModel } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ImageModelOption } from "@/app/image/hooks/use-image-composer-derived";

type ComposerModelMenuProps = {
  menuRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  label: string;
  imageModel: ImageModel;
  imageModelOptionId: string;
  imageModelOptions: ReadonlyArray<ImageModelOption>;
  onOpenChange: (open: boolean) => void;
  onClosePeerMenus: () => void;
  onImageModelChange: (optionId: string) => void;
};

export function ComposerModelMenu({
  menuRef,
  open,
  label,
  imageModel,
  imageModelOptionId,
  imageModelOptions,
  onOpenChange,
  onClosePeerMenus,
  onImageModelChange,
}: ComposerModelMenuProps) {
  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        className={cn(
          "inline-flex size-9 items-center justify-center gap-1.5 rounded-full text-xs font-medium text-[#686b73] transition hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1456f0]/30 dark:text-muted-foreground dark:hover:bg-accent/60 dark:hover:text-foreground sm:h-8 sm:w-[236px] sm:border sm:border-[#e5e7eb] sm:bg-white sm:px-3 sm:text-[#45515e] sm:dark:border-border sm:dark:bg-background/70 sm:dark:text-muted-foreground",
          open &&
            "bg-[#eef4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300 sm:border-[#bfdbfe] sm:bg-[#eef4ff] sm:text-[#1456f0] sm:dark:border-sky-900/70 sm:dark:bg-sky-950/30 sm:dark:text-sky-300",
        )}
        onClick={() => {
          onOpenChange(!open);
          onClosePeerMenus();
        }}
        aria-expanded={open}
        aria-label={`选择模型，当前 ${label}`}
        title={`模型：${label}`}
      >
        <Bot className="size-5 shrink-0 sm:hidden" />
        <span className="hidden shrink-0 sm:inline">模型</span>
        <span className="hidden min-w-0 flex-1 truncate text-left font-semibold sm:inline">{label}</span>
        <ChevronDown className={cn("hidden size-4 shrink-0 opacity-60 transition sm:block", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-[80] max-h-[45dvh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-[20px] border border-[#e5e7eb] bg-white p-1.5 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] dark:border-border dark:bg-card dark:shadow-[0_24px_80px_-28px_rgba(0,0,0,0.72)] sm:bottom-[calc(100%+8px)] sm:w-[340px]">
          {imageModelOptions.map((option, index) => {
            const active = option.id === imageModelOptionId || (!imageModelOptionId && option.value === imageModel);
            const previousChannel = imageModelOptions[index - 1]?.channelName;
            const showChannel = Boolean(option.channelName && option.channelName !== previousChannel);
            return (
              <Fragment key={option.id}>
                {showChannel ? <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{option.channelName}{option.channelAlias ? ` · ${option.channelAlias}` : ""}</div> : null}
                <button
                  type="button"
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-[#45515e] transition hover:bg-black/[0.05] dark:text-muted-foreground dark:hover:bg-accent/60",
                    active && "bg-black/[0.05] font-medium text-[#18181b] dark:bg-accent dark:text-foreground",
                  )}
                  onClick={() => { onImageModelChange(option.id); onOpenChange(false); }}
                >
                  <span className="min-w-0 break-words">{option.label}</span>
                  {option.creditCost !== undefined ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      <Info className="size-3" aria-hidden="true" />
                      {option.creditCost} 积分/张
                    </span>
                  ) : null}
                  {active ? <Check className="size-4 shrink-0" /> : null}
                </button>
              </Fragment>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
