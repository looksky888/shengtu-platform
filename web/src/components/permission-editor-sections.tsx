import { useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
        title={"菜单"}
        selectedCount={selectedMenuPaths.length}
        totalCount={allMenuPaths.length}
        onSelectAll={() => onMenuPathsChange(allMenuPaths)}
        onClear={() => onMenuPathsChange([])}
      />
      <div className="max-h-[calc(100dvh-20rem)] min-h-[360px] divide-y divide-border overflow-y-auto pr-1">
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
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">暂无菜单权限</div>
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
  apiSearch?: string;
  onApiSearchChange?: (value: string) => void;
};

export function ApiPermissionSection({
  groups,
  allPermissionKeys,
  selectedPermissions,
  onPermissionsChange,
  apiSearch,
  onApiSearchChange,
}: ApiPermissionSectionProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const searchValue = apiSearch ?? internalSearch;
  const handleSearchChange = onApiSearchChange ?? setInternalSearch;

  const displayedGroups = useMemo(() => {
    if (apiSearch !== undefined) return groups;
    const keyword = searchValue.trim().toLowerCase();
    if (!keyword) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          [item.label, item.path, item.method, group.group, item.key]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(keyword),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [apiSearch, groups, searchValue]);

  return (
    <section className="min-w-0 rounded-xl border border-border">
      <PermissionSectionHeader
        title="API"
        selectedCount={selectedPermissions.length}
        totalCount={allPermissionKeys.length}
        onSelectAll={() => onPermissionsChange(allPermissionKeys)}
        onClear={() => onPermissionsChange([])}
        extra={
          <Input
            aria-label="搜索 API 权限"
            value={searchValue}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="搜索权限名称或路径..."
            className="h-8 w-44 rounded-lg text-xs"
          />
        }
      />
      <div className="max-h-[calc(100dvh-20rem)] min-h-[360px] space-y-4 overflow-y-auto p-4 pr-1">
        {displayedGroups.length > 0 ? (
          displayedGroups.map((group) => (
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
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">暂无 API 权限</div>
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
  extra,
}: {
  title: string;
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{selectedCount} / {totalCount}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {extra}
        <Button type="button" variant="ghost" className="h-7 rounded-md px-2 text-xs" onClick={onSelectAll}>全选</Button>
        <Button type="button" variant="ghost" className="h-7 rounded-md px-2 text-xs" onClick={onClear}>清空</Button>
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
