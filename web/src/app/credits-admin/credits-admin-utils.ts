import type { ComponentProps } from "react";

import type { Badge } from "@/components/ui/badge";
import type { CreditAccount, CreditCard, CreditLedgerEntry, GeneratedCreditCard } from "@/lib/api";
import { chinaTodayKey, formatDateTime as formatBizDateTime, isWithinChinaTimeFilter, type TimeRangeFilter } from "@/lib/datetime";

export const ADMIN_TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export type AdminTablePageSize = typeof ADMIN_TABLE_PAGE_SIZE_OPTIONS[number];
export type TimeFilter = TimeRangeFilter;
export type BadgeVariant = ComponentProps<typeof Badge>["variant"];

export function adminTimeBounds(filter: TimeFilter): { start_at?: string; end_at?: string } {
  if (filter === "all") return {};
  if (filter === "today") {
    const day = chinaTodayKey();
    return { start_at: day, end_at: day };
  }
  const days = filter === "7d" ? 7 : 30;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start_at: chinaTodayKey(start), end_at: chinaTodayKey(end) };
}

export function pagedResult<T>(items: T[], total: number, page: number, pageSize: number) {
  return { currentPage: page, totalPages: getTotalPages(total, pageSize), items };
}

export function normalizeCreditCards(items: CreditCard[] | null | undefined) {
  return Array.isArray(items) ? items : [];
}

export function normalizeCreditLedger(items: CreditLedgerEntry[] | null | undefined) {
  return Array.isArray(items) ? items : [];
}

export function normalizeCreditUsers(items: CreditAccount[] | null | undefined) {
  return Array.isArray(items) ? items : [];
}

export function normalizeGeneratedCreditCards(items: GeneratedCreditCard[] | null | undefined) {
  return Array.isArray(items) ? items : [];
}

export function formatDateTime(value?: string | null) {
  return formatBizDateTime(value, { withSeconds: false });
}

export function formatCreditNumber(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

export function formatCardStatus(status: CreditCard["status"]) {
  switch (status) {
    case "active": return "未使用";
    case "used": return "已使用";
    case "disabled": return "已禁用";
    default: return status;
  }
}

export function cardStatusVariant(status: CreditCard["status"]): BadgeVariant {
  switch (status) {
    case "active": return "success";
    case "used": return "secondary";
    case "disabled": return "danger";
    default: return "secondary";
  }
}

export function deltaBadgeVariant(delta: number): BadgeVariant {
  if (delta > 0) return "success";
  if (delta < 0) return "warning";
  return "secondary";
}

export function formatSignedDelta(delta: number) {
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return `${sign}${formatCreditNumber(Math.abs(delta))}`;
}

export function copyGeneratedKeysText(items: GeneratedCreditCard[]) {
  return items.map((item) => item.key).join("\n");
}

export function getTotalPages(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const totalPages = getTotalPages(items.length, pageSize);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return { currentPage, totalPages, items: items.slice(start, start + pageSize) };
}

export function isWithinTimeFilter(value: string | null | undefined, filter: TimeFilter) {
  return isWithinChinaTimeFilter(value, filter);
}

export function searchableText(values: Array<unknown>) {
  return values.filter(Boolean).join(" ").toLowerCase();
}
