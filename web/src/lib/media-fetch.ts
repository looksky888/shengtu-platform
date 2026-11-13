import webConfig from "@/constants/common-env";
import { getStoredSessionToken } from "@/store/auth";

function getConfiguredApiBase(): string {
  return (webConfig.apiUrl || "").trim().replace(/\/+$/, "");
}

function getTrustedOrigins(): {
  apiBase: string;
  windowOrigin: string;
  apiOrigin: string;
} {
  const apiBase = getConfiguredApiBase();
  const windowOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  let apiOrigin = windowOrigin;
  if (apiBase) {
    try {
      apiOrigin = new URL(apiBase, windowOrigin || "http://localhost").origin;
    } catch {
      apiOrigin = windowOrigin;
    }
  }
  return { apiBase, windowOrigin, apiOrigin };
}

function isRelativeUrl(value: string): boolean {
  return !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value) && !value.startsWith("//");
}

export function resolveRequestUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  if (/^(data|blob):/i.test(trimmed) || !isRelativeUrl(trimmed)) {
    return trimmed;
  }
  const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const apiBase = getConfiguredApiBase();
  return apiBase ? `${apiBase}${normalizedPath}` : normalizedPath;
}

/**
 * Rewrites same-origin or configured-API `/images/...` URLs to append `?proxy=1`
 * so the Go server streams remote R2 bytes inline from the same origin without
 * a cross-origin 302 redirect. Leaves `data:`, `blob:`, non-`/images/` paths,
 * and third-party URLs untouched.
 */
export function buildSameOriginImageProxySrc(rawUrl: string): string {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed || /^(data|blob):/i.test(trimmed)) {
    return trimmed;
  }

  const { apiBase, windowOrigin, apiOrigin } = getTrustedOrigins();
  const fallbackBase = windowOrigin || apiOrigin || "http://localhost";

  try {
    if (isRelativeUrl(trimmed)) {
      const normalizedPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
      const parsed = new URL(normalizedPath, fallbackBase);
      if (!parsed.pathname.startsWith("/images/")) {
        return trimmed;
      }
      parsed.searchParams.set("proxy", "1");
      return resolveRequestUrl(
        `${parsed.pathname}${parsed.search}${parsed.hash}`,
      );
    }

    const parsed = new URL(trimmed, fallbackBase);
    const matchesTrustedOrigin = Boolean(
      (windowOrigin && parsed.origin === windowOrigin) ||
        (apiOrigin && parsed.origin === apiOrigin),
    );
    if (!matchesTrustedOrigin || !parsed.pathname.startsWith("/images/")) {
      return trimmed;
    }

    parsed.searchParams.set("proxy", "1");
    if (apiBase) {
      return resolveRequestUrl(
        `${parsed.pathname}${parsed.search}${parsed.hash}`,
      );
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function isTrustedMediaTarget(targetUrl: string): boolean {
  if (!targetUrl || /^(data|blob):/i.test(targetUrl)) {
    return false;
  }
  if (isRelativeUrl(targetUrl)) {
    return true;
  }
  const { windowOrigin, apiOrigin } = getTrustedOrigins();
  const fallbackBase = windowOrigin || apiOrigin || "http://localhost";
  try {
    const parsed = new URL(targetUrl, fallbackBase);
    return Boolean(
      (windowOrigin && parsed.origin === windowOrigin) ||
        (apiOrigin && parsed.origin === apiOrigin),
    );
  } catch {
    return false;
  }
}

async function fetchAuthorizedImageRequest(
  rawUrl: string,
  method: "GET" | "HEAD",
  signal?: AbortSignal,
): Promise<Response> {
  const targetUrl = buildSameOriginImageProxySrc(rawUrl);
  if (!targetUrl) {
    throw new Error("图片地址为空");
  }
  if (/^(data|blob):/i.test(targetUrl)) {
    return fetch(targetUrl, { signal });
  }

  const trusted = isTrustedMediaTarget(targetUrl);
  if (!trusted) {
    return fetch(targetUrl, {
      method,
      credentials: "omit",
      signal,
    });
  }

  const headers = new Headers();
  const token = await getStoredSessionToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(targetUrl, {
    method,
    credentials: "include",
    headers,
    signal,
  });
}

export async function fetchAuthorizedImageBlob(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetchAuthorizedImageRequest(rawUrl, "GET", signal);
}

export async function fetchAuthorizedImageHead(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetchAuthorizedImageRequest(rawUrl, "HEAD", signal);
}
