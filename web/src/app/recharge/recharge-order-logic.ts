import type { PaymentOrder, RechargeProduct } from "../../lib/user-payment-api";

const ESCAPABLE_STATUS_SET = new Set([
  "succeeded",
  "closed",
  "expired",
  "failed",
  "exception",
]);

export interface RechargeOrderActionState {
  escapable: boolean;
  cancellable: boolean;
  expiredPending: boolean;
  showRefresh: boolean;
  showReset: boolean;
  resetLabel: string;
  refreshLabel: string;
  cancelLabel: string;
}

export function resolveRechargeOrderActionState(
  order: Pick<PaymentOrder, "status">,
  clientExpired = false,
): RechargeOrderActionState {
  const escapable = ESCAPABLE_STATUS_SET.has(order.status);
  const cancellable = order.status === "created" || order.status === "pending";
  const expiredPending = clientExpired && cancellable;

  if (expiredPending) {
    return {
      escapable: false,
      cancellable: true,
      expiredPending: true,
      showRefresh: true,
      showReset: false,
      resetLabel: "取消并重选套餐",
      refreshLabel: "我已支付，立即同步",
      cancelLabel: "取消并重选套餐",
    };
  }

  if (escapable) {
    return {
      escapable: true,
      cancellable: false,
      expiredPending: false,
      showRefresh: order.status === "exception",
      showReset: true,
      resetLabel: order.status === "succeeded" ? "完成并返回" : "返回重选套餐",
      refreshLabel: "刷新核查状态",
      cancelLabel: "取消订单",
    };
  }

  return {
    escapable: false,
    cancellable,
    expiredPending: false,
    showRefresh: true,
    showReset: false,
    resetLabel: "返回重选套餐",
    refreshLabel: "我已支付，刷新状态",
    cancelLabel: "取消订单",
  };
}

export interface CustomCreditsValidationResult {
  valid: boolean;
  isEmpty: boolean;
  numericValue: number | null;
  amountFen: number;
  errorMessage: string;
}

export function validateCustomCreditsDraft(
  draftText: string,
  minCredits: number,
  maxCredits: number,
  unitPriceFen: number,
): CustomCreditsValidationResult {
  const trimmed = draftText.trim();
  if (!trimmed) {
    return {
      valid: false,
      isEmpty: true,
      numericValue: null,
      amountFen: 0,
      errorMessage: `请输入 ${minCredits}–${maxCredits} 之间的整数积分`,
    };
  }

  if (!/^\d+$/.test(trimmed)) {
    return {
      valid: false,
      isEmpty: false,
      numericValue: null,
      amountFen: 0,
      errorMessage: "仅支持输入正整数积分数量",
    };
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return {
      valid: false,
      isEmpty: false,
      numericValue: null,
      amountFen: 0,
      errorMessage: "请输入有效的正整数积分数量",
    };
  }

  const safeUnitPrice = Math.max(0, Number(unitPriceFen) || 0);
  const amountFen = Math.round(parsed * safeUnitPrice);

  if (parsed < minCredits) {
    return {
      valid: false,
      isEmpty: false,
      numericValue: parsed,
      amountFen,
      errorMessage: `单笔最少充值 ${minCredits} 积分`,
    };
  }

  if (parsed > maxCredits) {
    return {
      valid: false,
      isEmpty: false,
      numericValue: parsed,
      amountFen,
      errorMessage: `单笔最多充值 ${maxCredits} 积分`,
    };
  }

  return {
    valid: true,
    isEmpty: false,
    numericValue: parsed,
    amountFen,
    errorMessage: "",
  };
}

export function isCloudStorageProduct(
  product: Pick<RechargeProduct, "product_type">,
): boolean {
  return (
    product.product_type === "cloud_storage" ||
    product.product_type === "storage"
  );
}

export function pickRecommendedProductId(
  products: ReadonlyArray<RechargeProduct>,
): string | null {
  const compute = products.filter(
    (item) =>
      !isCloudStorageProduct(item) && item.credits > 0 && item.amount_fen > 0,
  );
  if (compute.length >= 2) {
    const sortedByPrice = [...compute].sort(
      (a, b) => a.amount_fen - b.amount_fen,
    );
    const midIdx = Math.min(
      sortedByPrice.length - 1,
      Math.floor(sortedByPrice.length / 2),
    );
    return sortedByPrice[midIdx]?.id ?? null;
  }
  const storage = products.filter(
    (item) => isCloudStorageProduct(item) && item.amount_fen > 0,
  );
  if (storage.length >= 2) {
    const sorted = [...storage].sort((a, b) => a.amount_fen - b.amount_fen);
    return sorted[Math.floor(sorted.length / 2)]?.id ?? null;
  }
  return null;
}

export interface ProductValueMetrics {
  unitRateLabel: string;
  savingsPercent: number | null;
  capacityHint: string;
  isRecommended: boolean;
}

export function computeProductValueMetrics(
  product: RechargeProduct,
  baseCreditUnitPriceFen: number,
  recommendedId: string | null,
): ProductValueMetrics {
  const isRecommended = recommendedId !== null && product.id === recommendedId;

  if (isCloudStorageProduct(product)) {
    const days = Math.max(0, Number(product.storage_days) || 0);
    const dailyYuan = days > 0 ? product.amount_fen / 100 / days : 0;
    return {
      unitRateLabel:
        days > 0 ? `折合 ¥${dailyYuan.toFixed(2)} / 天` : "云存储会员套餐",
      savingsPercent: null,
      capacityHint:
        days > 0
          ? `尊享 ${days} 天云端原图与作品长期留存`
          : "云端原图与历史作品安全保存",
      isRecommended,
    };
  }

  const credits = Math.max(0, Number(product.credits) || 0);
  if (credits <= 0) {
    return {
      unitRateLabel: "即时自动到账",
      savingsPercent: null,
      capacityHint: "扫码支付后权益自动充入",
      isRecommended,
    };
  }

  const unitFen = product.amount_fen / credits;
  const per100Yuan = unitFen;
  const effectiveBase = Math.max(0, Number(baseCreditUnitPriceFen) || 0);
  let savingsPercent: number | null = null;
  if (effectiveBase > 0 && unitFen < effectiveBase * 0.98) {
    const pct = Math.round((1 - unitFen / effectiveBase) * 100);
    if (pct >= 2 && pct < 95) {
      savingsPercent = pct;
    }
  }

  const approxImages = Math.max(1, Math.floor(credits / 5));

  return {
    unitRateLabel: `折合 ¥${per100Yuan.toFixed(2)} / 百积分`,
    savingsPercent,
    capacityHint: `约可生图 ${new Intl.NumberFormat("zh-CN").format(approxImages)} 张`,
    isRecommended,
  };
}

export function isExternalHttpPaymentUrl(codeUrl?: string | null): boolean {
  if (!codeUrl) return false;
  return /^https?:\/\//i.test(codeUrl.trim());
}

export function formatPaymentCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

