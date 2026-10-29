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
        <div className="space-y-0.5 tabular-nums">
          <div className="text-sm font-semibold text-foreground">{formatCreditNumber(creditBalance)}</div>
          <div className="text-[11px] text-muted-foreground">当前积分</div>
        </div>
      </TableCell>
      <TableCell><UserRoleAndProvider user={user} roles={roles} /></TableCell>
      <TableCell>
        <Badge variant={user.enabled ? "success" : "danger"} className="rounded-md">{user.enabled ? "已启用" : "已禁用"}</Badge>
      </TableCell>
      <TableCell>
        <div className="space-y-0.5 tabular-nums">
          <div className="text-sm font-semibold text-foreground">{usageReady ? numeric(usage?.quota_used) : "—"}</div>
          <div className="text-[11px] text-muted-foreground">今日 {usageReady ? todayQuotaUsed(usage) : "—"}</div>
        </div>
      </TableCell>
      <TableCell className="w-[216px]"><UserUsageBlock usage={usage} usageReady={usageReady} /></TableCell>
      <TableCell>
        <div className="space-y-0.5 text-[11px] tabular-nums">
          <div className="text-xs font-medium text-foreground">{formatInactiveDays(user.inactive_days)}</div>
          <div>创建 {formatDateTime(user.created_at)}</div>
          <div>活跃 {formatDateTime(user.last_used_at)}</div>
        </div>
      </TableCell>
      <TableCell className="w-[210px]"><UserActions {...props} isPending={isPending} /></TableCell>
    </TableRow>
  );
}

function resolveAvatarInitial(user: ManagedUser) {
  const raw = (user.name || user.username || user.email || user.id || "U").trim();
  return raw.slice(0, 1).toUpperCase();
}

function UserIdentity({ user }: { user: ManagedUser }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-surface-muted font-display text-xs font-semibold text-foreground shadow-2xs">
        {resolveAvatarInitial(user)}
      </div>
      <div className="min-w-0 space-y-0.5">
        <div className="max-w-[190px] truncate text-sm font-semibold text-foreground">{user.name || "普通用户"}</div>
        {user.email ? (
          <div className="flex items-center gap-1 text-xs font-medium text-foreground/85">
            <Mail className="size-3 shrink-0 text-muted-foreground" />
            <span className="max-w-[190px] truncate" title={user.email}>{user.email}</span>
          </div>
        ) : null}
        {user.username ? (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <UserRound className="size-3 shrink-0" />
            <span className="max-w-[190px] truncate" title={user.username}>{user.email ? `账号：${user.username}` : user.username}</span>
          </div>
        ) : null}
        <code className="block max-w-[190px] truncate font-mono text-[10px] text-muted-foreground tabular-nums" title={user.id}>
          {user.id}
        </code>
      </div>
    </div>
  );
}

function UserRoleAndProvider({ user, roles }: { user: ManagedUser; roles: ManagedRole[] }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="secondary" className="rounded-md">{roleLabel(user, roles)}</Badge>
        <Badge variant="outline" className="rounded-md text-[10px] text-muted-foreground">
          {providerLabel(user.provider)}
        </Badge>
      </div>
      <code className="max-w-[140px] truncate font-mono text-[11px] text-muted-foreground">{user.role_id || "default-user"}</code>
    </div>
  );
}

function UserUsageBlock({ usage, usageReady }: { usage?: ManagedUserUsage | null; usageReady: boolean }) {
  const hasCurve = usageReady && Array.isArray(usage?.usage_curve) && usage.usage_curve.length > 0;
  return (
    <div className="flex items-center gap-2.5">
      {hasCurve ? (
        <UserUsageSparkline points={usage?.usage_curve} />
      ) : (
        <div className="flex h-11 w-[132px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/30 px-2 text-center text-[11px] leading-4 text-muted-foreground">
          {usageReady ? "暂无调用" : "点「加载用量」"}
        </div>
      )}
      <div className="min-w-[60px] space-y-0.5 text-[11px] text-muted-foreground tabular-nums">
        <div>总 {usageReady ? formatCompactNumber(usage?.call_count) : "—"}</div>
        <div>今 {usageReady ? formatCompactNumber(todayCallCount(usage)) : "—"}</div>
        <div>败 {usageReady ? formatCompactNumber(usage?.failure_count) : "—"}</div>
      </div>
    </div>
  );
}

function UserActions({ user, isPending, permissions, onAdjustCredits, onRole, onToggle, onDelete }: UsersTableRowProps) {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {permissions.canAdjustCredits ? (
        <>
          <Button type="button" variant="outline" size="xs" className="h-7 rounded-md px-2 text-xs" onClick={() => onAdjustCredits(user, "add")} disabled={isPending}>
            <Coins className="size-3.5" />加分
          </Button>
          <Button type="button" variant="outline" size="xs" className="h-7 rounded-md border-rose-500/30 px-2 text-xs text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300" onClick={() => onAdjustCredits(user, "deduct")} disabled={isPending}>
            <Minus className="size-3.5" />扣分
          </Button>
        </>
      ) : null}
      {permissions.canUpdateUser ? (
        <>
          <Button type="button" variant="outline" size="xs" className="h-7 rounded-md px-2 text-xs" onClick={() => onRole(user)} disabled={isPending}>
            <ShieldCheck className="size-3.5" />角色
          </Button>
          <Button type="button" variant="outline" size="xs" className="h-7 rounded-md px-2 text-xs" onClick={() => onToggle(user)} disabled={isPending}>
            {isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : user.enabled ? <Ban className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
            {user.enabled ? "禁用" : "启用"}
          </Button>
        </>
      ) : null}
      {permissions.canDeleteUser ? (
        <Button
          type="button"
          variant="outline"
          size="xs"
          aria-label={`删除用户 ${user.name || user.email || user.id}`}
          title="删除用户"
          className="h-7 rounded-md border-rose-500/30 px-2 text-xs text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
          onClick={() => onDelete(user)}
          disabled={isPending}
        >
          <Trash2 className="size-3.5" />删除
        </Button>
      ) : null}
    </div>
  );
}
