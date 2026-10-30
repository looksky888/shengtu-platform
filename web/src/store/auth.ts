"use client";

import localforage from "localforage";
import { resolvePostAuthDestination } from "@/lib/request-unauthorized";
import { canAccessPath, getDefaultRouteForSession, hasAPIPermission } from "@/store/auth-permissions";
import type { AuthMenuItem, SetStoredAuthSessionOptions, StoredAuthSession } from "@/store/auth-types";

export type { AuthMenuItem, AuthRole, SetStoredAuthSessionOptions, StoredAuthSession } from "@/store/auth-types";
export { canAccessPath, getDefaultRouteForSession, hasAPIPermission };

export function resolvePostAuthRoute(
  session: StoredAuthSession,
  returnTo?: string | null,
  pendingPrompt?: string | null,
): string {
  return resolvePostAuthDestination({
    returnTo,
    pendingPrompt,
    canAccess: (pathname) => canAccessPath(session, pathname),
    defaultRoute: getDefaultRouteForSession(session),
  });
}

export const AUTH_SESSION_STORAGE_KEY = "chatgpt2api_auth_session";
/** "1" = persist across browser restarts; "0" = sessionStorage only (until tab closes). */
export const AUTH_PERSIST_FLAG_KEY = "chatgpt2api_auth_persist";
export const AUTH_REMEMBERED_USERNAME_KEY = "chatgpt2api_remembered_username";

const authStorage = localforage.createInstance({
  name: "chatgpt2api",
  storeName: "auth",
});

export function getAuthPersistPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(AUTH_PERSIST_FLAG_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setAuthPersistPreference(rememberMe: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTH_PERSIST_FLAG_KEY, rememberMe ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}

export function getRememberedUsername(): string {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem(AUTH_REMEMBERED_USERNAME_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function setRememberedUsername(username: string) {
  if (typeof window === "undefined") return;
  try {
    const value = String(username || "").trim();
    if (value) {
      window.localStorage.setItem(AUTH_REMEMBERED_USERNAME_KEY, value);
    } else {
      window.localStorage.removeItem(AUTH_REMEMBERED_USERNAME_KEY);
    }
  } catch {
    // ignore
  }
}

function readSessionStorageSession(): StoredAuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeSessionStorageSession(session: StoredAuthSession) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

function clearSessionStorageSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  value.forEach((item) => {
    const text = String(item || "").trim();
    if (!text || seen.has(text)) {
      return;
    }
    seen.add(text);
    out.push(text);
  });
  return out;
}

function normalizeMenus(value: unknown): AuthMenuItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const candidate = item as Partial<AuthMenuItem>;
    const path = String(candidate.path || "").trim();
    const label = String(candidate.label || "").trim();
    if (!path || !label) {
      return [];
    }
    return [{
      id: String(candidate.id || path).trim(),
      label,
      path,
      icon: String(candidate.icon || "").trim(),
      order: typeof candidate.order === "number" ? candidate.order : 0,
      children: normalizeMenus(candidate.children),
    }];
  });
}

function normalizeSession(value: unknown, fallbackKey = ""): StoredAuthSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<StoredAuthSession>;
  const key = String(candidate.key || fallbackKey || "").trim();
  const role = candidate.role === "admin" || candidate.role === "user" ? candidate.role : null;
  if (!key || !role) {
    return null;
  }

  return {
    key,
    role,
    roleId: String(candidate.roleId || "").trim(),
    roleName: String(candidate.roleName || "").trim(),
    subjectId: String(candidate.subjectId || "").trim(),
    name: String(candidate.name || "").trim(),
    provider: String(candidate.provider || "").trim(),
    menuPaths: normalizeStringList(candidate.menuPaths),
    apiPermissions: normalizeStringList(candidate.apiPermissions),
    menus: normalizeMenus(candidate.menus),
  };
}

export async function getStoredAuthSession() {
  if (typeof window === "undefined") {
    return null;
  }

  // Prefer durable storage when present; fall back to tab session.
  const durable = normalizeSession(await authStorage.getItem<StoredAuthSession>(AUTH_SESSION_STORAGE_KEY));
  if (durable) {
    return durable;
  }
  return readSessionStorageSession();
}

export async function getStoredSessionToken() {
  const session = await getStoredAuthSession();
  return session?.key ?? "";
}

export async function setStoredAuthSession(session: StoredAuthSession, options?: SetStoredAuthSessionOptions) {
  const normalizedSession = normalizeSession(session);
  if (!normalizedSession) {
    await clearStoredAuthSession();
    return;
  }

  if (typeof options?.rememberMe === "boolean") {
    setAuthPersistPreference(options.rememberMe);
  }

  const persist = getAuthPersistPreference();
  if (persist) {
    await authStorage.setItem(AUTH_SESSION_STORAGE_KEY, normalizedSession);
    clearSessionStorageSession();
  } else {
    writeSessionStorageSession(normalizedSession);
    await authStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  }
}

export async function clearStoredAuthSession() {
  if (typeof window === "undefined") {
    return;
  }
  await authStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  clearSessionStorageSession();
}
