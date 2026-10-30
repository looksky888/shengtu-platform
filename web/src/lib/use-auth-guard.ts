"use client";

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  canAccessPath,
  getDefaultRouteForSession,
  resolvePostAuthRoute,
  type AuthRole,
  type StoredAuthSession,
} from "@/store/auth";
import { buildLoginRedirectUrl, extractReturnToFromSearch } from "@/lib/request-unauthorized";
import { getCachedAuthSession, getVerifiedAuthSession } from "@/lib/session";

type UseAuthGuardResult = {
  isCheckingAuth: boolean;
  session: StoredAuthSession | null;
};

export function useAuthGuard(allowedRoles?: AuthRole[], requiredPath?: string): UseAuthGuardResult {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<StoredAuthSession | null>(() => getCachedAuthSession() ?? null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(() => getCachedAuthSession() === undefined);
  const allowedRolesKey = (allowedRoles || []).join(",");
  const currentLocation = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    let active = true;

    const load = async () => {
      const roleList = allowedRolesKey ? (allowedRolesKey.split(",") as AuthRole[]) : [];
      const storedSession = await getVerifiedAuthSession();
      if (!active) {
        return;
      }

      if (!storedSession) {
        setSession(null);
        setIsCheckingAuth(false);
        navigate(buildLoginRedirectUrl(currentLocation), { replace: true });
        return;
      }

      if (roleList.length > 0 && !roleList.includes(storedSession.role)) {
        setSession(storedSession);
        setIsCheckingAuth(false);
        navigate(getDefaultRouteForSession(storedSession), { replace: true });
        return;
      }

      if (requiredPath && !canAccessPath(storedSession, requiredPath)) {
        setSession(storedSession);
        setIsCheckingAuth(false);
        navigate(getDefaultRouteForSession(storedSession), { replace: true });
        return;
      }

      setSession(storedSession);
      setIsCheckingAuth(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [allowedRolesKey, currentLocation, navigate, requiredPath]);

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
