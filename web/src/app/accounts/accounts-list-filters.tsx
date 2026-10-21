import { Search } from "lucide-react";

import { accountStatusOptions, accountTypeOptions } from "@/app/accounts/account-utils";
import { Badge } from "@/components/ui/badge";
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
};

export function AccountsListFilters({ total, query, typeFilter, statusFilter, onQueryChange, onTypeFilterChange, onStatusFilterChange }: AccountsListFiltersProps) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2.5">
        <h2 className="text-base font-semibold tracking-tight text-foreground">账户列表</h2>
        <Badge variant="secondary" className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground tabular-nums">{total}</Badge>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-[240px]">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="搜索账户邮箱" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索邮箱" className="h-9 rounded-lg pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={(value) => onTypeFilterChange(value as AccountType | "all")}>
          <SelectTrigger aria-label="账户类型筛选" className="h-9 w-full rounded-lg sm:w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>{accountTypeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(value) => onStatusFilterChange(value as AccountStatus | "all")}>
          <SelectTrigger aria-label="账户状态筛选" className="h-9 w-full rounded-lg sm:w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>{accountStatusOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );
}
