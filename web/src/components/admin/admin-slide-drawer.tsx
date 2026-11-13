"use client";

import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export function AdminSlideDrawer({
  open,
  onOpenChange,
  title,
  description,
  headerExtra,
  footer,
  widthClassName = "w-[min(480px,100vw)]",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/55 backdrop-blur-[1px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "admin-drawer fixed inset-y-0 right-0 z-50 flex h-dvh flex-col outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
            "duration-200",
            widthClassName,
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--admin-border)] bg-[var(--admin-surface)] px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogPrimitive.Title className="text-[14px] font-semibold leading-5 text-[var(--admin-text)]">
                  {title}
                </DialogPrimitive.Title>
                {headerExtra}
              </div>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-xs leading-4.5 text-[var(--admin-text-muted)]">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  详情与参数编辑抽屉
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label="关闭抽屉"
              className="inline-grid size-7 shrink-0 place-items-center rounded-[6px] border border-[var(--admin-border)] bg-[var(--admin-surface-2)] text-[var(--admin-text-secondary)] transition-colors hover:text-[var(--admin-text)]"
            >
              <X className="size-3.5" />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {children}
          </div>

          {footer ? (
            <div className="shrink-0 border-t border-[var(--admin-border)] bg-[var(--admin-surface)] px-5 py-3">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
