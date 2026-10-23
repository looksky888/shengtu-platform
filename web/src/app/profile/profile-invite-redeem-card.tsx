import {
  Copy,
  Gift,
  KeyRound,
  Link2,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ProfileInviteInfo } from "@/lib/api";

type ProfileInviteRedeemCardProps = {
  inviteInfo: ProfileInviteInfo | null;
  inviteLink: string;
  inviteError: string;
  isLoadingInvite: boolean;
  redeemKey: string;
  isRedeeming: boolean;
  onCopy: (value: string) => void;
  onRetryInvite: () => void;
  onRedeemKeyChange: (value: string) => void;
  onRedeem: () => void;
};

export function ProfileInviteRedeemCard({
  inviteInfo,
  inviteLink,
  inviteError,
  isLoadingInvite,
  redeemKey,
  isRedeeming,
  onCopy,
  onRetryInvite,
  onRedeemKeyChange,
  onRedeem,
}: ProfileInviteRedeemCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-surface-muted text-foreground">
            <Gift className="size-4.5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base font-semibold">
              邀请与兑换
            </CardTitle>
            <CardDescription className="truncate">
              分享专属邀请链接，或使用兑换码即时核销算力积分
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <InviteInfoPanel
          inviteInfo={inviteInfo}
          inviteLink={inviteLink}
          inviteError={inviteError}
          isLoadingInvite={isLoadingInvite}
          onCopy={onCopy}
          onRetry={onRetryInvite}
        />
        <div className="border-t border-border/70 pt-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-redeem-key">积分卡密兑换</FieldLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="profile-redeem-key"
                  value={redeemKey}
                  onChange={(event) => onRedeemKeyChange(event.target.value)}
                  placeholder="请输入积分兑换码"
                  className="h-9 font-mono text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 px-3.5"
                  onClick={onRedeem}
                  disabled={isRedeeming}
                >
                  {isRedeeming ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                  立即兑换
                </Button>
              </div>
              <FieldDescription>
                核销成功后实时累加至当前账户余额，可在「积分中心与流水」查阅记录。
              </FieldDescription>
            </Field>
          </FieldGroup>
        </div>
      </CardContent>
    </Card>
  );
}

function InviteInfoPanel({
  inviteInfo,
  inviteLink,
  inviteError,
  isLoadingInvite,
  onCopy,
  onRetry,
}: {
  inviteInfo: ProfileInviteInfo | null;
  inviteLink: string;
  inviteError: string;
  isLoadingInvite: boolean;
  onCopy: (value: string) => void;
  onRetry: () => void;
}) {
  if (isLoadingInvite) {
    return (
      <div className="flex min-h-[112px] items-center justify-center rounded-lg border border-border/60 bg-muted/20">
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (inviteError) {
    return (
      <div className="flex flex-col gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-700 dark:text-rose-300">
        <span>邀请信息加载失败：{inviteError}</span>
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="xs" onClick={onRetry}>
            <RefreshCw className="size-3.5" />
            重试
          </Button>
        </div>
      </div>
    );
  }
  if (!inviteInfo) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
        暂无邀请信息。
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <InviteValueCard
        label="专属邀请码"
        value={inviteInfo.code || "—"}
        onCopy={() => onCopy(inviteInfo.code)}
      />
      <InviteValueCard
        label="注册邀请链接"
        value={inviteLink || inviteInfo.link || "—"}
        hint="自动带入邀请码"
        onCopy={() => onCopy(inviteLink || inviteInfo.link)}
      />
    </div>
  );
}

function InviteValueCard({
  label,
  value,
  hint,
  onCopy,
}: {
  label: string;
  value: string;
  hint?: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/65 bg-surface-muted/25 p-2.5">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        {hint ? (
          <span className="inline-flex items-center gap-1 text-[11px]">
            <Link2 className="size-3" />
            {hint}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-surface px-2.5 py-1.5 font-mono text-xs text-foreground">
          {value}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={onCopy}
          aria-label={`复制${label}`}
          title={`复制${label}`}
        >
          <Copy className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
