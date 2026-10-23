import { Ban, CheckCircle2, Coins, LoaderCircle, Mail, Minus, ShieldCheck, Trash2, UserRound } from "lucide-react";

import { UserUsageSparkline } from "@/app/users/user-usage-sparkline";
import {
  formatCompactNumber,
  formatCreditNumber,
  formatDateTime,
  formatInactiveDays,
  numeric,
  roleLabel,
  todayCallCount,
  todayQuotaUsed,
  type CreditAdjustMode,
} from "@/app/users/users-utils";
import { Badge } from "@/components/ui/badge";
import { providerLabel } from "@/lib/provider-label";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import type { ManagedRole, ManagedUser, ManagedUserUsage } from "@/lib/api";

type UsersTableRowProps = {
  user: ManagedUser;
  roles: ManagedRole[];
  creditBalance: number;
  isPending: boolean;
  /** On-demand usage for this user; null/undefined until「加载用量」. */
  usage?: ManagedUserUsage | null;
  /** Server usage aggregation ready; when false, show refresh hint instead of empty zeros. */
  usageReady?: boolean;
  permissions: {
    canUpdateUser: boolean;
    canDeleteUser: boolean;
    canAdjustCredits: boolean;
  };
  onAdjustCredits: (user: ManagedUser, mode: CreditAdjustMode) => void;
  onRole: (user: ManagedUser) => void;
  onToggle: (user: ManagedUser) => void;
  onDelete: (user: ManagedUser) => void;
};

export function UsersTableRow(props: UsersTableRowProps) {
  const { user, roles, creditBalance, isPending, usage, usageReady = true } = props;
  return (
    <TableRow className="text-muted-foreground transition-colors hover:bg-surface-hover/60">
      <TableCell><UserIdentity user={user} /></TableCell>
      <TableCell>
        <div className="space-y-1 tabular-nums">
          <div className="text-base font-semibold text-foreground">{formatCreditNumber(creditBalance)}</div>
          <div className="text-xs text-muted-foreground">当前积分</div>
        </div>
      </TableCell>
      <TableCell><UserRole user={user} roles={roles} /></TableCell>
      <TableCell><UserProvider user={user} /></TableCell>
      <TableCell>
        <Badge variant={user.enabled ? "success" : "danger"} className="rounded-md">{user.enabled ? "已启用" : "已禁用"}</Badge>
      </TableCell>
      <TableCell>
        <div className="space-y-1 tabular-nums">
          <div className="text-base font-semibold text-foreground">{usageReady ? numeric(usage?.quota_used) : "—"}</div>
          <div className="text-xs text-muted-foreground">今日 {usageReady ? todayQuotaUsed(usage) : "—"}</div>
        </div>
      </TableCell>
      <TableCell className="w-[340px]"><UserUsageBlock usage={usage} usageReady={usageReady} /></TableCell>
      <TableCell>
        <div className="space-y-1 text-xs tabular-nums">
          <div className="font-medium text-foreground">{formatInactiveDays(user.inactive_days)}</div>
          <div>创建 {formatDateTime(user.created_at)}</div>
          <div>活跃 {formatDateTime(user.last_used_at)}</div>
        </div>
      </TableCell>
      <TableCell><UserActions {...props} isPending={isPending} /></TableCell>
    </TableRow>
  );
}

function resolveAvatarInitial(user: ManagedUser) {
  const raw = (user.name || user.username || user.email || user.id || "U").trim();
  return raw.slice(0, 1).toUpperCase();
}

function UserIdentity({ user }: { user: ManagedUser }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-surface-muted font-display text-xs font-semibold text-foreground shadow-2xs">
        {resolveAvatarInitial(user)}
      </div>
      <div className="min-w-0 space-y-0.5">
        <div className="truncate font-semibold text-foreground">{user.name || "普通用户"}</div>
        {user.email ? (
          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/85">
            <Mail className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{user.email}</span>
          </div>
        ) : null}
        {user.username ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserRound className="size-3.5 shrink-0" />
            <span className="truncate">{user.email ? `内部账号：${user.username}` : user.username}</span>
          </div>
        ) : null}
        <code className="block max-w-[240px] truncate font-mono text-[11px] text-muted-foreground tabular-nums">
          {user.id}
        </code>
      </div>
    </div>
  );
}

function UserRole({ user, roles }: { user: ManagedUser; roles: ManagedRole[] }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant="secondary" className="rounded-md">{roleLabel(user, roles)}</Badge>
      <code className="max-w-[160px] truncate font-mono text-xs text-muted-foreground">{user.role_id || "default-user"}</code>
    </div>
  );
}

function UserProvider({ user }: { user: ManagedUser }) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Badge variant="secondary" className="rounded-md">
        {providerLabel(user.provider)}
      </Badge>
    </div>
  );
}

function UserUsageBlock({ usage, usageReady }: { usage?: ManagedUserUsage | null; usageReady: boolean }) {
  const hasCurve = usageReady && Array.isArray(usage?.usage_curve) && usage.usage_curve.length > 0;
  return (
    <div className="flex items-center gap-4">
      {hasCurve ? (
        <UserUsageSparkline points={usage?.usage_curve} />
      ) : (
        <div className="flex h-10 w-[120px] items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/30 px-2 text-center text-[11px] leading-4 text-muted-foreground">
          {usageReady ? "暂无调用" : "点「加载用量」"}
        </div>
      )}
      <div className="min-w-[72px] space-y-1 text-xs text-muted-foreground tabular-nums">
        <div>总计 {usageReady ? formatCompactNumber(usage?.call_count) : "—"}</div>
        <div>今日 {usageReady ? formatCompactNumber(todayCallCount(usage)) : "—"}</div>
        <div>失败 {usageReady ? formatCompactNumber(usage?.failure_count) : "—"}</div>
      </div>
    </div>
  );
}

function UserActions({ user, isPending, permissions, onAdjustCredits, onRole, onToggle, onDelete }: UsersTableRowProps) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {permissions.canAdjustCredits ? (
        <>
          <Button type="button" variant="outline" className="h-8 rounded-md px-3" onClick={() => onAdjustCredits(user, "add")} disabled={isPending}>
            <Coins className="size-4" />加积分
          </Button>
          <Button type="button" variant="outline" className="h-8 rounded-md border-rose-500/30 px-3 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300" onClick={() => onAdjustCredits(user, "deduct")} disabled={isPending}>
            <Minus className="size-4" />减积分
          </Button>
        </>
      ) : null}
      {permissions.canUpdateUser ? (
        <>
          <Button type="button" variant="outline" className="h-8 rounded-md px-3" onClick={() => onRole(user)} disabled={isPending}>
            <ShieldCheck className="size-4" />角色
          </Button>
          <Button type="button" variant="outline" className="h-8 rounded-md px-3" onClick={() => onToggle(user)} disabled={isPending}>
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : user.enabled ? <Ban className="size-4" /> : <CheckCircle2 className="size-4" />}
            {user.enabled ? "禁用" : "启用"}
          </Button>
        </>
      ) : null}
      {permissions.canDeleteUser ? (
        <Button type="button" variant="outline" className="h-8 rounded-md border-rose-500/30 px-3 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300" onClick={() => onDelete(user)} disabled={isPending}>
          <Trash2 className="size-4" />删除
        </Button>
      ) : null}
    </div>
  );
}
