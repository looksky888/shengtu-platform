import { RotateCcw, Search, X } from "lucide-react";

import { accountStatusOptions, accountTypeOptions } from "@/app/accounts/account-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AccountStatus, AccountType } from "@/lib/api";

type AccountsListFiltersProps = {
  total: number;
  query: string;
  typeFilter: AccountType | "all";
  statusFilter: AccountStatus | "all";
  onQueryChange: (value: string) => void;
  onTypeFilterChange: (value: AccountType | "all") => void;
  onStatusFilterChange: (value: AccountStatus | "all") => void;
  onResetFilters?: () => void;
};

export function AccountsListFilters({
  total,
  query,
  typeFilter,
  statusFilter,
  onQueryChange,
  onTypeFilterChange,
  onStatusFilterChange,
  onResetFilters,
}: AccountsListFiltersProps) {
  const hasFilters = Boolean(query.trim() || typeFilter !== "all" || statusFilter !== "all");
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border/80 bg-surface p-3 shadow-2xs lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">账户列表</h2>
        <Badge variant="secondary" className="rounded-md bg-surface-muted px-2 py-0.5 text-muted-foreground tabular-nums">
          {total}
        </Badge>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="搜索账户邮箱"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索账号邮箱或标识…"
            className="h-9 rounded-lg pr-8 pl-8 text-xs"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="清空搜索"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <Select value={typeFilter} onValueChange={(value) => onTypeFilterChange(value as AccountType | "all")}>
          <SelectTrigger aria-label="账户类型筛选" className="h-9 w-full rounded-lg text-xs sm:w-[132px]"><SelectValue /></SelectTrigger>
          <SelectContent>{accountTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(value) => onStatusFilterChange(value as AccountStatus | "all")}>
          <SelectTrigger aria-label="账户状态筛选" className="h-9 w-full rounded-lg text-xs sm:w-[132px]"><SelectValue /></SelectTrigger>
          <SelectContent>{accountStatusOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        {hasFilters && onResetFilters ? (
          <Button type="button" variant="ghost" size="sm" className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground" onClick={onResetFilters}>
            <RotateCcw className="size-3.5" />
            重置
          </Button>
        ) : null}
      </div>
    </div>
  );
}
