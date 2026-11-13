export function formatCreditNumber(
  value: unknown,
  options: { integerOnly?: boolean } = {},
): string {
  const numericValue =
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (options.integerOnly) {
    return new Intl.NumberFormat("zh-CN").format(Math.trunc(numericValue));
  }
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2,
  }).format(numericValue);
}

export function formatStorageQuota(
  bytes: number,
  zeroLabel = "不限张数畅存",
): string {
  if (!bytes || bytes <= 0) {
    return zeroLabel;
  }
  const gb = bytes / 1024 ** 3;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}
