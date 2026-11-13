export type AssetsTypeTab = "all" | "image" | "video" | "expiring";
export type AssetsScope = "mine" | "public" | "all";
export type AssetsVisibilityFilter = "all" | "private" | "public";
export type AssetsOrientationFilter = "all" | "landscape" | "portrait" | "square";

export type AssetsTabOption = {
  value: AssetsTypeTab;
  label: string;
};

export type ImageExpiryBadgeSpec = {
  label: string;
  urgent: boolean;
};

export const EXPIRING_SOON_WINDOW_MS = 3 * 86_400_000;

export function getAssetsTypeTabOptions(
  cloudStorageEnabled: boolean,
): AssetsTabOption[] {
  const base: AssetsTabOption[] = [
    { value: "all", label: "全部素材" },
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
  ];
  if (cloudStorageEnabled) {
    base.push({ value: "expiring", label: "即将过期" });
  }
  return base;
}

export function parseAssetsTypeTab(
  raw: string | null | undefined,
  cloudStorageEnabled: boolean,
): AssetsTypeTab {
  if (raw === "image" || raw === "video") return raw;
  if (raw === "expiring") {
    return cloudStorageEnabled ? "expiring" : "all";
  }
  return "all";
}

export function parseAssetsScope(
  raw: string | null | undefined,
  isAdmin: boolean,
): AssetsScope {
  if (raw === "public") return "public";
  if (raw === "all" && isAdmin) return "all";
  return "mine";
}

export function isImageExpiringSoon(
  expiresAt?: string,
  nowMs = Date.now(),
): boolean {
  if (!expiresAt) return false;
  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) return false;
  return parsed - nowMs <= EXPIRING_SOON_WINDOW_MS;
}

export function isImageRetentionExpired(options: {
  cloudStorageEnabled: boolean;
  scope: AssetsScope;
  expiresAt?: string;
  nowMs?: number;
}): boolean {
  const { cloudStorageEnabled, scope, expiresAt, nowMs = Date.now() } = options;
  if (!cloudStorageEnabled || scope === "public" || !expiresAt) {
    return false;
  }
  const parsed = Date.parse(expiresAt);
  return Number.isFinite(parsed) && parsed <= nowMs;
}

export function resolveImageExpiryBadge(options: {
  cloudStorageEnabled: boolean;
  scope: AssetsScope;
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

export function resolveAssetOrientation(input: {
  orientation?: string;
  width?: number;
  height?: number;
  size?: string;
  aspectRatio?: string;
}): "landscape" | "portrait" | "square" {
  const explicit = (input.orientation || "").trim().toLowerCase();
  if (explicit === "landscape" || explicit === "portrait" || explicit === "square") {
    return explicit;
  }
  if (
    typeof input.width === "number" &&
    typeof input.height === "number" &&
    input.width > 0 &&
    input.height > 0
  ) {
    const ratio = input.width / input.height;
    if (Math.abs(ratio - 1) <= 0.08) return "square";
    return ratio > 1 ? "landscape" : "portrait";
  }
  const sizeMatch = /^(\d+)x(\d+)$/i.exec((input.size || "").trim());
  if (sizeMatch) {
    const w = Number(sizeMatch[1]);
    const h = Number(sizeMatch[2]);
    if (w > 0 && h > 0) {
      if (Math.abs(w / h - 1) <= 0.08) return "square";
      return w > h ? "landscape" : "portrait";
    }
  }
  const ratioMatch = /^(\d+(?:\.\d+)?)[:/](\d+(?:\.\d+)?)$/.exec(
    (input.aspectRatio || "").trim(),
  );
  if (ratioMatch) {
    const w = Number(ratioMatch[1]);
    const h = Number(ratioMatch[2]);
    if (w > 0 && h > 0) {
      if (Math.abs(w / h - 1) <= 0.08) return "square";
      return w > h ? "landscape" : "portrait";
    }
  }
  return "square";
}

export function parseAssetTimestamp(value?: string): number {
  if (!value) return 0;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
