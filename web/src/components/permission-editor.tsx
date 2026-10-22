"use client";

import { useMemo, useState } from "react";

import type { ApiPermission, PermissionMenu } from "@/lib/api";
import { cn } from "@/lib/utils";

import { ApiPermissionSection, MenuPermissionSection } from "./permission-editor-sections";
import { flattenMenuPermissions, groupApiPermissions } from "./permission-editor-utils";

type PermissionEditorProps = {
  menus: PermissionMenu[];
  apis: ApiPermission[];
  selectedMenuPaths: string[];
  selectedApiPermissions: string[];
  onMenuPathsChange: (paths: string[]) => void;
  onApiPermissionsChange: (permissions: string[]) => void;
  className?: string;
};

export function PermissionEditor({
  menus,
  apis,
  selectedMenuPaths,
  selectedApiPermissions,
  onMenuPathsChange,
  onApiPermissionsChange,
  className,
}: PermissionEditorProps) {
  const [apiSearch, setApiSearch] = useState("");
  const menuPermissions = useMemo(() => flattenMenuPermissions(menus), [menus]);
  const filteredApis = useMemo(() => {
    const keyword = apiSearch.trim().toLowerCase();
    if (!keyword) return apis;
    return apis.filter((item) =>
      [item.label, item.path, item.method, item.group, item.key]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [apis, apiSearch]);
  const apiPermissionGroups = useMemo(() => groupApiPermissions(filteredApis), [filteredApis]);
  const allMenuPaths = useMemo(() => menuPermissions.map((item) => item.path), [menuPermissions]);
  const allApiPermissionKeys = useMemo(() => apis.map((item) => item.key), [apis]);

  return (
    <div className={cn("grid gap-5 lg:grid-cols-[280px_1fr]", className)}>
      <MenuPermissionSection
        menuPermissions={menuPermissions}
        allMenuPaths={allMenuPaths}
        selectedMenuPaths={selectedMenuPaths}
        onMenuPathsChange={onMenuPathsChange}
      />
      <ApiPermissionSection
        groups={apiPermissionGroups}
        allPermissionKeys={allApiPermissionKeys}
        selectedPermissions={selectedApiPermissions}
        onPermissionsChange={onApiPermissionsChange}
        apiSearch={apiSearch}
        onApiSearchChange={setApiSearch}
      />
    </div>
  );
}
