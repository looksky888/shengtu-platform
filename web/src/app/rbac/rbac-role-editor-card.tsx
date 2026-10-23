import { LoaderCircle, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";

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
  onCreateRole?: () => void;
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
  onCreateRole,
}: RBACRoleEditorCardProps) {
  const isLockedAdmin = Boolean(selectedRole?.builtin && selectedRole.id === "admin");

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3.5 border-b border-border bg-surface-muted/45 px-4 py-3.5 sm:px-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-surface text-foreground shadow-2xs">
                  <ShieldCheck className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">
                      {selectedRole?.name || "未选择角色"}
                    </h2>
                    {selectedRole?.builtin ? (
                      <Badge variant="outline" className="rounded-md text-[11px]">
                        系统内置角色
                      </Badge>
                    ) : null}
                    {isLockedAdmin ? (
                      <Badge variant="secondary" className="gap-1 rounded-md text-[11px]">
                        <Lock className="size-3" />
                        全量授权锁定
                      </Badge>
                    ) : null}
                  </div>
                  <code className="block truncate font-mono text-xs text-muted-foreground">
                    {selectedRole ? `角色标识：${selectedRole.id} · 已关联 ${selectedRole.user_count || 0} 位用户` : "—"}
                  </code>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isDirty ? (
                <Badge variant="warning" className="w-fit rounded-md">未保存更改</Badge>
              ) : (
                <Badge variant="secondary" className="w-fit rounded-md">已同步</Badge>
              )}
              <Button
                type="button"
                variant="destructive-outline"
                size="sm"
                className="px-3"
                disabled={!selectedRole || Boolean(selectedRole.builtin) || Boolean(selectedRole.user_count)}
                title={
                  selectedRole?.builtin
                    ? "内置角色不可删除"
                    : selectedRole?.user_count
                      ? "存在关联用户的角色不可删除"
                      : "删除自定义角色"
                }
                onClick={() => (selectedRole ? onDeleteRole(selectedRole) : null)}
              >
                <Trash2 className="size-4" />
                删除角色
              </Button>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
            <Input
              aria-label="角色名称"
              value={roleName}
              onChange={(event) => onRoleNameChange(event.target.value)}
              placeholder="角色名称"
              disabled={!selectedRole || isLoading || isLockedAdmin}
              className="h-9 rounded-lg bg-surface"
            />
            <Input
              aria-label="角色描述"
              value={roleDescription}
              onChange={(event) => onRoleDescriptionChange(event.target.value)}
              placeholder="填写角色职责说明或授权范围备注"
              disabled={!selectedRole || isLoading || isLockedAdmin}
              className="h-9 rounded-lg bg-surface"
            />
          </div>
        </div>
        <div className="p-4 sm:p-5">
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
              disabled={isLockedAdmin}
              onMenuPathsChange={onMenuPathsChange}
              onApiPermissionsChange={onApiPermissionsChange}
              className="lg:grid-cols-[216px_minmax(0,1fr)]"
            />
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="尚未选择角色"
              description="请从左侧目录选择一个角色，或新建自定义角色以配置菜单路由与 API 接口授权。"
              action={
                onCreateRole ? (
                  <Button type="button" size="sm" onClick={onCreateRole}>
                    <Plus className="size-4" />
                    新建角色
                  </Button>
                ) : null
              }
              className="min-h-[380px]"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
