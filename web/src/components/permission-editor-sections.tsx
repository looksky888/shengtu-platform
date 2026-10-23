import { useMemo, useState, type ReactNode } from "react";
import { LayoutList, Search, Shield, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import type { ApiPermission, PermissionMenu } from "@/lib/api";
import { cn } from "@/lib/utils";

import { toggleListValue, type ApiPermissionGroup } from "./permission-editor-utils";

function resolvePermissionMethodClass(method: string) {
  switch (method.toUpperCase()) {
    case "GET":
      return "border-border/80 bg-surface-muted text-foreground";
    case "POST":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "PUT":
    case "PATCH":
      return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "DELETE":
      return "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    default:
      return "border-border bg-surface-muted text-muted-foreground";
  }
}

type MenuPermissionSectionProps = {
  menuPermissions: PermissionMenu[];
  allMenuPaths: string[];
  selectedMenuPaths: string[];
  disabled?: boolean;
  onMenuPathsChange: (paths: string[]) => void;
};

export function MenuPermissionSection({
  menuPermissions,
  allMenuPaths,
  selectedMenuPaths,
  disabled = false,
  onMenuPathsChange,
}: MenuPermissionSectionProps) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
      <PermissionSectionHeader
        title="菜单路由"
        selectedCount={selectedMenuPaths.length}
        totalCount={allMenuPaths.length}
        disabled={disabled}
        onSelectAll={() => onMenuPathsChange(allMenuPaths)}
        onClear={() => onMenuPathsChange([])}
      />
      <div className="thin-scrollbar max-h-[calc(100dvh-20rem)] min-h-[380px] divide-y divide-border/65 overflow-y-auto">
        {menuPermissions.length > 0 ? (
          menuPermissions.map((item) => {
            const checked = selectedMenuPaths.includes(item.path);
            return (
              <label
                key={item.path}
                className={cn(
                  "flex items-start gap-2.5 px-3 py-2.5 transition-colors",
                  disabled ? "cursor-default opacity-80" : "cursor-pointer",
                  checked ? "bg-surface-muted/55" : !disabled && "hover:bg-surface-hover/60",
                )}
              >
                <Checkbox
                  aria-label={`菜单权限：${item.label}`}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(nextChecked) =>
                    onMenuPathsChange(toggleListValue(selectedMenuPaths, item.path, Boolean(nextChecked)))
                  }
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium leading-snug text-foreground break-words">
                    {item.label}
                  </div>
                  <code className="mt-0.5 block break-all font-mono text-[11px] text-muted-foreground">
                    {item.path}
                  </code>
                </div>
              </label>
            );
          })
        ) : (
          <EmptyState
            compact
            icon={LayoutList}
            title="暂无菜单权限"
            description="当前系统尚未定义可分配的菜单路由权限。"
            className="py-12"
          />
        )}
      </div>
    </section>
  );
}

type ApiPermissionSectionProps = {
  groups: ApiPermissionGroup[];
  allPermissionKeys: string[];
  selectedPermissions: string[];
  disabled?: boolean;
  onPermissionsChange: (permissions: string[]) => void;
  apiSearch?: string;
  onApiSearchChange?: (value: string) => void;
};

export function ApiPermissionSection({
  groups,
  allPermissionKeys,
  selectedPermissions,
  disabled = false,
  onPermissionsChange,
  apiSearch,
  onApiSearchChange,
}: ApiPermissionSectionProps) {
  const [internalSearch, setInternalSearch] = useState("");
  const searchValue = apiSearch ?? internalSearch;
  const handleSearchChange = onApiSearchChange ?? setInternalSearch;
  const selectedSet = useMemo(() => new Set(selectedPermissions), [selectedPermissions]);

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

  const handleSelectGroup = (groupItems: ApiPermission[]) => {
    if (disabled) return;
    const next = new Set(selectedPermissions);
    for (const item of groupItems) {
      next.add(item.key);
    }
    onPermissionsChange(Array.from(next).sort());
  };

  const handleClearGroup = (groupItems: ApiPermission[]) => {
    if (disabled) return;
    const removeSet = new Set(groupItems.map((item) => item.key));
    onPermissionsChange(selectedPermissions.filter((key) => !removeSet.has(key)));
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
      <PermissionSectionHeader
        title="API 接口权限"
        selectedCount={selectedPermissions.length}
        totalCount={allPermissionKeys.length}
        disabled={disabled}
        onSelectAll={() => onPermissionsChange(allPermissionKeys)}
        onClear={() => onPermissionsChange([])}
        extra={
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="搜索 API 权限"
              value={searchValue}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="搜索权限名称、HTTP 方法或路径..."
              className="h-8 w-52 rounded-lg bg-surface pl-8 pr-7 text-xs sm:w-64"
            />
            {searchValue ? (
              <button
                type="button"
                onClick={() => handleSearchChange("")}
                aria-label="清空 API 搜索"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        }
      />
      <div className="thin-scrollbar max-h-[calc(100dvh-20rem)] min-h-[380px] space-y-5 overflow-y-auto p-3.5 sm:p-4">
        {displayedGroups.length > 0 ? (
          displayedGroups.map((group) => {
            const groupSelectedCount = group.items.filter((item) => selectedSet.has(item.key)).length;
            const allGroupSelected = groupSelectedCount === group.items.length && group.items.length > 0;
            return (
              <article key={group.group} className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-1.5">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold tracking-tight text-foreground">{group.group}</h4>
                    <Badge
                      variant={allGroupSelected ? "default" : "secondary"}
                      className="rounded px-1.5 py-0 font-mono text-[10px] tabular-nums"
                    >
                      {groupSelectedCount} / {group.items.length}
                    </Badge>
                  </div>
                  {!disabled ? (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="h-6 rounded px-2 text-[11px]"
                        disabled={allGroupSelected}
                        onClick={() => handleSelectGroup(group.items)}
                      >
                        全选本组
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="h-6 rounded px-2 text-[11px]"
                        disabled={groupSelectedCount === 0}
                        onClick={() => handleClearGroup(group.items)}
                      >
                        清空
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-1.5 2xl:grid-cols-2">
                  {group.items.map((permission) => (
                    <ApiPermissionItem
                      key={permission.key}
                      permission={permission}
                      checked={selectedSet.has(permission.key)}
                      disabled={disabled}
                      onChange={(checked) =>
                        onPermissionsChange(toggleListValue(selectedPermissions, permission.key, checked))
                      }
                    />
                  ))}
                </div>
              </article>
            );
          })
        ) : (
          <EmptyState
            compact
            icon={Shield}
            title="暂无匹配的 API 权限"
            description={searchValue.trim() ? "没有找到匹配的接口名称或路径，请调整搜索关键字。" : "当前没有可分配的接口权限。"}
            action={
              searchValue.trim() ? (
                <Button type="button" variant="outline" size="xs" onClick={() => handleSearchChange("")}>
                  <X className="size-3.5" />
                  清空搜索条件
                </Button>
              ) : null
            }
            className="py-12"
          />
        )}
      </div>
    </section>
  );
}

function PermissionSectionHeader({
  title,
  selectedCount,
  totalCount,
  disabled = false,
  onSelectAll,
  onClear,
  extra,
}: {
  title: string;
  selectedCount: number;
  totalCount: number;
  disabled?: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border bg-surface-muted/45 px-3.5 py-2.5">
      <div className="flex items-center gap-2 min-w-0">
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
        <Badge variant="secondary" className="rounded px-1.5 py-0 font-mono text-[10px] tabular-nums">
          {selectedCount} / {totalCount}
        </Badge>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {extra}
        {!disabled ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-7 rounded-md px-2 text-xs"
              disabled={selectedCount === totalCount && totalCount > 0}
              onClick={onSelectAll}
            >
              全选
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-7 rounded-md px-2 text-xs"
              disabled={selectedCount === 0}
              onClick={onClear}
            >
              清空
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ApiPermissionItem({
  permission,
  checked,
  disabled = false,
  onChange,
}: {
  permission: ApiPermission;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const fullPath = `${permission.path}${permission.subtree ? "/*" : ""}`;
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors",
        disabled ? "cursor-default opacity-80" : "cursor-pointer",
        checked
          ? "border-foreground/30 bg-surface-muted/55 shadow-2xs"
          : "border-border/65 bg-surface hover:border-border hover:bg-surface-hover/60",
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Checkbox
          aria-label={`API 权限：${permission.label}`}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onChange(Boolean(value))}
          className="mt-0.5 shrink-0"
        />
        <span className="text-[13px] font-medium leading-snug text-foreground break-words">
          {permission.label}
        </span>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 text-right">
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none",
            resolvePermissionMethodClass(permission.method),
          )}
        >
          {permission.method}
        </span>
        <code className="font-mono text-[11px] text-muted-foreground break-all sm:break-normal">
          {fullPath}
        </code>
      </div>
    </label>
  );
}
