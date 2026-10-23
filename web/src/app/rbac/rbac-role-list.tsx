import { LoaderCircle, Search, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import type { ManagedRole } from "@/lib/api";
import { cn } from "@/lib/utils";
import { permissionCountLabel } from "@/app/rbac/rbac-utils";

type RBACRoleListProps = {
  roles: ManagedRole[];
  filteredRoles: ManagedRole[];
  selectedRoleId: string;
  searchText: string;
  isLoading: boolean;
  onSearchTextChange: (value: string) => void;
  onSelectRole: (role: ManagedRole) => void;
};

export function RBACRoleList({
  roles,
  filteredRoles,
  selectedRoleId,
  searchText,
  isLoading,
  onSearchTextChange,
  onSelectRole,
}: RBACRoleListProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="border-b border-border bg-surface-subtle/80 px-5 py-4">
          <div className="mb-3 flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span className="tabular-nums">角色 {filteredRoles.length} / {roles.length}</span>
            <ShieldCheck className="size-4 text-muted-foreground" />
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="搜索角色"
              value={searchText}
              onChange={(event) => onSearchTextChange(event.target.value)}
              placeholder="搜索角色名称或描述"
              className="h-9 rounded-lg bg-surface pl-9"
            />
          </div>
        </div>
        <div className="max-h-[calc(100dvh-20rem)] min-h-[360px] overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {!isLoading && filteredRoles.length === 0 ? (
            <EmptyState
              compact
              icon={ShieldCheck}
              title="暂无角色"
              description={searchText.trim() ? "没有匹配的角色，请尝试其他关键字。" : "点击右上角「新建角色」创建自定义角色。"}
              className="py-12"
            />
          ) : null}
          {!isLoading ? (
            <div className="space-y-1.5">
              {filteredRoles.map((role) => {
                const selected = role.id === selectedRoleId;
                return (
                  <button
                    key={role.id}
                    type="button"
                    className={cn(
                      "block w-full rounded-xl border px-4 py-3.5 text-left transition-all",
                      selected
                        ? "border-foreground bg-surface shadow-xs ring-1 ring-foreground/10"
                        : "border-transparent hover:border-border/80 hover:bg-surface-hover/60",
                    )}
                    onClick={() => onSelectRole(role)}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full transition-colors",
                              selected ? "bg-foreground" : "bg-border-strong",
                            )}
                          />
                          <div className="truncate text-sm font-semibold text-foreground">{role.name}</div>
                        </div>
                        <code className="mt-1 block truncate pl-3.5 font-mono text-xs text-muted-foreground">{role.id}</code>
                      </div>
                      {role.builtin ? <Badge variant="secondary" className="shrink-0 rounded-md">内置</Badge> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 pl-3.5">
                      <span className="rounded-md bg-surface-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{permissionCountLabel(role)}</span>
                      <span className="rounded-md bg-surface-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{role.user_count || 0} 用户</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
