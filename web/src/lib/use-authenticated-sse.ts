import { useEffect, useRef } from "react";

import webConfig from "@/constants/common-env";
import { redirectAndRejectUnauthorized } from "@/lib/request-unauthorized";
import { clearStoredAuthSession, getStoredSessionToken } from "@/store/auth";

import { startAuthenticatedSSE } from "./sse-client";

export function useAuthenticatedSSE(path: string, onData: (data: string) => void, enabled = true) {
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    if (!enabled) return;
    const baseUrl = webConfig.apiUrl.replace(/\/$/, "");
    return startAuthenticatedSSE({
      url: `${baseUrl}${path}`,
      getToken: getStoredSessionToken,
      onData: (data) => onDataRef.current(data),
      onUnauthorized: () => {
        if (typeof window === "undefined" || window.location.pathname.startsWith("/login")) return;
        return redirectAndRejectUnauthorized(
          clearStoredAuthSession,
          () => window.location.replace("/login"),
        );
      },
    });
  }, [enabled, path]);
}
