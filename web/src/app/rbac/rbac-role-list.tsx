import { LoaderCircle, Search, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
        <div className="border-b border-border px-5 py-4">
          <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>角色 {filteredRoles.length} / {roles.length}</span>
            <ShieldCheck className="size-4" />
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="搜索角色"
              value={searchText}
              onChange={(event) => onSearchTextChange(event.target.value)}
              placeholder="搜索角色名称或描述"
              className="h-9 rounded-lg pl-9"
            />
          </div>
        </div>
        <div className="max-h-[calc(100vh-18rem)] min-h-[360px] overflow-y-auto">
          {isLoading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <LoaderCircle className="size-5 animate-spin text-stone-400" />
            </div>
          ) : null}
          {!isLoading && filteredRoles.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">暂无角色</div>
          ) : null}
          {!isLoading ? filteredRoles.map((role) => (
            <button
              key={role.id}
              type="button"
              className={cn(
                "block w-full border-b border-border px-5 py-4 text-left transition hover:bg-muted/50",
                role.id === selectedRoleId ? "bg-primary/8 dark:bg-primary/15" : "",
              )}
              onClick={() => onSelectRole(role)}
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{role.name}</div>
                  <code className="mt-1 block truncate font-mono text-xs text-muted-foreground">{role.id}</code>
                </div>
                {role.builtin ? <Badge variant="secondary" className="shrink-0 rounded-md">内置</Badge> : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{permissionCountLabel(role)}</span>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{role.user_count || 0} 用户</span>
              </div>
            </button>
          )) : null}
        </div>
      </CardContent>
    </Card>
  );
}
