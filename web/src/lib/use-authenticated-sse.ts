import { useEffect, useRef } from "react";

import webConfig from "@/constants/common-env";
import {
  buildLoginRedirectUrl,
  redirectAndRejectUnauthorized,
  shouldRedirectUnauthorized,
} from "@/lib/request-unauthorized";
import { clearVerifiedAuthSession, getCachedAuthSession } from "@/lib/session";
import { getStoredSessionToken } from "@/store/auth";

import { startAuthenticatedSSE } from "./sse-client";

async function resolveSessionToken(): Promise<string> {
  const cachedSession = getCachedAuthSession();
  if (cachedSession?.key?.trim()) {
    return cachedSession.key.trim();
  }
  if (cachedSession === null) {
    return "";
  }
  return getStoredSessionToken();
}

export function useAuthenticatedSSE(path: string, onData: (data: string) => void, enabled = true) {
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    if (!enabled) return;
    const baseUrl = webConfig.apiUrl.replace(/\/$/, "");
    return startAuthenticatedSSE({
      url: `${baseUrl}${path}`,
      getToken: resolveSessionToken,
      onData: (data) => onDataRef.current(data),
      onUnauthorized: () => {
        if (typeof window === "undefined") return;
        if (!shouldRedirectUnauthorized(401, true, window.location.pathname)) {
          return clearVerifiedAuthSession();
        }
        return redirectAndRejectUnauthorized(
          clearVerifiedAuthSession,
          () =>
            window.location.replace(
              buildLoginRedirectUrl(
                `${window.location.pathname}${window.location.search}${window.location.hash}`,
              ),
            ),
        );
      },
    });
  }, [enabled, path]);
}
