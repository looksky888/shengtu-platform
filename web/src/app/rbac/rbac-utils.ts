import type { ManagedRole } from "@/lib/api";

export function normalizeManagedRoles(items: ManagedRole[] | null | undefined) {
  return Array.isArray(items) ? items : [];
}

export function uniqueSortedStrings(values: string[] | null | undefined) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))).sort();
}

export function sameStringSet(left: string[], right: string[] | null | undefined) {
  const normalizedLeft = uniqueSortedStrings(left);
  const normalizedRight = uniqueSortedStrings(right);
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

export function roleSearchText(role: ManagedRole) {
  return [role.id, role.name, role.description].filter(Boolean).join(" ").toLowerCase();
}

export function permissionCountLabel(role: ManagedRole) {
  return `${uniqueSortedStrings(role.menu_paths).length} \u83dc\u5355 / ${uniqueSortedStrings(role.api_permissions).length} API`;
}