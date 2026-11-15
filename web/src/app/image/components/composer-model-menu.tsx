import { Fragment, type RefObject } from "react";
import { Bot, Check, ChevronDown, Coins } from "lucide-react";

import type { ImageModelOption } from "@/app/image/hooks/use-image-composer-derived";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ImageModel } from "@/lib/api";
import { cn } from "@/lib/utils";

type ComposerModelMenuProps = {
  menuRef?: RefObject<HTMLDivElement | null>;
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
    <div ref={menuRef} className="shrink-0">
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            onClosePeerMenus();
          }
          onOpenChange(nextOpen);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-[#f2f5fa] px-2.5 text-xs font-medium text-foreground/85 transition-colors hover:bg-[#e8eef9] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1456f0]/25 dark:bg-muted/70 dark:hover:bg-muted",
              open && "bg-[#edf4ff] text-[#1456f0] ring-1 ring-[#cfe0ff] dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-500/30",
            )}
            aria-expanded={open}
            aria-label={`选择模型，当前 ${label}`}
            title={`模型：${label}`}
          >
            <Bot className="size-3.5 shrink-0 text-current opacity-80" />
            <span className="max-w-[160px] truncate font-medium">{label}</span>
            <ChevronDown className={cn("size-3.5 shrink-0 opacity-60 transition", open && "rotate-180")} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="z-[80] max-h-[min(45dvh,22rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-[18px] border border-border bg-[#fbfdff] p-1.5 shadow-[0_18px_48px_-12px_rgba(24,40,72,0.14)] sm:w-[324px] dark:bg-card"
        >
          {imageModelOptions.map((option, index) => {
            const active = option.id === imageModelOptionId || (!imageModelOptionId && option.value === imageModel);
            const previousChannel = imageModelOptions[index - 1]?.channelName;
            const showChannel = Boolean(option.channelName && option.channelName !== previousChannel);
            return (
              <Fragment key={option.id}>
                {showChannel ? (
                  <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {option.channelName}
                    {option.channelAlias ? ` · ${option.channelAlias}` : ""}
                  </div>
                ) : null}
                <button
                  type="button"
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs text-muted-foreground transition hover:bg-surface-hover hover:text-foreground",
                    active && "bg-[#edf4ff] font-semibold text-[#1456f0] ring-1 ring-[#cfe0ff] dark:bg-sky-950/50 dark:text-sky-200 dark:ring-sky-500/30",
                  )}
                  onClick={() => {
                    onImageModelChange(option.id);
                    onOpenChange(false);
                  }}
                >
                  <span className="min-w-0 break-words">{option.label}</span>
                  {option.creditCost !== undefined ? (
                    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-800 tabular-nums dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
                      <Coins className="size-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                      {option.creditCost} 积分/张
                    </span>
                  ) : null}
                  {active ? <Check className="size-3.5 shrink-0 text-[#1456f0] dark:text-sky-300" /> : null}
                </button>
              </Fragment>
            );
          })}
        </PopoverContent>
      </Popover>
    </div>
  );
}
