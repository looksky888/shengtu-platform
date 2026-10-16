"use client";

import { useMemo } from "react";

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
  const menuPermissions = useMemo(() => flattenMenuPermissions(menus), [menus]);
  const apiPermissionGroups = useMemo(() => groupApiPermissions(apis), [apis]);
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
      />
    </div>
  );
}
