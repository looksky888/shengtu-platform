export type UpstreamClearanceMode = "none" | "flaresolverr" | "manual";

function isValidHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function upstreamProxyErrors(
  config: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!config) return {};
  const errors: Record<string, string> = {};
  const enabled = Boolean(config.upstream_clearance_enabled);
  const mode = String(config.upstream_clearance_mode || "none");

  const checkInt = (
    key: string,
    label: string,
    min: number,
    max: number,
    fallback?: number,
  ) => {
    const raw = config[key];
    if ((raw === undefined || raw === null) && fallback !== undefined) {
      return;
    }
    const text = String(raw ?? "").trim();
    const num = text === "" ? Number.NaN : Number(text);
    if (!Number.isInteger(num) || num < min || num > max) {
      errors[key] = `${label}必须为 ${min}–${max} 秒的整数`;
    }
  };

  if (enabled) {
    if (mode === "flaresolverr") {
      const flareUrl = String(config.flaresolverr_url ?? "").trim();
      if (!flareUrl) {
        errors.flaresolverr_url =
          "开启 FlareSolverr 自动过盾时请填写服务地址";
      } else if (!isValidHttpUrl(flareUrl)) {
        errors.flaresolverr_url =
          "请填写以 http:// 或 https:// 开头的 FlareSolverr 地址";
      }
    }
    checkInt("upstream_clearance_timeout_sec", "过盾请求超时", 10, 300, 60);
    checkInt(
      "upstream_clearance_refresh_interval",
      "缓存续期间隔",
      60,
      86400,
      3600,
    );
  }

  checkInt(
    "image_challenge_cooldown_seconds",
    "触发 CF 盾后单账号冷却",
    60,
    7200,
    900,
  );

  return errors;
}
