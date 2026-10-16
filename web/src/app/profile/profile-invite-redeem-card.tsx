import { Copy, Gift, KeyRound, Link2, LoaderCircle, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
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
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf4ff] text-[#1456f0] dark:bg-sky-950/30 dark:text-sky-300">
            <Gift className="size-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-lg">邀请与兑换</CardTitle>
            <CardDescription className="truncate">邀请链接与积分卡密都在这里管理</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <InviteInfoPanel inviteInfo={inviteInfo} inviteLink={inviteLink} inviteError={inviteError} isLoadingInvite={isLoadingInvite} onCopy={onCopy} onRetry={onRetryInvite} />
        <div className="border-t border-border pt-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="profile-redeem-key">卡密兑换</FieldLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id="profile-redeem-key" value={redeemKey} onChange={(event) => onRedeemKeyChange(event.target.value)} placeholder="请输入积分兑换码" className="h-10 rounded-lg font-mono" />
                <Button type="button" className="h-10 rounded-lg" onClick={onRedeem} disabled={isRedeeming}>
                  {isRedeeming ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                  立即兑换
                </Button>
              </div>
              <FieldDescription>兑换成功后会立即更新当前余额，具体流水以后端记录为准。</FieldDescription>
            </Field>
          </FieldGroup>
        </div>
      </CardContent>
    </Card>
  );
}

function InviteInfoPanel({ inviteInfo, inviteLink, inviteError, isLoadingInvite, onCopy, onRetry }: {
  inviteInfo: ProfileInviteInfo | null;
  inviteLink: string;
  inviteError: string;
  isLoadingInvite: boolean;
  onCopy: (value: string) => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-foreground">邀请信息</div>
        {inviteInfo ? <Badge variant="info" className="rounded-md">邀请码已就绪</Badge> : null}
      </div>
      {isLoadingInvite ? (
        <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-border bg-muted/20"><LoaderCircle className="size-5 animate-spin text-stone-400" /></div>
      ) : inviteError ? (
        <div className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/20 dark:text-rose-300">
          <span>邀请信息加载失败：{inviteError}</span>
          <div className="flex justify-end"><Button type="button" variant="outline" className="h-10 rounded-lg" onClick={onRetry}><RefreshCw className="size-4" />重试</Button></div>
        </div>
      ) : !inviteInfo ? (
        <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">暂无邀请信息。</div>
      ) : (
        <>
          <InviteValueCard label="邀请码" value={inviteInfo.code || "—"} badge="可直接分享" onCopy={() => onCopy(inviteInfo.code)} />
          <InviteValueCard label="邀请链接" value={inviteLink || inviteInfo.link || "—"} hint="注册链接会自动带邀请码" onCopy={() => onCopy(inviteLink || inviteInfo.link)} />
        </>
      )}
    </div>
  );
}

function InviteValueCard({ label, value, badge, hint, onCopy }: { label: string; value: string; badge?: string; hint?: string; onCopy: () => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{label}</span>
        {badge ? <Badge variant="secondary" className="rounded-md">{badge}</Badge> : null}
        {hint ? <span className="inline-flex items-center gap-1"><Link2 className="size-3.5" />{hint}</span> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-3 py-2 font-mono text-sm text-foreground">{value}</code>
        <Button type="button" variant="outline" size="icon" className="size-9 rounded-lg" onClick={onCopy} aria-label={`复制${label}`} title={`复制${label}`}>
          <Copy className="size-4" />
        </Button>
      </div>
      {hint ? <FieldDescription>邀请链接可直接转发给新用户，注册链接会自动带入邀请码。</FieldDescription> : null}
    </div>
  );
}
