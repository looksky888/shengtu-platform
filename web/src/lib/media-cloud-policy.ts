export type MediaGalleryScope = "mine" | "public" | "all";

export type ImageExpiryBadgeSpec = {
  label: string;
  urgent: boolean;
};

export function resolveImageExpiryBadge(options: {
  cloudStorageEnabled: boolean;
  scope: MediaGalleryScope;
  expiresAt?: string;
  nowMs?: number;
}): ImageExpiryBadgeSpec | null {
  const { cloudStorageEnabled, scope, expiresAt, nowMs = Date.now() } = options;
  if (!cloudStorageEnabled || scope !== "mine" || !expiresAt) {
    return null;
  }
  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const diffMs = parsed - nowMs;
  if (diffMs <= 0) {
    return { label: "即将清理", urgent: true };
  }
  if (diffMs < 86_400_000) {
    const hours = Math.max(1, Math.ceil(diffMs / 3_600_000));
    return { label: `不足 ${hours} 小时`, urgent: true };
  }
  const days = Math.max(1, Math.ceil(diffMs / 86_400_000));
  return { label: `剩余 ${days} 天`, urgent: days <= 3 };
}
