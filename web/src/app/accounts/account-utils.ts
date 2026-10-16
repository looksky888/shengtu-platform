import type { ComponentProps } from "react";
import { Ban, CheckCircle2, CircleAlert, CircleOff, RefreshCw, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Account, AccountStatus, AccountType } from "@/lib/api";
import { formatDateTime, parseDateTime } from "@/lib/datetime";

export const accountTypeOptions: { label: string; value: AccountType | "all" }[] = [
  { label: "全部类型", value: "all" },
  { label: "Free", value: "Free" },
  { label: "Plus", value: "Plus" },
  { label: "ProLite", value: "ProLite" },
  { label: "Team", value: "Team" },
  { label: "Pro", value: "Pro" },
];

export const accountStatusOptions: { label: string; value: AccountStatus | "all" }[] = [
  { label: "全部状态", value: "all" },
  { label: "正常", value: "正常" },
  { label: "限流", value: "限流" },
  { label: "异常", value: "异常" },
  { label: "禁用", value: "禁用" },
];

export const statusMeta: Record<AccountStatus, { icon: typeof CheckCircle2; badge: ComponentProps<typeof Badge>["variant"] }> = {
  正常: { icon: CheckCircle2, badge: "success" },
  限流: { icon: CircleAlert, badge: "warning" },
  异常: { icon: CircleOff, badge: "danger" },
  禁用: { icon: Ban, badge: "secondary" },
};

export const metricCards = [
  { key: "total", label: "账户总数", icon: UserRound, className: "border-transparent bg-[linear-gradient(135deg,#181e25,#45515e)] text-white" },
  { key: "active", label: "正常账户", icon: CheckCircle2, className: "border-transparent bg-[linear-gradient(135deg,#1456f0,#3daeff)] text-white" },
  { key: "limited", label: "限流账户", icon: CircleAlert, className: "border-transparent bg-[linear-gradient(135deg,#f59e0b,#fb7185)] text-white" },
  { key: "abnormal", label: "异常账户", icon: CircleOff, className: "border-transparent bg-[linear-gradient(135deg,#ea5ec1,#7c3aed)] text-white" },
  { key: "disabled", label: "禁用账户", icon: Ban, className: "border-transparent bg-[linear-gradient(135deg,#8e8e93,#45515e)] text-white" },
  { key: "quota", label: "剩余额度", icon: RefreshCw, className: "border-transparent bg-[linear-gradient(135deg,#17437d,#60a5fa)] text-white" },
] as const;

export type AccountsSummary = {
  total: number;
  active: number;
  limited: number;
  abnormal: number;
  disabled: number;
  quota: string;
};

export function isUnlimitedImageQuotaAccount(account: Account) {
  return account.type === "Pro" || account.type === "ProLite";
}

export function formatCompact(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return String(value);
}

export function formatQuota(account: Account) {
  if (isUnlimitedImageQuotaAccount(account)) {
    return "∞";
  }
  if (account.imageQuotaUnknown) {
    return "未知";
  }
  return String(Math.max(0, account.quota));
}

export function formatRestoreAt(value?: string | null) {
  if (!value) {
    return { absolute: "—", relative: "" };
  }
  const date = parseDateTime(value);
  if (!date) {
    return { absolute: value, relative: "" };
  }
  const diffMs = Math.max(0, date.getTime() - Date.now());
  const totalHours = Math.ceil(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const relative = diffMs > 0 ? `剩余 ${days}d ${hours}h` : "已到恢复时间";
  const absolute = formatDateTime(value, { withSeconds: true });
  return { absolute, relative };
}

export function formatQuotaSummary(accounts: Account[]) {
  const availableAccounts = accounts.filter((account) => account.status === "正常");
  if (availableAccounts.some(isUnlimitedImageQuotaAccount)) {
    return "∞";
  }
  if (availableAccounts.some((account) => account.imageQuotaUnknown)) {
    return "未知";
  }
  return formatCompact(availableAccounts.reduce((sum, account) => sum + Math.max(0, account.quota), 0));
}

export function maskToken(token?: string) {
  if (!token) return "—";
  if (token.length <= 18) return token;
  return `${token.slice(0, 16)}...${token.slice(-8)}`;
}

export function downloadTokenFile(tokens: string[]) {
  const content = `${tokens.join("\n")}\n`;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `accounts-${Date.now()}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

export function normalizeAccounts(items: Account[] | null | undefined): Account[] {
  const accountItems = Array.isArray(items) ? items : [];
  return accountItems.map((item) => ({
    ...item,
    type: item.type === "Plus" || item.type === "ProLite" || item.type === "Team" || item.type === "Pro" || item.type === "Free" ? item.type : "Free",
  }));
}

export function buildAccountsSummary(accounts: Account[]): AccountsSummary {
  return {
    total: accounts.length,
    active: accounts.filter((item) => item.status === "正常").length,
    limited: accounts.filter((item) => item.status === "限流").length,
    abnormal: accounts.filter((item) => item.status === "异常").length,
    disabled: accounts.filter((item) => item.status === "禁用").length,
    quota: formatQuotaSummary(accounts),
  };
}

export function buildPaginationItems(pageCount: number, safePage: number) {
  const items: (number | "...")[] = [];
  const start = Math.max(1, safePage - 1);
  const end = Math.min(pageCount, safePage + 1);
  if (start > 1) items.push(1);
  if (start > 2) items.push("...");
  for (let current = start; current <= end; current += 1) items.push(current);
  if (end < pageCount - 1) items.push("...");
  if (end < pageCount) items.push(pageCount);
  return items;
}