import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ApiPermission, PermissionMenu } from "@/lib/api";
import { cn } from "@/lib/utils";

import { apiMethodClass, toggleListValue, type ApiPermissionGroup } from "./permission-editor-utils";

type MenuPermissionSectionProps = {
  menuPermissions: PermissionMenu[];
  allMenuPaths: string[];
  selectedMenuPaths: string[];
  onMenuPathsChange: (paths: string[]) => void;
};

export function MenuPermissionSection({
  menuPermissions,
  allMenuPaths,
  selectedMenuPaths,
  onMenuPathsChange,
}: MenuPermissionSectionProps) {
  return (
    <section className="min-w-0 rounded-xl border border-border">
      <PermissionSectionHeader
        title={"\u83dc\u5355"}
        selectedCount={selectedMenuPaths.length}
        totalCount={allMenuPaths.length}
        onSelectAll={() => onMenuPathsChange(allMenuPaths)}
        onClear={() => onMenuPathsChange([])}
      />
      <div className="divide-y divide-border">
        {menuPermissions.length > 0 ? (
          menuPermissions.map((item) => (
            <label key={item.path} className="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-muted/50">
              <Checkbox
                aria-label={`菜单权限：${item.label}`}
                checked={selectedMenuPaths.includes(item.path)}
                onCheckedChange={(checked) => onMenuPathsChange(toggleListValue(selectedMenuPaths, item.path, Boolean(checked)))}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{item.label}</div>
                <code className="block truncate font-mono text-xs text-muted-foreground">{item.path}</code>
              </div>
            </label>
          ))
        ) : (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">{"\u6682\u65e0\u83dc\u5355\u6743\u9650"}</div>
        )}
      </div>
    </section>
  );
}

type ApiPermissionSectionProps = {
  groups: ApiPermissionGroup[];
  allPermissionKeys: string[];
  selectedPermissions: string[];
  onPermissionsChange: (permissions: string[]) => void;
};

export function ApiPermissionSection({
  groups,
  allPermissionKeys,
  selectedPermissions,
  onPermissionsChange,
}: ApiPermissionSectionProps) {
  return (
    <section className="min-w-0 rounded-xl border border-border">
      <PermissionSectionHeader
        title="API"
        selectedCount={selectedPermissions.length}
        totalCount={allPermissionKeys.length}
        onSelectAll={() => onPermissionsChange(allPermissionKeys)}
        onClear={() => onPermissionsChange([])}
      />
      <div className="space-y-4 p-4">
        {groups.length > 0 ? (
          groups.map((group) => (
            <article key={group.group} className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground">{group.group}</h4>
                <span className="text-xs text-muted-foreground">{group.items.length}</span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {group.items.map((permission) => (
                  <ApiPermissionItem
                    key={permission.key}
                    permission={permission}
                    checked={selectedPermissions.includes(permission.key)}
                    onChange={(checked) => onPermissionsChange(toggleListValue(selectedPermissions, permission.key, checked))}
                  />
                ))}
              </div>
            </article>
          ))
        ) : (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">{"\u6682\u65e0 API \u6743\u9650"}</div>
        )}
      </div>
    </section>
  );
}

function PermissionSectionHeader({
  title,
  selectedCount,
  totalCount,
  onSelectAll,
  onClear,
}: {
  title: string;
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{selectedCount} / {totalCount}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" className="h-7 rounded-md px-2 text-xs" onClick={onSelectAll}>{"\u5168\u9009"}</Button>
        <Button type="button" variant="ghost" className="h-7 rounded-md px-2 text-xs" onClick={onClear}>{"\u6e05\u7a7a"}</Button>
      </div>
    </div>
  );
}

function ApiPermissionItem({
  permission,
  checked,
  onChange,
}: {
  permission: ApiPermission;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-3 transition hover:bg-muted/50">
      <Checkbox aria-label={`API 权限：${permission.label}`} checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none", apiMethodClass(permission.method))}>
            {permission.method}
          </span>
          <span className="truncate text-sm font-medium text-foreground">{permission.label}</span>
        </div>
        <code className="mt-1 block truncate font-mono text-xs text-muted-foreground">
          {permission.path}{permission.subtree ? "/*" : ""}
        </code>
      </div>
    </label>
  );
}
