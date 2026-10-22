import type { FormEvent } from "react";
import { LoaderCircle, RefreshCw, Search, X } from "lucide-react";

import { DateRangeFilter } from "@/components/date-range-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SystemLogFilters } from "@/lib/api";
import { logLevelOptions, methodOptions, statusOptions } from "@/app/logs/logs-utils";

type LogsFilterCardProps = {
  filters: SystemLogFilters;
  isLoading: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateFilter: (key: keyof SystemLogFilters, value: string) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
};

export function LogsFilterCard({
  filters,
  isLoading,
  onSubmit,
  onUpdateFilter,
  onClearFilters,
  onRefresh,
}: LogsFilterCardProps) {
  return (
    <form
      className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs"
      onSubmit={onSubmit}
    >
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          aria-label="日志摘要或接口筛选"
          placeholder={"摘要/接口"}
          value={filters.summary || ""}
          onChange={(event) => onUpdateFilter("summary", event.target.value)}
          className="h-9 rounded-lg"
        />
        <Input
          aria-label="日志模块筛选"
          placeholder={"模块"}
          value={filters.module || ""}
          onChange={(event) => onUpdateFilter("module", event.target.value)}
          className="h-9 rounded-lg"
        />
        <Input
          aria-label="操作人筛选"
          placeholder={"操作人"}
          value={filters.username || ""}
          onChange={(event) => onUpdateFilter("username", event.target.value)}
          className="h-9 rounded-lg"
        />
        <Input
          aria-label="操作类型筛选"
          placeholder={"操作类型"}
          value={filters.operation_type || ""}
          onChange={(event) => onUpdateFilter("operation_type", event.target.value)}
          className="h-9 rounded-lg"
        />
        <Input
          aria-label="IP 地址筛选"
          placeholder={"IP 地址"}
          value={filters.ip_address || ""}
          onChange={(event) => onUpdateFilter("ip_address", event.target.value)}
          className="h-9 rounded-lg"
        />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filters.method || "all"} onValueChange={(value) => onUpdateFilter("method", value)}>
            <SelectTrigger aria-label="HTTP 方法筛选" className="h-9 w-32 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{"全部方法"}</SelectItem>
              {methodOptions.map((method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.status || "all"} onValueChange={(value) => onUpdateFilter("status", value)}>
            <SelectTrigger aria-label="HTTP 状态码筛选" className="h-9 w-36 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{"全部状态码"}</SelectItem>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.log_level || "all"} onValueChange={(value) => onUpdateFilter("log_level", value)}>
            <SelectTrigger aria-label="日志级别筛选" className="h-9 w-32 rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{"全部级别"}</SelectItem>
              {logLevelOptions.map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangeFilter
            className="w-56 sm:w-56"
            startDate={filters.start_date || ""}
            endDate={filters.end_date || ""}
            onChange={(startDate, endDate) => {
              onUpdateFilter("start_date", startDate);
              onUpdateFilter("end_date", endDate);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={isLoading} className="h-9 rounded-lg px-4">
            {isLoading ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
            {"查询"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClearFilters} className="h-9 rounded-lg">
            <X className="size-4" />
            {"清空"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isLoading} className="h-9 rounded-lg">
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            {"刷新"}
          </Button>
        </div>
      </div>
    </form>
  );
}
