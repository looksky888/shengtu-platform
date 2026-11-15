"use client";

import { useState, type FormEvent, type RefObject } from "react";
import { CheckCircle2, Gift, KeyRound, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProfileRedeemResponse } from "@/lib/api-types";
import { redeemProfileCredits } from "@/lib/credit-admin-api";
import { dispatchQuotaRefresh } from "@/lib/quota-events";
import { cn } from "@/lib/utils";

function formatCredits(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export interface RedeemCodeFormProps {
  onSuccess?: (result: ProfileRedeemResponse) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  inputId?: string;
  placeholder?: string;
  className?: string;
}

export function RedeemCodeForm({
  onSuccess,
  inputRef,
  inputId = "recharge-redeem-code-input",
  placeholder = "粘贴或输入积分兑换卡密",
  className,
}: RedeemCodeFormProps) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const [lastRedeemed, setLastRedeemed] = useState<{
    amount: number;
    balance: number;
  } | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setInlineError("请输入有效的积分兑换卡密");
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    setInlineError("");
    try {
      const data = await redeemProfileCredits(trimmed);
      const added = Number(data.card?.amount ?? data.entry?.delta ?? 0);
      const nextBalance = Number(data.balance ?? data.account?.balance ?? 0);
      setLastRedeemed({ amount: added, balance: nextBalance });
      setCode("");
      dispatchQuotaRefresh();
      toast.success(`兑换成功，已到账 ${formatCredits(added)} 积分`);
      onSuccess?.(data);
    } catch (reason) {
      const msg =
        reason instanceof Error ? reason.message : "兑换失败，请核对卡密是否正确";
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className={cn("space-y-2.5", className)}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          ref={inputRef}
          id={inputId}
          aria-label="积分兑换卡密"
          value={code}
          disabled={submitting}
          onChange={(event) => {
            setCode(event.target.value);
            if (inlineError) setInlineError("");
          }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="h-9 flex-1 font-mono text-xs tracking-wide"
        />
        <Button
          type="submit"
          size="sm"
          disabled={submitting || !code.trim()}
          className="h-9 shrink-0 gap-1.5 px-4"
        >
          {submitting ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <KeyRound className="size-3.5" />
          )}
          {submitting ? "正在兑换…" : "立即兑换"}
        </Button>
      </div>

      {inlineError ? (
        <p role="alert" className="text-xs text-status-danger">
          {inlineError}
        </p>
      ) : null}

      {lastRedeemed ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-status-success/25 bg-status-success-soft px-3 py-2 text-xs text-status-success"
        >
          <span className="inline-flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="size-3.5 shrink-0" />
            兑换成功，已实时充入 +{formatCredits(lastRedeemed.amount)} 积分
          </span>
          <span className="font-mono tabular-nums">
            当前余额：{formatCredits(lastRedeemed.balance)} 积分
          </span>
        </div>
      ) : null}
    </form>
  );
}

export function RedeemCodeCard({
  onSuccess,
  inputRef,
  prominent = false,
  id,
  className,
}: {
  onSuccess?: (result: ProfileRedeemResponse) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  prominent?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "rounded-2xl border bg-card transition-colors",
        prominent
          ? "border-primary/35 p-6 shadow-sm ring-1 ring-primary/10 sm:p-7"
          : "border-border/75 p-5 shadow-2xs",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-xl border border-brand-border bg-brand-soft text-primary",
              prominent ? "size-10" : "size-9",
            )}
          >
            <Gift className={prominent ? "size-5" : "size-4"} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className={cn(
                  "font-semibold text-foreground",
                  prominent ? "text-lg" : "text-base",
                )}
              >
                卡密兑换积分
              </h2>
              {prominent ? (
                <span className="rounded-full border border-brand-border bg-brand-soft px-2.5 py-0.5 text-[11px] font-medium text-primary">
                  即时到账
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              持有官方积分兑换码或活动福利卡密？输入后积分秒级直充当前账号。
            </p>
          </div>
        </div>
        <Link
          to="/profile?tab=credits"
          className="text-xs font-medium text-primary hover:underline"
        >
          查看兑换与消费流水 →
        </Link>
      </div>

      <div className="mt-4">
        <RedeemCodeForm onSuccess={onSuccess} inputRef={inputRef} />
      </div>
    </section>
  );
}
