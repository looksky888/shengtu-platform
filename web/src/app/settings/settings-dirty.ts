import type { SettingsConfig } from "@/lib/settings-types";

const secretConfigKeys = new Set([
  "image_proxy_api_key",
  "media_r2_secret_access_key",
]);

function sortValue(
  value: unknown,
  omitKeys: Set<string>,
  secretKeys: Set<string>
): unknown {
  if (Array.isArray(value))
    return value.map((item) => sortValue(item, omitKeys, secretKeys));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !omitKeys.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [
        key,
        secretKeys.has(key)
          ? String(item || "").trim()
            ? "__provided__"
            : ""
          : sortValue(item, omitKeys, secretKeys),
      ])
  );
}

export function settingsSnapshot(
  value: unknown,
  omitKeys: Set<string> = new Set()
) {
  return JSON.stringify(sortValue(value, omitKeys, new Set()));
}

export function configSnapshot(value: unknown) {
  return JSON.stringify(sortValue(value, new Set(), secretConfigKeys));
}

export function mergeConfigSnapshot(
  previous: string,
  nextValue: unknown,
  keys: readonly string[]
) {
  const previousValue = (() => {
    try {
      const parsed = JSON.parse(previous);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? { ...(parsed as Record<string, unknown>) }
        : {};
    } catch {
      return {};
    }
  })();
  const next =
    nextValue && typeof nextValue === "object"
      ? (nextValue as Record<string, unknown>)
      : {};
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    previousValue[key] = next[key];
  }
  return configSnapshot(previousValue);
}

/** Compare only a specific subset of SettingsConfig keys against savedConfigSnapshot. */
export function isConfigKeysDirty(
  config: SettingsConfig | null | undefined,
  savedSnapshot: string,
  keys: readonly (keyof SettingsConfig)[]
): boolean {
  if (!config || !savedSnapshot || keys.length === 0) return false;
  let savedRecord: Record<string, unknown>;
  try {
    const parsed = JSON.parse(savedSnapshot);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return false;
    savedRecord = parsed as Record<string, unknown>;
  } catch {
    return false;
  }

  const currentProjected = JSON.parse(configSnapshot(config)) as Record<
    string,
    unknown
  >;
  for (const key of keys) {
    const k = String(key);
    const left = JSON.stringify(currentProjected[k] ?? null);
    const right = JSON.stringify(savedRecord[k] ?? null);
    if (left !== right) {
      return true;
    }
  }
  return false;
}

/** Extract baseline values from savedConfigSnapshot for resetting a section in-place. */
export function extractSavedConfigSection(
  savedSnapshot: string,
  keys: readonly (keyof SettingsConfig)[]
): Partial<SettingsConfig> {
  if (!savedSnapshot || keys.length === 0) return {};
  try {
    const parsed = JSON.parse(savedSnapshot);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const record = parsed as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    for (const key of keys) {
      const k = String(key);
      if (secretConfigKeys.has(k)) {
        updates[k] = "";
      } else if (Object.prototype.hasOwnProperty.call(record, k)) {
        updates[k] = record[k];
      }
    }
    return updates as Partial<SettingsConfig>;
  } catch {
    return {};
  }
}
