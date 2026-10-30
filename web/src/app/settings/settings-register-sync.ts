import type { RegisterConfig } from "@/lib/register-types";

function sortSnapshotValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortSnapshotValue(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortSnapshotValue(item)]),
  );
}

function editableRegisterSnapshot(value: unknown): string {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
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
    ...(source.checkout !== undefined ? { checkout: source.checkout } : {}),
    ...(source.sub2api_sync !== undefined ? { sub2api_sync: source.sub2api_sync } : {}),
  };
  return JSON.stringify(sortSnapshotValue(editable));
}

export function normalizeRegisterClearanceConfig(value: unknown) {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    enabled: Boolean(raw.enabled),
    mode: String(raw.mode || "flaresolverr"),
    flaresolverr_url: String(raw.flaresolverr_url || ""),
    timeout_seconds: Math.max(1, Number(raw.timeout_seconds) || 60),
    refresh_interval_seconds: Math.max(0, Number(raw.refresh_interval_seconds) || 3600),
    proxy: String(raw.proxy || ""),
    user_agent: String(raw.user_agent || ""),
    cf_clearance: String(raw.cf_clearance || ""),
    cf_cookies: String(raw.cf_cookies || ""),
    ...(typeof raw.cf_credentials_configured === "boolean"
      ? { cf_credentials_configured: raw.cf_credentials_configured }
      : {}),
  };
}

export function normalizeRegisterConfig(config: RegisterConfig): RegisterConfig {
  const source = config;
  const rawTarget = String(source?.target || "openai").trim().toLowerCase();
  const target = rawTarget === "grok" ? "grok" : "openai";
  const grok =
    source?.grok && typeof source.grok === "object" && !Array.isArray(source.grok)
      ? { ...(source.grok as Record<string, unknown>) }
      : {};
  const errorText = typeof source?.error === "string" && source.error.trim() ? source.error.trim() : undefined;
  return {
    ...source,
    target,
    backend: typeof source.backend === "string" ? source.backend : source.backend,
    error: errorText,
    proxy: typeof source.proxy === "string" ? source.proxy : "",
    total: Number(source.total || 1),
    threads: Number(source.threads || 1),
    mode: source.mode || "total",
    target_quota: Number(source.target_quota || 1),
    target_available: Number(source.target_available || 1),
    check_interval: Number(source.check_interval || 5),
    mail: {
      request_timeout: Number(source.mail?.request_timeout || 15),
      wait_timeout: Number(source.mail?.wait_timeout || 30),
      wait_interval: Number(source.mail?.wait_interval || 3),
      providers: Array.isArray(source.mail?.providers) ? source.mail.providers : [],
    },
    clearance: normalizeRegisterClearanceConfig(source.clearance) as RegisterConfig["clearance"],
    grok,
  };
}

const ENVELOPE_ONLY_KEYS = new Set(["enabled", "backend", "error", "target"]);

function hasRealRegisterConfigFields(record: Record<string, unknown>): boolean {
  if (record.mail && typeof record.mail === "object" && !Array.isArray(record.mail)) return true;
  if (typeof record.total === "number") return true;
  if (typeof record.threads === "number") return true;
  if (typeof record.mode === "string") return true;
  if (typeof record.proxy === "string") return true;
  if (record.clearance && typeof record.clearance === "object" && !Array.isArray(record.clearance)) return true;
  if (record.grok && typeof record.grok === "object" && !Array.isArray(record.grok)) return true;
  return false;
}

export function isDegradedRegisterPayload(raw: unknown, hasExistingConfig = false): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return true;
  }
  const record = raw as Record<string, unknown>;
  const errorText = typeof record.error === "string" ? record.error.trim().toLowerCase() : "";
  if (errorText === "register sidecar unavailable") {
    return true;
  }
  const keys = Object.keys(record);
  if (keys.length === 0 || keys.every((key) => ENVELOPE_ONLY_KEYS.has(key))) {
    return true;
  }
  const hasRealFields = hasRealRegisterConfigFields(record);
  if (errorText !== "" && !hasRealFields) {
    return true;
  }
  if (hasExistingConfig && !hasRealFields) {
    return true;
  }
  return false;
}

export type ReconcileRegisterConfigParams = {
  currentConfig: RegisterConfig | null;
  savedRegisterSnapshot: string;
  isSavingRegister?: boolean;
  incoming: unknown;
};

export type ReconcileRegisterConfigResult = {
  registerConfig: RegisterConfig | null;
  savedRegisterSnapshot: string;
  degraded: boolean;
};

export function reconcileIncomingRegisterConfig({
  currentConfig,
  savedRegisterSnapshot,
  isSavingRegister = false,
  incoming,
}: ReconcileRegisterConfigParams): ReconcileRegisterConfigResult {
  if (isDegradedRegisterPayload(incoming, currentConfig !== null)) {
    if (!currentConfig) {
      return {
        registerConfig: null,
        savedRegisterSnapshot,
        degraded: true,
      };
    }
    const record = incoming && typeof incoming === "object" ? (incoming as Record<string, unknown>) : {};
    const nextCurrent: RegisterConfig = {
      ...currentConfig,
      ...(!isSavingRegister && typeof record.enabled === "boolean" ? { enabled: record.enabled } : {}),
      ...(typeof record.backend === "string" ? { backend: record.backend } : {}),
      ...(typeof record.error === "string" ? { error: record.error } : {}),
    };
    return {
      registerConfig: nextCurrent,
      savedRegisterSnapshot,
      degraded: true,
    };
  }

  const normalizedIncoming = normalizeRegisterConfig(incoming as RegisterConfig);
  const isDirty =
    currentConfig !== null &&
    savedRegisterSnapshot !== "" &&
    editableRegisterSnapshot(currentConfig) !== savedRegisterSnapshot;

  if (currentConfig !== null && (isDirty || isSavingRegister)) {
    const merged: RegisterConfig = {
      ...normalizedIncoming,
      enabled: isSavingRegister ? currentConfig.enabled : normalizedIncoming.enabled,
      target: currentConfig.target,
      proxy: currentConfig.proxy,
      total: currentConfig.total,
      threads: currentConfig.threads,
      mode: currentConfig.mode,
      target_quota: currentConfig.target_quota,
      target_available: currentConfig.target_available,
      check_interval: currentConfig.check_interval,
      mail: currentConfig.mail,
      clearance: currentConfig.clearance,
      grok: currentConfig.grok,
      ...(currentConfig.checkout !== undefined ? { checkout: currentConfig.checkout } : {}),
      ...(currentConfig.sub2api_sync !== undefined ? { sub2api_sync: currentConfig.sub2api_sync } : {}),
    };
    return {
      registerConfig: merged,
      savedRegisterSnapshot,
      degraded: false,
    };
  }

  const incomingSnapshot = editableRegisterSnapshot(normalizedIncoming);
  return {
    registerConfig: normalizedIncoming,
    savedRegisterSnapshot:
      incomingSnapshot !== savedRegisterSnapshot ? incomingSnapshot : savedRegisterSnapshot,
    degraded: false,
  };
}
