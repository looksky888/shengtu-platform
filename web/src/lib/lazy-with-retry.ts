import {
  createElement,
  lazy,
  type ComponentProps,
  type ComponentType,
} from "react";

export const ASSET_RELOAD_AT_KEY = "shengtu:asset-reload-at";
export const ASSET_RELOAD_COOLDOWN_MS = 60_000;

export function isDynamicImportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Unable to preload CSS/i.test(message)
  );
}

export function tryReloadForStaleAsset(
  storage: Pick<Storage, "getItem" | "setItem"> | null = typeof sessionStorage !==
  "undefined"
    ? sessionStorage
    : null,
  reload: () => void = () => window.location.reload(),
  now = Date.now(),
): boolean {
  try {
    const lastReloadAt = Number(storage?.getItem(ASSET_RELOAD_AT_KEY) ?? "0");
    if (
      Number.isFinite(lastReloadAt) &&
      lastReloadAt > 0 &&
      now - lastReloadAt < ASSET_RELOAD_COOLDOWN_MS
    ) {
      return false;
    }
    storage?.setItem(ASSET_RELOAD_AT_KEY, String(now));
  } catch {
    // Ignore storage access errors in restricted browsing modes.
  }
  reload();
  return true;
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Wraps React.lazy with a single short retry for transient network hiccups,
 * one-time cooldown-guarded full reload on stale post-deploy hashed chunks,
 * and automatic reset so local ErrorBoundary retries re-run the importer.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
): ComponentType<ComponentProps<T>> {
  const createLazy = () =>
    lazy(async () => {
      try {
        return await importer();
      } catch {
        await waitMs(250);
        try {
          return await importer();
        } catch (secondError) {
          if (
            typeof window !== "undefined" &&
            isDynamicImportError(secondError) &&
            tryReloadForStaleAsset()
          ) {
            return new Promise<never>(() => {});
          }
          LazyInner = createLazy();
          throw secondError;
        }
      }
    });

  let LazyInner = createLazy();

  function RetryableLazyComponent(props: ComponentProps<T>) {
    return createElement(LazyInner, props);
  }

  return RetryableLazyComponent;
}
