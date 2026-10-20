import type {
  CreditAccount,
  CreateManagedUserPayload,
  ManagedRole,
  ManagedUser,
  ManagedUserUsage,
} from "@/lib/api";
import { formatDateTime as formatBizDateTime, isWithinChinaTimeFilter, type TimeRangeFilter } from "@/lib/datetime";

export const USER_TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export type UserTablePageSize = typeof USER_TABLE_PAGE_SIZE_OPTIONS[number];
export type UserTimeFilter = TimeRangeFilter;
/** Admin cleanup presets for managed users list. */
export type UserCleanupFilter = "all" | "inactive15_or_credit0" | "inactive15" | "credit0";

export function formatInactiveDays(days?: number | null) {
  if (typeof days !== "number" || !Number.isFinite(days)) return "—";
  if (days >= 36500) return "从未活跃";
  if (days <= 0) return "今天活跃";
  return `${days} 天未活跃`;
}

export type CreateUserForm = {
  username: string;
  name: string;
  password: string;
  confirmPassword: string;
  role_id: string;
  enabled: boolean;
};

export type CreateUserErrors = Partial<Record<"username" | "password" | "confirmPassword", string>>;
export type CreditAdjustMode = "add" | "deduct";

export type NormalizedUsagePoint = {
  date: string;
  calls: number;
  success: number;
  failure: number;
  quotaUsed: number;
};

const accountUsernamePattern = /^[a-z0-9][a-z0-9_.-]{2,31}$/;
const compactNumberFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 1,
  notation: "compact",
});
const usageDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  day: "2-digit",
  month: "2-digit",
});

export function formatDateTime(value?: string | null) {
  return formatBizDateTime(value, { withSeconds: false });
}

export function normalizeManagedUsers(items: ManagedUser[] | null | undefined) {
  return Array.isArray(items) ? items : [];
}

export function normalizeManagedRoles(items: ManagedRole[] | null | undefined) {
  return Array.isArray(items) ? items : [];
}

export function normalizeCreditUsers(items: CreditAccount[] | null | undefined) {
  return Array.isArray(items) ? items : [];
}

export function isWithinUserTimeFilter(value: string | null | undefined, filter: UserTimeFilter) {
  return isWithinChinaTimeFilter(value, filter);
}

export function filterUsers(items: ManagedUser[], searchText: string, providerFilter: string, statusFilter: string, timeFilter: UserTimeFilter) {
  const keyword = searchText.trim().toLowerCase();
  return items.filter((user) => {
    if (providerFilter !== "all" && user.provider !== providerFilter) return false;
    if (statusFilter === "enabled" && !user.enabled) return false;
    if (statusFilter === "disabled" && user.enabled) return false;
    if (!isWithinUserTimeFilter(user.created_at || user.last_used_at, timeFilter)) return false;
    return !keyword || userSearchText(user).includes(keyword);
  });
}

export function createEmptyUserForm(roleId = ""): CreateUserForm {
  return {
    username: "",
    name: "",
    password: "",
    confirmPassword: "",
    role_id: roleId,
    enabled: true,
  };
}

export function validateCreateUserForm(values: CreateUserForm) {
  const errors: CreateUserErrors = {};
  const username = values.username.trim().toLowerCase();

  if (!accountUsernamePattern.test(username)) {
    errors.username = "用户名需为 3-32 位小写字母、数字、点、下划线或短横线，并以字母或数字开头";
  }
  if (values.password.length < 8) {
    errors.password = "密码长度不能少于 8 位";
  } else if (values.password.length > 128) {
    errors.password = "密码长度不能超过 128 位";
  }
  if (!values.confirmPassword) {
    errors.confirmPassword = "请确认密码";
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "两次输入的密码不一致";
  }

  return errors;
}

export function createUserPayload(values: CreateUserForm): CreateManagedUserPayload {
  return {
    username: values.username.trim().toLowerCase(),
    name: values.name.trim(),
    password: values.password,
    role_id: values.role_id,
    enabled: values.enabled,
  };
}

export function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function formatCompactNumber(value: unknown) {
  return compactNumberFormatter.format(numeric(value));
}

export function formatCreditNumber(value: unknown) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(numeric(value));
}

export function formatUsageDate(value?: string) {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return usageDateFormatter.format(date);
}

export function normalizeUsageCurve(points?: ManagedUserUsage["usage_curve"]): NormalizedUsagePoint[] {
  if (!Array.isArray(points)) {
    return [];
  }
  return points
    .filter((point) => Boolean(point.date))
    .map((point) => ({
      date: point.date,
      calls: numeric(point.calls),
      success: numeric(point.success),
      failure: numeric(point.failure),
      quotaUsed: numeric(point.quota_used),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function latestUsagePoint(points?: ManagedUserUsage["usage_curve"]) {
  const safePoints = normalizeUsageCurve(points);
  return safePoints[safePoints.length - 1];
}

export function todayQuotaUsed(usage?: ManagedUserUsage | null) {
  return latestUsagePoint(usage?.usage_curve)?.quotaUsed ?? 0;
}

export function todayCallCount(usage?: ManagedUserUsage | null) {
  return latestUsagePoint(usage?.usage_curve)?.calls ?? 0;
}

export function userSearchText(user: ManagedUser) {
  return [
    user.id,
    user.username,
    user.email,
    user.name,
    user.role_id,
    user.role_name,
    user.owner_id,
    user.owner_name,
    user.provider,
    user.session_id,
    user.session_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function roleLabel(user: ManagedUser, roles: ManagedRole[]) {
  const roleID = String(user.role_id || "").trim();
  const role = roles.find((item) => item.id === roleID);
  return user.role_name || role?.name || "普通用户";
}
