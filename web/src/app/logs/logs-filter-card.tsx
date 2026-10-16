import type { FormEvent } from "react";
import { LoaderCircle, Search, X } from "lucide-react";

import { DateRangeFilter } from "@/components/date-range-filter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
};

export function LogsFilterCard({ filters, isLoading, onSubmit, onUpdateFilter, onClearFilters }: LogsFilterCardProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>{"筛选条件"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={onSubmit}>
          <Input aria-label="操作人筛选" placeholder={"操作人"} value={filters.username || ""} onChange={(event) => onUpdateFilter("username", event.target.value)} />
          <Input aria-label="日志模块筛选" placeholder={"模块"} value={filters.module || ""} onChange={(event) => onUpdateFilter("module", event.target.value)} />
          <Input aria-label="日志摘要或接口筛选" placeholder={"摘要/接口"} value={filters.summary || ""} onChange={(event) => onUpdateFilter("summary", event.target.value)} />
          <Input aria-label="IP 地址筛选" placeholder={"IP 地址"} value={filters.ip_address || ""} onChange={(event) => onUpdateFilter("ip_address", event.target.value)} />
          <Input aria-label="操作类型筛选" placeholder={"操作类型"} value={filters.operation_type || ""} onChange={(event) => onUpdateFilter("operation_type", event.target.value)} />
          <Select value={filters.method || "all"} onValueChange={(value) => onUpdateFilter("method", value)}>
            <SelectTrigger aria-label="HTTP 方法筛选"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{"全部方法"}</SelectItem>
              {methodOptions.map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.status || "all"} onValueChange={(value) => onUpdateFilter("status", value)}>
            <SelectTrigger aria-label="HTTP 状态码筛选"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{"全部状态码"}</SelectItem>
              {statusOptions.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.log_level || "all"} onValueChange={(value) => onUpdateFilter("log_level", value)}>
            <SelectTrigger aria-label="日志级别筛选"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{"全部级别"}</SelectItem>
              {logLevelOptions.map((level) => <SelectItem key={level} value={level}>{level}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="md:col-span-2 xl:col-span-2">
            <DateRangeFilter
              startDate={filters.start_date || ""}
              endDate={filters.end_date || ""}
              onChange={(startDate, endDate) => {
                onUpdateFilter("start_date", startDate);
                onUpdateFilter("end_date", endDate);
              }}
            />
          </div>
          <div className="flex gap-2 md:col-span-2 xl:col-span-2">
            <Button type="submit" disabled={isLoading} className="h-10 rounded-lg">
              {isLoading ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
              {"查询"}
            </Button>
            <Button type="button" variant="outline" onClick={onClearFilters} className="h-10 rounded-lg">
              <X className="size-4" />
              {"清空"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
