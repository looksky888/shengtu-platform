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
          "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border/75 bg-background px-2.5 text-xs font-medium text-foreground transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          open && "border-primary/40 bg-primary/8 text-primary",
        )}
        onClick={() => {
          onOpenChange(!open);
          onClosePeerMenus();
        }}
        aria-expanded={open}
        aria-label={`选择模型，当前 ${label}`}
        title={`模型：${label}`}
      >
        <Bot className="size-3.5 shrink-0 text-primary" />
        <span className="max-w-[160px] truncate font-medium">{label}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 opacity-60 transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute bottom-[calc(100%+8px)] left-0 z-[80] max-h-[45dvh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border/80 bg-card p-1.5 shadow-xl sm:w-[320px]">
          {imageModelOptions.map((option, index) => {
            const active = option.id === imageModelOptionId || (!imageModelOptionId && option.value === imageModel);
            const previousChannel = imageModelOptions[index - 1]?.channelName;
            const showChannel = Boolean(option.channelName && option.channelName !== previousChannel);
            return (
              <Fragment key={option.id}>
                {showChannel ? (
                  <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {option.channelName}{option.channelAlias ? ` · ${option.channelAlias}` : ""}
                  </div>
                ) : null}
                <button
                  type="button"
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-muted-foreground transition hover:bg-surface-hover hover:text-foreground",
                    active && "bg-primary/10 font-semibold text-primary",
                  )}
                  onClick={() => {
                    onImageModelChange(option.id);
                    onOpenChange(false);
                  }}
                >
                  <span className="min-w-0 break-words">{option.label}</span>
                  {option.creditCost !== undefined ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                      <Info className="size-3" aria-hidden="true" />
                      {option.creditCost} 积分/张
                    </span>
                  ) : null}
                  {active ? <Check className="size-3.5 shrink-0" /> : null}
                </button>
              </Fragment>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
