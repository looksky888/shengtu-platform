import { LoaderCircle, Plus, Search, ShieldCheck, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  onCreateRole?: () => void;
};

export function RBACRoleList({
  roles,
  filteredRoles,
  selectedRoleId,
  searchText,
  isLoading,
  onSearchTextChange,
  onSelectRole,
  onCreateRole,
}: RBACRoleListProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="border-b border-border bg-surface-muted/45 px-3.5 py-3">
          <div className="mb-2.5 flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 text-foreground font-semibold">
              <ShieldCheck className="size-3.5 text-muted-foreground" />
              角色目录
            </span>
            <Badge variant="secondary" className="rounded-md px-1.5 py-0 font-mono text-[10px] tabular-nums">
              {filteredRoles.length} / {roles.length}
            </Badge>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="搜索角色"
              value={searchText}
              onChange={(event) => onSearchTextChange(event.target.value)}
              placeholder="搜索角色名称或 ID"
              className="h-8 rounded-lg bg-surface pl-8 text-xs"
            />
          </div>
        </div>
        <div className="thin-scrollbar max-h-[calc(100dvh-16rem)] min-h-[380px] overflow-y-auto p-1.5">
          {isLoading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {!isLoading && filteredRoles.length === 0 ? (
            <EmptyState
              compact
              icon={ShieldCheck}
              title={searchText.trim() ? "无匹配角色" : "暂无角色"}
              description={searchText.trim() ? "请尝试其他关键字。" : "创建自定义角色以分配权限。"}
              action={
                searchText.trim() ? (
                  <Button type="button" variant="outline" size="xs" onClick={() => onSearchTextChange("")}>
                    <X className="size-3.5" />
                    清空筛选
                  </Button>
                ) : onCreateRole ? (
                  <Button type="button" size="xs" onClick={onCreateRole}>
                    <Plus className="size-3.5" />
                    新建角色
                  </Button>
                ) : null
              }
              className="py-10"
            />
          ) : null}
          {!isLoading ? (
            <div className="space-y-1">
              {filteredRoles.map((role) => {
                const selected = role.id === selectedRoleId;
                return (
                  <button
                    key={role.id}
                    type="button"
                    className={cn(
                      "block w-full rounded-lg border px-3 py-2.5 text-left transition-all",
                      selected
                        ? "border-foreground bg-surface shadow-2xs ring-1 ring-foreground/10"
                        : "border-transparent hover:border-border/80 hover:bg-surface-hover/70",
                    )}
                    onClick={() => onSelectRole(role)}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "size-1.5 shrink-0 rounded-full transition-colors",
                              selected ? "bg-foreground" : "bg-border-strong",
                            )}
                          />
                          <div className="text-[13px] font-semibold leading-snug text-foreground break-words">
                            {role.name}
                          </div>
                        </div>
                        <code className="mt-0.5 block truncate pl-3 font-mono text-[11px] text-muted-foreground">
                          {role.id}
                        </code>
                      </div>
                      {role.builtin ? (
                        <Badge variant="secondary" className="shrink-0 rounded px-1.5 py-0 text-[10px]">
                          内置
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-3">
                      <span className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                        {permissionCountLabel(role)}
                      </span>
                      <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                        {role.user_count || 0} 用户
                      </span>
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
