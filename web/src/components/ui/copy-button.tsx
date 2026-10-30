"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

export interface CopyButtonProps extends Omit<ButtonProps, "onClick"> {
  value: string;
  label?: string;
  copiedLabel?: string;
  toastMessage?: string | false;
  onCopied?: () => void;
}

export function CopyButton({
  value,
  label,
  copiedLabel = "已复制",
  toastMessage = false,
  onCopied,
  variant = "ghost",
  size = "icon-xs",
  className,
  title = "复制",
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!value) {
      return;
    }
    try {
      await copyText(value);
      setCopied(true);
      if (toastMessage) {
        toast.success(toastMessage);
      }
      onCopied?.();
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={label ? "xs" : size}
      title={copied ? copiedLabel : title}
      aria-label={copied ? copiedLabel : title}
      onClick={(e) => void handleCopy(e)}
      className={cn(
        copied && "text-emerald-600 dark:text-emerald-400",
        className
      )}
      {...props}
    >
      {copied ? (
        <Check className="size-3.5 shrink-0" />
      ) : (
        <Copy className="size-3.5 shrink-0" />
      )}
      {label ? <span>{copied ? copiedLabel : label}</span> : null}
    </Button>
  );
}
