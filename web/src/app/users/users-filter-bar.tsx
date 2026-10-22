import { Search, X } from "lucide-react";

import type { UserCleanupFilter, UserTimeFilter } from "@/app/users/users-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type UsersFilterBarProps = {
  totalCount: number;
  filteredCount: number;
  searchText: string;
  providerFilter: string;
  statusFilter: string;
  timeFilter: UserTimeFilter;
  cleanupFilter: UserCleanupFilter;
  hasActiveFilters: boolean;
  onSearchTextChange: (value: string) => void;
  onProviderFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onTimeFilterChange: (value: UserTimeFilter) => void;
  onCleanupFilterChange: (value: UserCleanupFilter) => void;
  onClearFilters: () => void;
};

export function UsersFilterBar({
  totalCount,
  filteredCount,
  searchText,
  providerFilter,
  statusFilter,
  timeFilter,
  cleanupFilter,
  hasActiveFilters,
  onSearchTextChange,
  onProviderFilterChange,
  onStatusFilterChange,
  onTimeFilterChange,
  onCleanupFilterChange,
  onClearFilters,
}: UsersFilterBarProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          共 {filteredCount} / {totalCount} 个用户
        </span>
        {cleanupFilter !== "all" ? (
          <span className="text-amber-700 dark:text-amber-400">
            清理筛选已开启：可在行内点击「删除」清理用户（管理员账号受保护）
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="搜索用户"
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder="搜索邮箱、用户名、用户 ID、owner 或会话"
            className="h-9 rounded-lg pl-9"
          />
        </div>
        <Select value={providerFilter} onValueChange={onProviderFilterChange}>
          <SelectTrigger aria-label="用户来源筛选" className="h-9 w-full rounded-lg sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部来源</SelectItem>
            <SelectItem value="local">本地</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger aria-label="用户状态筛选" className="h-9 w-full rounded-lg sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="enabled">已启用</SelectItem>
            <SelectItem value="disabled">已禁用</SelectItem>
          </SelectContent>
        </Select>
        <Select value={timeFilter} onValueChange={(value) => onTimeFilterChange(value as UserTimeFilter)}>
          <SelectTrigger aria-label="用户时间筛选" className="h-9 w-full rounded-lg sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部时间</SelectItem>
            <SelectItem value="today">今天</SelectItem>
            <SelectItem value="7d">近 7 天</SelectItem>
            <SelectItem value="30d">近 30 天</SelectItem>
          </SelectContent>
        </Select>
        <Select value={cleanupFilter} onValueChange={(value) => onCleanupFilterChange(value as UserCleanupFilter)}>
          <SelectTrigger aria-label="待清理用户筛选" className="h-9 w-full rounded-lg sm:w-44">
            <SelectValue placeholder="清理筛选" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">清理筛选：关闭</SelectItem>
            <SelectItem value="inactive15_or_credit0">待清理：≥15 天未活跃 或 积分≤0</SelectItem>
            <SelectItem value="inactive15">仅 ≥15 天未活跃</SelectItem>
            <SelectItem value="credit0">仅 积分≤0</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-lg px-3"
          disabled={!hasActiveFilters}
          onClick={onClearFilters}
        >
          <X className="size-4" />
          清除
        </Button>
      </div>
    </div>
  );
}
