import type { CreditLedgerEntry, UserKey } from "@/lib/api";
import { formatDateTime as formatBizDateTime } from "@/lib/datetime";
import type { StoredAuthSession } from "@/store/auth";

export function normalizeProfileKeys(items: UserKey[] | null | undefined) {
  return Array.isArray(items) ? items : [];
}

export function formatDateTime(value?: string | null) {
  return formatBizDateTime(value, { withSeconds: false });
}

export function formatCreditNumber(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0";
  }
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

export function formatCreditBalance(value?: number | null) {
  return `${formatCreditNumber(value)} 积分`;
}

export function formatSignedCreditDelta(value?: number | null) {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}${formatCreditNumber(Math.abs(amount))}`;
}

export function sessionRoleLabel(session: StoredAuthSession) {
  if (session.role === "admin") {
    return "管理员";
  }
  return session.roleName || "普通用户";
}

export function maskKey(hasKey: boolean, keyHint?: string | null) {
  if (!hasKey) {
    return "尚未生成密钥";
  }
  const hint = typeof keyHint === "string" ? keyHint.trim() : "";
  if (hint) {
    return hint;
  }
  return "sk-••••••••••••••••••••••••••••••••";
}

export function sortCreditLedgerDesc(items: CreditLedgerEntry[]) {
  return [...items].sort((a, b) => {
    const bTime = new Date(b.created_at || "").getTime() || 0;
    const aTime = new Date(a.created_at || "").getTime() || 0;
    return bTime - aTime;
  });
}
