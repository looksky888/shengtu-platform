"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { format, parse, subDays } from "date-fns";
import { CalendarIcon, LoaderCircle, X } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const LazyCalendar = lazy(() =>
  import("@/components/ui/calendar").then((module) => ({ default: module.Calendar })),
);

type DateRangeFilterProps = {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
  className?: string;
};

export function DateRangeFilter({ startDate, endDate, onChange, className }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [numberOfMonths, setNumberOfMonths] = useState(1);
  const selected: DateRange | undefined = startDate
    ? {
        from: parse(startDate, "yyyy-MM-dd", new Date()),
        to: endDate ? parse(endDate, "yyyy-MM-dd", new Date()) : undefined,
      }
    : undefined;

  const hasSelection = Boolean(startDate || endDate);
  const label = startDate ? `${startDate} 至 ${endDate || startDate}` : "选择日期范围";

  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    const updateNumberOfMonths = () => setNumberOfMonths(query.matches ? 2 : 1);

    updateNumberOfMonths();
    query.addEventListener("change", updateNumberOfMonths);
    return () => query.removeEventListener("change", updateNumberOfMonths);
  }, []);

  const applyQuickRange = (daysBack: number) => {
    const today = new Date();
    const from = daysBack <= 0 ? today : subDays(today, daysBack);
    onChange(format(from, "yyyy-MM-dd"), format(today, "yyyy-MM-dd"));
    setOpen(false);
  };

  const clearRange = () => {
    onChange("", "");
    setOpen(false);
  };

  return (
    <Field className={cn("w-full sm:w-[240px]", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <div className="relative flex w-full items-center">
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-9 w-full min-w-0 justify-start rounded-lg px-3 font-normal tabular-nums dark:border-border dark:bg-background/70 dark:text-foreground dark:hover:bg-accent/60",
                hasSelection && "pr-8",
              )}
            >
              <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{label}</span>
            </Button>
          </PopoverTrigger>
          {hasSelection ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onChange("", "");
              }}
              aria-label="清空日期筛选"
              title="清空日期筛选"
              className="absolute right-1.5 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <PopoverContent
          className="elevated-shadow w-[min(calc(100vw-1.5rem),20.5rem)] border-border bg-popover p-2 dark:border-border dark:bg-card sm:w-auto sm:max-w-none sm:p-3"
          align="center"
          collisionPadding={12}
          sideOffset={8}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5 border-b border-border/70 pb-2">
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => applyQuickRange(0)}
                className="rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-foreground transition hover:bg-surface-hover"
              >
                今天
              </button>
              <button
                type="button"
                onClick={() => applyQuickRange(6)}
                className="rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-foreground transition hover:bg-surface-hover"
              >
                近 7 天
              </button>
              <button
                type="button"
                onClick={() => applyQuickRange(29)}
                className="rounded-md bg-surface-muted px-2 py-1 text-xs font-medium text-foreground transition hover:bg-surface-hover"
              >
                近 30 天
              </button>
            </div>
            {hasSelection ? (
              <button
                type="button"
                onClick={clearRange}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-surface-hover hover:text-foreground"
              >
                清空
              </button>
            ) : null}
          </div>
          {open ? (
            <Suspense
              fallback={
                <div className="flex h-64 w-64 items-center justify-center text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                </div>
              }
            >
              <LazyCalendar
                mode="range"
                defaultMonth={selected?.from}
                selected={selected}
                onSelect={(value) =>
                  onChange(
                    value?.from ? format(value.from, "yyyy-MM-dd") : "",
                    value?.to ? format(value.to, "yyyy-MM-dd") : "",
                  )
                }
                numberOfMonths={numberOfMonths}
              />
            </Suspense>
          ) : null}
        </PopoverContent>
      </Popover>
    </Field>
  );
}
