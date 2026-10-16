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

export function creditReasonLabel(reason?: string | null) {
  switch (reason) {
    case "signup":
      return "注册奖励";
    case "checkin":
      return "每日签到";
    case "invite":
      return "邀请奖励";
    case "card_redeem":
      return "卡密兑换";
    case "image_generation":
      return "图片生成";
    case "image_edit":
      return "图片编辑";
    case "image_refund":
      return "图片返还";
    case "video_generation":
      return "视频生成";
    case "video_refund":
      return "视频返还";
    default:
      return reason || "积分变动";
  }
}

export function providerLabel(provider?: string) {
  if (provider === "local" || !provider) {
    return "本地账号";
  }
  return provider;
}

export function sessionRoleLabel(session: StoredAuthSession) {
  if (session.role === "admin") {
    return "管理员";
  }
  return session.roleName || "普通用户";
}

export function maskKey(hasKey: boolean) {
  return hasKey ? "sk-••••••••••••••••••••••••••••••••" : "未生成";
}

export function sortCreditLedgerDesc(items: CreditLedgerEntry[]) {
  return [...items].sort((a, b) => {
    const bTime = new Date(b.created_at || "").getTime() || 0;
    const aTime = new Date(a.created_at || "").getTime() || 0;
    return bTime - aTime;
  });
}
