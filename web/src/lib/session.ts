"use client";

import { verifySession, type LoginResponse } from "@/lib/api";
import { AUTH_SESSION_CHANGE_EVENT } from "@/lib/auth-session-events";
import {
  clearStoredAuthSession,
  getStoredAuthSession,
  setStoredAuthSession,
  type StoredAuthSession,
} from "@/store/auth";

let cachedAuthSession: StoredAuthSession | null | undefined;
let verifyAuthSessionPromise: Promise<StoredAuthSession | null> | null = null;
let authSessionVersion = 0;
export { AUTH_SESSION_CHANGE_EVENT } from "@/lib/auth-session-events";

export function authSessionFromLoginResponse(data: LoginResponse, key: string): StoredAuthSession {
  return {
    key,
    role: data.role,
    roleId: data.role_id,
    roleName: data.role_name,
    subjectId: data.subject_id,
    name: data.name,
    provider: data.provider,
    menuPaths: data.menu_paths || [],
    apiPermissions: data.api_permissions || [],
    menus: data.menus || [],
  };
}

function emitAuthSessionChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_SESSION_CHANGE_EVENT));
  }
}

export function getCachedAuthSession() {
  return cachedAuthSession;
}

export async function getVerifiedAuthSession(): Promise<StoredAuthSession | null> {
  if (cachedAuthSession !== undefined) {
    return cachedAuthSession;
  }

  const verifyStartedAtVersion = authSessionVersion;
  verifyAuthSessionPromise ??= verifyStoredAuthSession();
  try {
    const verifiedSession = await verifyAuthSessionPromise;
    if (verifyStartedAtVersion === authSessionVersion) {
      cachedAuthSession = verifiedSession;
      if (verifiedSession) {
        await setStoredAuthSession(verifiedSession);
      } else {
        await clearStoredAuthSession();
      }
      return verifiedSession;
    }
    return cachedAuthSession ?? null;
  } finally {
    if (verifyStartedAtVersion === authSessionVersion) {
      verifyAuthSessionPromise = null;
    }
  }
}

export async function setVerifiedAuthSession(
  session: StoredAuthSession,
  options?: { rememberMe?: boolean },
) {
  authSessionVersion += 1;
  cachedAuthSession = session;
  verifyAuthSessionPromise = null;
  await setStoredAuthSession(session, options);
  emitAuthSessionChange();
}

export async function clearVerifiedAuthSession() {
  authSessionVersion += 1;
  cachedAuthSession = null;
  verifyAuthSessionPromise = null;
  await clearStoredAuthSession();
  emitAuthSessionChange();
}

function isUnauthorizedAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /登录已失效|未授权|无权限|401|unauthorized|forbidden|凭证|令牌无效|token/i.test(message);
}

async function verifyStoredAuthSession(): Promise<StoredAuthSession | null> {
  const storedSession = await getStoredAuthSession();
  if (!storedSession) {
    return null;
  }

  try {
    const data = await verifySession(storedSession.key);
    return authSessionFromLoginResponse(data, storedSession.key);
  } catch (error) {
    // Only clear session on explicit auth failure. Network / 5xx keep stored session
    // so brief outages do not force a full re-login.
    if (isUnauthorizedAuthError(error)) {
      return null;
    }
    return storedSession;
  }
}
