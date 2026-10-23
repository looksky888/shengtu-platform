import type { ReactNode, RefObject } from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type ComposerMenuOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

type ComposerOptionMenuProps<T extends string> = {
  menuRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  label: ReactNode;
  buttonAriaLabel: string;
  value: T;
  valueLabel: string;
  options: ReadonlyArray<ComposerMenuOption<T>>;
  desktopAlign?: "left" | "right";
  desktopWidthClass?: string;
  disabledLabel?: string;
  isOptionDisabled?: (option: ComposerMenuOption<T>) => boolean;
  getOptionKey?: (option: ComposerMenuOption<T>) => string;
  getOptionTitle?: (option: ComposerMenuOption<T>) => string | undefined;
  onToggle: () => void;
  onSelect: (value: T) => void;
};

function ComposerOptionList<T extends string>({
  value,
  options,
  disabledLabel,
  isOptionDisabled,
  getOptionKey,
  getOptionTitle,
  onSelect,
}: Pick<
  ComposerOptionMenuProps<T>,
  "value" | "options" | "disabledLabel" | "isOptionDisabled" | "getOptionKey" | "getOptionTitle" | "onSelect"
>) {
  return (
    <>
      {options.map((option) => {
        const active = option.value === value;
        const disabled = isOptionDisabled?.(option) ?? false;
        return (
          <button
            key={getOptionKey?.(option) ?? option.value}
            type="button"
            disabled={disabled}
            title={getOptionTitle?.(option)}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground transition hover:bg-surface-hover hover:text-foreground",
              active && "bg-surface-muted font-semibold text-foreground ring-1 ring-border/70",
              disabled && "cursor-not-allowed opacity-45 hover:bg-transparent",
            )}
            onClick={() => {
              if (!disabled) {
                onSelect(option.value);
              }
            }}
          >
            <span className="min-w-0">
              <span className="block truncate">{option.label}</span>
              {option.description ? (
                <span className="block truncate text-[11px] font-normal text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </span>
            {disabled && disabledLabel ? (
              <span className="ml-auto shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                {disabledLabel}
              </span>
            ) : null}
            {active ? <Check className="size-3.5 shrink-0 text-foreground" /> : null}
          </button>
        );
      })}
    </>
  );
}

export function ComposerOptionMenu<T extends string>({
  menuRef,
  open,
  label,
  buttonAriaLabel,
  value,
  valueLabel,
  options,
  desktopAlign = "right",
  desktopWidthClass = "w-[min(17rem,calc(100vw-3rem))]",
  disabledLabel,
  isOptionDisabled,
  getOptionKey,
  getOptionTitle,
  onToggle,
  onSelect,
}: ComposerOptionMenuProps<T>) {
  const listProps = { value, options, disabledLabel, isOptionDisabled, getOptionKey, getOptionTitle, onSelect };
  return (
    <>
      <div
        ref={menuRef}
        className="relative flex h-8.5 min-w-0 items-center justify-between gap-1.5 rounded-lg bg-surface-muted/75 px-2.5 text-[11px]"
      >
        <span className="flex shrink-0 items-center gap-1 font-medium text-muted-foreground">
          {label}
        </span>
        <button
          type="button"
          className="flex h-7 min-w-0 flex-1 items-center justify-end gap-1 bg-transparent text-right text-xs font-semibold text-foreground"
          onClick={onToggle}
          aria-label={buttonAriaLabel}
          aria-expanded={open}
        >
          <span className="truncate">{valueLabel}</span>
          <ChevronDown className={cn("size-3.5 shrink-0 opacity-60 transition", open && "rotate-180")} />
        </button>
        {open ? (
          <div
            className={cn(
              "absolute bottom-[calc(100%+0.5rem)] z-[90] hidden max-h-[14rem] overflow-y-auto rounded-xl border border-border/85 bg-surface p-1.5 shadow-lg sm:block",
              desktopAlign === "left" ? "left-0" : "right-0",
              desktopWidthClass,
            )}
          >
            <ComposerOptionList {...listProps} />
          </div>
        ) : null}
      </div>
      {open ? (
        <div
          className="col-span-2 grid max-h-[13rem] overflow-y-auto rounded-xl border border-border/85 bg-surface p-1.5 sm:hidden"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <ComposerOptionList {...listProps} />
        </div>
      ) : null}
    </>
  );
}
