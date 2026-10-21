import type { UserCleanupFilter } from "@/app/users/users-utils";
import { chinaTimeRangeBounds } from "@/lib/datetime";
import { hasAPIPermission, type StoredAuthSession } from "@/store/auth";

export const userTimeBounds = chinaTimeRangeBounds;

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
