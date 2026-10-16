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
