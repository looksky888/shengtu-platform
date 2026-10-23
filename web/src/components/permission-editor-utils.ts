import type { ApiPermission, PermissionMenu } from "@/lib/api";

export type ApiPermissionGroup = { group: string; items: ApiPermission[] };

export function flattenMenuPermissions(items: PermissionMenu[] | null | undefined): PermissionMenu[] {
  const out: PermissionMenu[] = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    out.push(item);
    out.push(...flattenMenuPermissions(item.children));
  });
  return out;
}

export function groupApiPermissions(items: ApiPermission[]) {
  return items.reduce<ApiPermissionGroup[]>((groups, item) => {
    const group = item.group || "其他";
    const existing = groups.find((entry) => entry.group === group);
    if (existing) {
      existing.items.push(item);
      return groups;
    }
    groups.push({ group, items: [item] });
    return groups;
  }, []);
}

export function toggleListValue(values: string[], value: string, checked: boolean) {
  const current = new Set(values);
  if (checked) {
    current.add(value);
  } else {
    current.delete(value);
  }
  return Array.from(current).sort();
}

export function apiMethodClass(method: string) {
  switch (method.toUpperCase()) {
    case "GET":
      return "border-border bg-surface-muted text-foreground";
    case "POST":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "PATCH":
    case "PUT":
      return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "DELETE":
      return "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}
