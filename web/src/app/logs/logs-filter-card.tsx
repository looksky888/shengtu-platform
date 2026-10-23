import { useState, type FormEvent } from "react";
import { ChevronDown, LoaderCircle, Search, SlidersHorizontal, X } from "lucide-react";

import { DateRangeFilter } from "@/components/date-range-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SystemLogFilters } from "@/lib/api";
import { cn } from "@/lib/utils";
import { logLevelOptions, methodOptions, statusOptions } from "@/app/logs/logs-utils";

type LogsFilterCardProps = {
  filters: SystemLogFilters;
  isLoading: boolean;
  hasActiveFilters?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateFilter: (key: keyof SystemLogFilters, value: string) => void;
  onClearFilters: () => void;
};

export function LogsFilterCard({
  filters,
  isLoading,
  hasActiveFilters = false,
  onSubmit,
  onUpdateFilter,
  onClearFilters,
}: LogsFilterCardProps) {
  const advancedCount = [
    filters.username?.trim(),
    filters.module?.trim(),
    filters.operation_type?.trim(),
    filters.ip_address?.trim(),
  ].filter(Boolean).length;

  const [advancedOpen, setAdvancedOpen] = useState(advancedCount > 0);
  const showAdvanced = advancedOpen || advancedCount > 0;

  return (
    <form
      className="rounded-[14px] border border-border/80 bg-surface p-3 shadow-2xs"
      onSubmit={onSubmit}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="日志摘要或接口筛选"
            placeholder="搜索摘要、接口路径或关键字…"
            value={filters.summary || ""}
            onChange={(event) => onUpdateFilter("summary", event.target.value)}
            className="h-8 rounded-lg pr-7 pl-8 text-xs"
          />
          {filters.summary ? (
            <button
              type="button"
              aria-label="清除搜索关键字"
              onClick={() => onUpdateFilter("summary", "")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>

        <Select value={filters.method || "all"} onValueChange={(value) => onUpdateFilter("method", value)}>
          <SelectTrigger aria-label="HTTP 方法筛选" className="h-8 w-28 rounded-lg text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部方法</SelectItem>
            {methodOptions.map((method) => (
              <SelectItem key={method} value={method}>
                {method}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.status || "all"} onValueChange={(value) => onUpdateFilter("status", value)}>
          <SelectTrigger aria-label="HTTP 状态码筛选" className="h-8 w-32 rounded-lg text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态码</SelectItem>
            {statusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.log_level || "all"} onValueChange={(value) => onUpdateFilter("log_level", value)}>
          <SelectTrigger aria-label="日志级别筛选" className="h-8 w-28 rounded-lg text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部级别</SelectItem>
            {logLevelOptions.map((level) => (
              <SelectItem key={level} value={level}>
                {level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DateRangeFilter
          className="h-8 w-52"
          startDate={filters.start_date || ""}
          endDate={filters.end_date || ""}
          onChange={(startDate, endDate) => {
            onUpdateFilter("start_date", startDate);
            onUpdateFilter("end_date", endDate);
          }}
        />

        <Button
          type="button"
          variant={showAdvanced ? "secondary" : "outline"}
          size="sm"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          aria-expanded={showAdvanced}
        >
          <SlidersHorizontal className="size-3.5" />
          高级筛选
          {advancedCount > 0 ? (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background tabular-nums">
              {advancedCount}
            </span>
          ) : (
            <ChevronDown className={cn("size-3.5 transition-transform", showAdvanced && "rotate-180")} />
          )}
        </Button>

        <Button type="submit" size="sm" disabled={isLoading}>
          {isLoading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
          查询
        </Button>

        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onClearFilters();
              setAdvancedOpen(false);
            }}
          >
            <X className="size-3.5" />
            重置
          </Button>
        ) : null}
      </div>

      {showAdvanced ? (
        <div className="mt-3 grid grid-cols-1 gap-2.5 border-t border-border/60 pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            aria-label="操作人筛选"
            placeholder="操作人（如 admin / anonymous）"
            value={filters.username || ""}
            onChange={(event) => onUpdateFilter("username", event.target.value)}
            className="h-8 rounded-lg text-xs"
          />
          <Input
            aria-label="日志模块筛选"
            placeholder="模块名称"
            value={filters.module || ""}
            onChange={(event) => onUpdateFilter("module", event.target.value)}
            className="h-8 rounded-lg text-xs"
          />
          <Input
            aria-label="操作类型筛选"
            placeholder="操作类型"
            value={filters.operation_type || ""}
            onChange={(event) => onUpdateFilter("operation_type", event.target.value)}
            className="h-8 rounded-lg text-xs"
          />
          <Input
            aria-label="IP 地址筛选"
            placeholder="来源 IP 地址"
            value={filters.ip_address || ""}
            onChange={(event) => onUpdateFilter("ip_address", event.target.value)}
            className="h-8 rounded-lg text-xs"
          />
        </div>
      ) : null}
    </form>
  );
}
