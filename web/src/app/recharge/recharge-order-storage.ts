import type { PaymentOrder } from "@/lib/user-payment-api";

export const ACTIVE_RECHARGE_ORDER_STORAGE_KEY = "shengtu:active-recharge-order";
const MAX_STORED_AGE_MS = 24 * 60 * 60 * 1000;

const RECOVERABLE_STATUSES = new Set(["created", "pending", "closing"]);

type StoredRechargeOrderEnvelope = {
  scope: string;
  savedAt: number;
  order: PaymentOrder;
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getDefaultStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function hashRechargeSessionScope(sessionKey: string): string {
  const input = String(sessionKey || "").trim();
  if (!input) return "anonymous";
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `s_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function isRecoverableRechargeOrder(order: PaymentOrder | null | undefined): order is PaymentOrder {
  if (!order || typeof order.id !== "string" || !order.id.trim()) return false;
  return RECOVERABLE_STATUSES.has(String(order.status || "").trim());
}

export function loadActiveRechargeOrder(
  sessionKey: string,
  storage: StorageLike | null = getDefaultStorage(),
  now = Date.now(),
): PaymentOrder | null {
  if (!storage) return null;
  const expectedScope = hashRechargeSessionScope(sessionKey);
  try {
    const raw = storage.getItem(ACTIVE_RECHARGE_ORDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRechargeOrderEnvelope> | null;
    if (!parsed || typeof parsed !== "object") {
      storage.removeItem(ACTIVE_RECHARGE_ORDER_STORAGE_KEY);
      return null;
    }
    if (parsed.scope !== expectedScope) {
      return null;
    }
    const savedAt = Number(parsed.savedAt || 0);
    if (!Number.isFinite(savedAt) || savedAt <= 0 || now - savedAt > MAX_STORED_AGE_MS) {
      storage.removeItem(ACTIVE_RECHARGE_ORDER_STORAGE_KEY);
      return null;
    }
    if (!isRecoverableRechargeOrder(parsed.order)) {
      storage.removeItem(ACTIVE_RECHARGE_ORDER_STORAGE_KEY);
      return null;
    }
    return parsed.order;
  } catch {
    try {
      storage.removeItem(ACTIVE_RECHARGE_ORDER_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup errors in restricted browsing modes.
    }
    return null;
  }
}

export function syncActiveRechargeOrderStorage(
  sessionKey: string,
  order: PaymentOrder | null,
  storage: StorageLike | null = getDefaultStorage(),
  now = Date.now(),
): void {
  if (!storage) return;
  const scope = hashRechargeSessionScope(sessionKey);
  try {
    if (!isRecoverableRechargeOrder(order)) {
      const existingRaw = storage.getItem(ACTIVE_RECHARGE_ORDER_STORAGE_KEY);
      if (!existingRaw) return;
      try {
        const existing = JSON.parse(existingRaw) as Partial<StoredRechargeOrderEnvelope> | null;
        if (!existing || !existing.scope || existing.scope === scope) {
          storage.removeItem(ACTIVE_RECHARGE_ORDER_STORAGE_KEY);
        }
      } catch {
        storage.removeItem(ACTIVE_RECHARGE_ORDER_STORAGE_KEY);
      }
      return;
    }
    const envelope: StoredRechargeOrderEnvelope = {
      scope,
      savedAt: now,
      order,
    };
    storage.setItem(ACTIVE_RECHARGE_ORDER_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Ignore quota or privacy-mode storage errors.
  }
}
