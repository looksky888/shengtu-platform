import { useCallback, useEffect, useState } from "react";

function readExpiresAtMs(storageKey: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = Number(window.sessionStorage.getItem(storageKey) || 0);
    return Number.isFinite(raw) && raw > 0 ? raw : 0;
  } catch {
    return 0;
  }
}

function writeExpiresAtMs(storageKey: string, expiresAtMs: number) {
  if (typeof window === "undefined") return;
  try {
    if (expiresAtMs > Date.now()) {
      window.sessionStorage.setItem(storageKey, String(expiresAtMs));
    } else {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // Ignore storage quota or privacy-mode restrictions.
  }
}

function calcRemainingSeconds(expiresAtMs: number): number {
  if (!expiresAtMs) return 0;
  const diffMs = expiresAtMs - Date.now();
  return diffMs > 0 ? Math.ceil(diffMs / 1000) : 0;
}

/**
 * Timestamp-backed countdown hook persisted in sessionStorage so switching
 * apps on mobile to copy an email OTP never freezes or loses the timer.
 */
export function usePersistedCountdown(storageKey: string): [number, (seconds: number) => void] {
  const [expiresAtMs, setExpiresAtMs] = useState<number>(() => readExpiresAtMs(storageKey));
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => calcRemainingSeconds(readExpiresAtMs(storageKey)));

  const startCountdown = useCallback((seconds: number) => {
    const safeSeconds = Math.max(0, Math.ceil(Number(seconds) || 0));
    const nextExpiresAt = safeSeconds > 0 ? Date.now() + safeSeconds * 1000 : 0;
    writeExpiresAtMs(storageKey, nextExpiresAt);
    setExpiresAtMs(nextExpiresAt);
    setRemainingSeconds(safeSeconds);
  }, [storageKey]);

  useEffect(() => {
    if (expiresAtMs <= 0) {
      setRemainingSeconds(0);
      return;
    }

    const sync = () => {
      const next = calcRemainingSeconds(expiresAtMs);
      setRemainingSeconds(next);
      if (next <= 0) {
        writeExpiresAtMs(storageKey, 0);
        setExpiresAtMs(0);
      }
    };

    sync();
    const interval = window.setInterval(sync, 1000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", sync);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", sync);
    };
  }, [expiresAtMs, storageKey]);

  return [remainingSeconds, startCountdown];
}
