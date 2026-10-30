export class UnauthorizedRedirectError extends Error {
  constructor() {
    super("登录已失效，请重新登录");
    this.name = "UnauthorizedRedirectError";
  }
}

export function shouldRedirectUnauthorized(
  status: number | undefined,
  redirectOnUnauthorized: boolean | undefined,
  pathname: string,
): boolean {
  return status === 401 && redirectOnUnauthorized !== false && !pathname.startsWith("/login");
}

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Sanitizes an internal post-login return path.
 * Rejects external URLs, protocol-relative URLs (`//...`), `/`, `/login`, and control chars.
 */
export function sanitizeInternalReturnPath(raw: string | null | undefined): string {
  const value = String(raw || "").trim();
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "";
  }
  if (hasControlCharacter(value)) {
    return "";
  }
  try {
    const parsed = new URL(value, "https://shengtu.internal");
    if (parsed.origin !== "https://shengtu.internal") {
      return "";
    }
    const cleanPathname = parsed.pathname.replace(/\/+$/, "") || "/";
    if (cleanPathname === "/" || cleanPathname === "/login" || cleanPathname.startsWith("/login/")) {
      return "";
    }
    return `${cleanPathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "";
  }
}

export function buildLoginRedirectUrl(currentLocation: string | null | undefined): string {
  const safeReturnTo = sanitizeInternalReturnPath(currentLocation);
  if (!safeReturnTo) {
    return "/login";
  }
  return `/login?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

export function extractReturnToFromSearch(search: string | URLSearchParams | null | undefined): string {
  if (!search) {
    return "";
  }
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return sanitizeInternalReturnPath(params.get("returnTo") || params.get("redirect"));
}

export function resolvePostAuthDestination(options: {
  returnTo?: string | null;
  pendingPrompt?: string | null;
  canAccess: (pathname: string) => boolean;
  defaultRoute: string;
}): string {
  const safeReturnTo = sanitizeInternalReturnPath(options.returnTo);
  if (safeReturnTo) {
    try {
      const parsed = new URL(safeReturnTo, "https://shengtu.internal");
      if (options.canAccess(parsed.pathname)) {
        return safeReturnTo;
      }
    } catch {
      // fall through
    }
  }
  const prompt = String(options.pendingPrompt || "").trim();
  if (prompt && options.canAccess("/image")) {
    return `/image?prompt=${encodeURIComponent(prompt)}`;
  }
  return options.defaultRoute;
}

/**
 * Determines whether a session verification error means the stored credential is invalid (401),
 * avoiding false logouts when reverse proxies return 502/503 HTML (`SyntaxError: Unexpected token '<'`).
 */
export function isSessionInvalidError(error: unknown): boolean {
  if (error instanceof UnauthorizedRedirectError) {
    return true;
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") {
      return status === 401;
    }
  }
  const message = error instanceof Error ? error.message : String(error || "");
  return /登录已失效|未授权|令牌无效/i.test(message);
}

export async function redirectAndRejectUnauthorized(
  clearSession: () => void | Promise<void>,
  redirect: () => void,
): Promise<never> {
  try {
    await clearSession();
  } finally {
    redirect();
  }
  throw new UnauthorizedRedirectError();
}
