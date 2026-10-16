import type { UserCleanupFilter, UserTimeFilter } from "@/app/users/users-utils";
import { chinaTodayKey } from "@/lib/datetime";
import { hasAPIPermission, type StoredAuthSession } from "@/store/auth";

export function userTimeBounds(filter: UserTimeFilter): { start_at?: string; end_at?: string } {
  if (filter === "all") return {};
  if (filter === "today") {
    const day = chinaTodayKey();
    return { start_at: day, end_at: day };
  }
  const days = filter === "7d" ? 7 : 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start_at: chinaTodayKey(start), end_at: chinaTodayKey(end) };
}

export function userCleanupQuery(filter: UserCleanupFilter) {
  if (filter === "inactive15_or_credit0") return { cleanup: "inactive15_or_credit0" as const };
  if (filter === "inactive15") return { inactive_days_min: 15 };
  if (filter === "credit0") return { credit_max: 0 };
  return {};
}

export function userManagementPermissions(session: StoredAuthSession) {
  return {
    canCreateUser: hasAPIPermission(session, "POST", "/api/admin/users"),
    canUpdateUser: hasAPIPermission(session, "POST", "/api/admin/users"),
    canDeleteUser: hasAPIPermission(session, "DELETE", "/api/admin/users"),
    canAdjustCredits: hasAPIPermission(session, "POST", "/api/admin/credits"),
  };
}
