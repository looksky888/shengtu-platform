const secretConfigKeys = new Set([
  "image_proxy_api_key",
  "media_r2_secret_access_key",
]);

function sortValue(value: unknown, omitKeys: Set<string>, secretKeys: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => sortValue(item, omitKeys, secretKeys));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !omitKeys.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, secretKeys.has(key) ? (String(item || "").trim() ? "__provided__" : "") : sortValue(item, omitKeys, secretKeys)]),
  );
}

export function settingsSnapshot(value: unknown, omitKeys: Set<string> = new Set()) {
  return JSON.stringify(sortValue(value, omitKeys, new Set()));
}

/** Snapshot only fields that are editable in the registration form. Runtime stats/logs are excluded. */
export function registerConfigSnapshot(value: unknown) {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const editable = {
    mail: source.mail,
    proxy: source.proxy,
    total: source.total,
    threads: source.threads,
    mode: source.mode,
    target: source.target,
    target_quota: source.target_quota,
    target_available: source.target_available,
    check_interval: source.check_interval,
    clearance: source.clearance,
    grok: source.grok,
  };
  return settingsSnapshot(editable);
}

export function configSnapshot(value: unknown) {
  return JSON.stringify(sortValue(value, new Set(), secretConfigKeys));
}

export function mergeConfigSnapshot(previous: string, nextValue: unknown, keys: readonly string[]) {
  const previousValue = (() => {
    try {
      const parsed = JSON.parse(previous);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...(parsed as Record<string, unknown>) } : {};
    } catch {
      return {};
    }
  })();
  const next = nextValue && typeof nextValue === "object" ? (nextValue as Record<string, unknown>) : {};
  const secretKeys = new Set(["image_proxy_api_key", "media_r2_secret_access_key"]);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    // The server intentionally omits write-only secrets from its response. Preserve the
    // existing "provided" marker after a successful section save instead of turning it
    // into an empty value and immediately reporting a false dirty state.
    if (secretKeys.has(key) && !String(next[key] ?? "").trim() && previousValue[key] === "__provided__") continue;
    previousValue[key] = next[key];
  }
  return configSnapshot(previousValue);
}
