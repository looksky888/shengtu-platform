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
    const group = item.group || "\u5176\u4ed6";
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
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300";
    case "POST":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300";
    case "PATCH":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300";
    case "DELETE":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}
