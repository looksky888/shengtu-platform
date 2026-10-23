import { LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";

import { PermissionEditor } from "@/components/permission-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import type { ApiPermission, ManagedRole, PermissionMenu } from "@/lib/api";

type RBACRoleEditorCardProps = {
  selectedRole: ManagedRole | null;
  catalog: { menus: PermissionMenu[]; apis: ApiPermission[] };
  roleName: string;
  roleDescription: string;
  selectedMenuPaths: string[];
  selectedApiPermissions: string[];
  isDirty: boolean;
  isLoading: boolean;
  onRoleNameChange: (value: string) => void;
  onRoleDescriptionChange: (value: string) => void;
  onMenuPathsChange: (value: string[]) => void;
  onApiPermissionsChange: (value: string[]) => void;
  onDeleteRole: (role: ManagedRole) => void;
};

export function RBACRoleEditorCard({
  selectedRole,
  catalog,
  roleName,
  roleDescription,
  selectedMenuPaths,
  selectedApiPermissions,
  isDirty,
  isLoading,
  onRoleNameChange,
  onRoleDescriptionChange,
  onMenuPathsChange,
  onApiPermissionsChange,
  onDeleteRole,
}: RBACRoleEditorCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-col gap-4 border-b border-border bg-surface-subtle/50 px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground ring-1 ring-border/60">
                  <ShieldCheck className="size-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-foreground">
                    {selectedRole?.name || "未选择角色"}
                  </h2>
                  <code className="block truncate font-mono text-xs text-muted-foreground">{selectedRole?.id || "-"}</code>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isDirty ? (
                <Badge variant="warning" className="w-fit rounded-md">未保存</Badge>
              ) : (
                <Badge variant="secondary" className="w-fit rounded-md">已同步</Badge>
              )}
              <Button
                type="button"
                variant="destructive-outline"
                size="sm"
                className="px-3"
                disabled={!selectedRole || Boolean(selectedRole.builtin) || Boolean(selectedRole.user_count)}
                onClick={() => (selectedRole ? onDeleteRole(selectedRole) : null)}
              >
                <Trash2 className="size-4" />
                删除
              </Button>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
            <Input
              aria-label="角色名称"
              value={roleName}
              onChange={(event) => onRoleNameChange(event.target.value)}
              placeholder="角色名称"
              disabled={!selectedRole || isLoading}
              className="h-9 rounded-lg bg-surface"
            />
            <Input
              aria-label="角色描述"
              value={roleDescription}
              onChange={(event) => onRoleDescriptionChange(event.target.value)}
              placeholder="角色描述"
              disabled={!selectedRole || isLoading}
              className="h-9 rounded-lg bg-surface"
            />
          </div>
        </div>
        <div className="p-5">
          {isLoading ? (
            <div className="flex min-h-[420px] items-center justify-center">
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : selectedRole ? (
            <PermissionEditor
              menus={catalog.menus}
              apis={catalog.apis}
              selectedMenuPaths={selectedMenuPaths}
              selectedApiPermissions={selectedApiPermissions}
              onMenuPathsChange={onMenuPathsChange}
              onApiPermissionsChange={onApiPermissionsChange}
              className="lg:grid-cols-[300px_1fr]"
            />
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="暂无角色"
              description="请从左侧列表选择角色，或创建一个新角色以配置菜单与接口权限。"
              className="min-h-[380px]"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
