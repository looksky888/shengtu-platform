export const MIN_IMAGE_COUNT = 1;
export const MAX_IMAGE_COUNT = 15;

export function normalizeRequestedImageCount(value: string | number) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric < MIN_IMAGE_COUNT) {
    return MIN_IMAGE_COUNT;
  }
  return Math.min(MAX_IMAGE_COUNT, numeric);
}

export function sanitizeImageCountInput(raw: string) {
  const digits = String(raw ?? "").replace(/\D+/g, "");
  if (!digits) {
    return "";
  }
  const numeric = Number.parseInt(digits, 10);
  if (!Number.isFinite(numeric) || numeric < MIN_IMAGE_COUNT) {
    return String(MIN_IMAGE_COUNT);
  }
  if (numeric > MAX_IMAGE_COUNT) {
    return String(MAX_IMAGE_COUNT);
  }
  return String(numeric);
}

const NON_RETRYABLE_QUOTA_PATTERNS = [
  "额度已用尽",
  "消费额度",
  "配额已用尽",
  "今日额度",
  "每日请求",
  "每日限额",
  "余额不足",
  "积分不足",
  "insufficient_quota",
  "quota_exceeded",
  "billing_hard_limit",
  "daily",
];

export function isRetryableSubmitCapacityError(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown } | null | undefined)?.message === "string"
        ? String((error as { message: string }).message)
        : String(error ?? "");
  const lowerMessage = rawMessage.toLowerCase();
  if (
    NON_RETRYABLE_QUOTA_PATTERNS.some((pattern) =>
      lowerMessage.includes(pattern.toLowerCase()),
    )
  ) {
    return false;
  }
  const status = (error as { status?: number } | null | undefined)?.status;
  if (status === 429) {
    return true;
  }
  return (
    rawMessage.includes("并发限制") ||
    rawMessage.includes("RPM") ||
    rawMessage.includes("速率限制") ||
    rawMessage.includes("队列已满")
  );
}
