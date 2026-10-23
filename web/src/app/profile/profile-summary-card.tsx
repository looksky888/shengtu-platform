import { CheckCircle2, Coins, LoaderCircle, UserCircle2 } from "lucide-react";

import { ProfileInfoRow } from "@/app/profile/profile-info-row";
import { formatCreditBalance } from "@/app/profile/profile-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ProfileCredits } from "@/lib/api";
import { providerLabel } from "@/lib/provider-label";
import type { StoredAuthSession } from "@/store/auth";

type ProfileSummaryCardProps = {
  session: StoredAuthSession;
  roleLabel: string;
  credits?: ProfileCredits | null;
  isCheckingIn?: boolean;
  onCheckin?: () => void;
};

export function ProfileSummaryCard({
  session,
  roleLabel,
  credits,
  isCheckingIn = false,
  onCheckin,
}: ProfileSummaryCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-foreground bg-foreground text-background shadow-xs">
              <UserCircle2 className="size-4.5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base font-semibold">
                {session.name || "用户"}
              </CardTitle>
              <CardDescription className="truncate font-mono text-xs">
                {session.subjectId || "—"}
              </CardDescription>
            </div>
          </div>
          <Badge
            variant={session.role === "admin" ? "default" : "secondary"}
            className={cn(
              "shrink-0 rounded-md",
              session.role === "admin" && "border-foreground bg-foreground text-background",
            )}
          >
            {roleLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-2">
          <ProfileInfoRow label="用户 ID" value={session.subjectId} code />
          <ProfileInfoRow
            label="登录来源"
            value={providerLabel(session.provider)}
          />
          <ProfileInfoRow
            label="角色标识"
            value={session.roleId || session.role}
            code
          />
          <ProfileInfoRow
            label="当前积分"
            value={formatCreditBalance(credits?.balance)}
          />
        </div>
        {onCheckin ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-surface-muted/35 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-foreground">
                每日签到奖励
              </div>
              <div className="text-[11px] text-muted-foreground">
                {credits?.checked_in_today
                  ? "今日已完成签到，明日可继续领取"
                  : "每日签到免费领取算力积分"}
              </div>
            </div>
            <Button
              id="profile-checkin-button"
              type="button"
              size="sm"
              variant={credits?.checked_in_today ? "outline" : "default"}
              onClick={onCheckin}
              disabled={isCheckingIn || Boolean(credits?.checked_in_today)}
            >
              {isCheckingIn ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : credits?.checked_in_today ? (
                <CheckCircle2 className="size-3.5 text-status-success" />
              ) : (
                <Coins className="size-3.5" />
              )}
              {credits?.checked_in_today ? "今日已签到" : "签到领积分"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
