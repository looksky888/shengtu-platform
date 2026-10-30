"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  canAccessPath,
  getDefaultRouteForSession,
  resolvePostAuthRoute,
  type AuthRole,
  type StoredAuthSession,
} from "@/store/auth";
import { buildLoginRedirectUrl, extractReturnToFromSearch } from "@/lib/request-unauthorized";
import {
  AUTH_SESSION_CHANGE_EVENT,
  getCachedAuthSession,
  getVerifiedAuthSession,
} from "@/lib/session";

export const ResolvedAuthSessionContext = createContext<StoredAuthSession | null | undefined>(
  undefined,
);

type UseAuthGuardResult = {
  isCheckingAuth: boolean;
  session: StoredAuthSession | null;
};

export function useAuthGuard(allowedRoles?: AuthRole[], requiredPath?: string): UseAuthGuardResult {
  const navigate = useNavigate();
  const location = useLocation();
  const parentSession = useContext(ResolvedAuthSessionContext);
  const initialSession = parentSession !== undefined ? parentSession : getCachedAuthSession();
  const [session, setSession] = useState<StoredAuthSession | null>(() => initialSession ?? null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(() => initialSession === undefined);
  const allowedRolesKey = (allowedRoles || []).join(",");
  const currentLocation = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    let active = true;
    const roleList = allowedRolesKey ? (allowedRolesKey.split(",") as AuthRole[]) : [];

    const applySession = (resolved: StoredAuthSession | null) => {
      if (!active) return;
      if (!resolved) {
        setSession(null);
        setIsCheckingAuth(false);
        navigate(buildLoginRedirectUrl(currentLocation), { replace: true });
        return;
      }
      if (roleList.length > 0 && !roleList.includes(resolved.role)) {
        setSession(resolved);
        setIsCheckingAuth(false);
        navigate(getDefaultRouteForSession(resolved), { replace: true });
        return;
      }
      if (requiredPath && !canAccessPath(resolved, requiredPath)) {
        setSession(resolved);
        setIsCheckingAuth(false);
        navigate(getDefaultRouteForSession(resolved), { replace: true });
        return;
      }
      setSession(resolved);
      setIsCheckingAuth(false);
    };

    if (parentSession !== undefined) {
      applySession(parentSession);
      return () => {
        active = false;
      };
    }

    const onSessionChange = () => {
      const cached = getCachedAuthSession();
      if (cached !== undefined) {
        applySession(cached);
      }
    };
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, onSessionChange);
    void getVerifiedAuthSession().then(applySession);

    return () => {
      active = false;
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, onSessionChange);
    };
  }, [allowedRolesKey, currentLocation, navigate, parentSession, requiredPath]);

  return { isCheckingAuth, session };
}

export function useRedirectIfAuthenticated() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isCheckingAuth, setIsCheckingAuth] = useState(() => getCachedAuthSession() !== null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const storedSession = await getVerifiedAuthSession();
      if (!active) {
        return;
      }

      if (storedSession) {
        const returnTo = extractReturnToFromSearch(location.search);
        navigate(resolvePostAuthRoute(storedSession, returnTo), { replace: true });
        return;
      }

      setIsCheckingAuth(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [location.search, navigate]);

  return { isCheckingAuth };
}
