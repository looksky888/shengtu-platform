"use client";

import * as React from "react";
import type { ReactNode } from "react";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ConfirmDialogTone = "default" | "warning" | "destructive";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  destructive?: boolean;
  tone?: ConfirmDialogTone;
  impactItems?: ReactNode[];
  requireConfirmText?: string;
  pending?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  pendingLabel = "处理中…",
  destructive = false,
  tone,
  impactItems,
  requireConfirmText,
  pending = false,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const resolvedTone: ConfirmDialogTone =
    tone ?? (destructive ? "destructive" : "default");
  const isDestructive = resolvedTone === "destructive";
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);
  const [typedText, setTypedText] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setTypedText("");
    }
  }, [open]);

  const confirmDisabled =
    pending ||
    Boolean(
      requireConfirmText &&
        typedText.trim() !== requireConfirmText.trim()
    );

  const Icon =
    resolvedTone === "destructive"
      ? ShieldAlert
      : resolvedTone === "warning"
        ? AlertTriangle
        : Info;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => (!nextOpen && !pending ? onClose() : null)}
    >
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          if (isDestructive && !requireConfirmText && cancelRef.current) {
            event.preventDefault();
            cancelRef.current.focus();
          }
        }}
        className="max-w-md rounded-2xl p-6"
      >
        <DialogHeader className="gap-2.5 text-left">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border",
                resolvedTone === "destructive" &&
                  "border-destructive/25 bg-destructive/10 text-destructive",
                resolvedTone === "warning" &&
                  "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                resolvedTone === "default" &&
                  "border-brand-border bg-brand-soft text-brand"
              )}
            >
              <Icon className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <DialogTitle className="text-base font-semibold leading-6">
                {title}
              </DialogTitle>
              <DialogDescription className="text-sm leading-6 text-muted-foreground">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {impactItems && impactItems.length > 0 ? (
          <ul className="space-y-1.5 rounded-xl border border-border/75 bg-surface-muted/70 px-3.5 py-2.5 text-xs leading-5 text-muted-foreground">
            {impactItems.map((item, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/70" />
                <span className="min-w-0 flex-1">{item}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {requireConfirmText ? (
          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-medium text-muted-foreground">
              请输入{" "}
              <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-foreground">
                {requireConfirmText}
              </code>{" "}
              以确认操作：
            </label>
            <Input
              value={typedText}
              onChange={(event) => setTypedText(event.target.value)}
              placeholder={requireConfirmText}
              disabled={pending}
              autoFocus
            />
          </div>
        ) : null}

        <DialogFooter className="pt-2">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={isDestructive ? "destructive" : "default"}
            loading={pending}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
