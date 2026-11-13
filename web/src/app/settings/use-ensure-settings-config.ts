import { useEffect, useRef } from "react";

import { useSettingsStore } from "@/app/settings/store";

/**
 * Ensures the global settings configuration is fetched once per authenticated session.
 */
export function useEnsureSettingsConfigLoaded(hasSession: boolean) {
  const configLoaded = useSettingsStore((state) => Boolean(state.loadedAt.config));
  const isLoadingConfig = useSettingsStore((state) => state.isLoadingConfig);
  const loadConfig = useSettingsStore((state) => state.loadConfig);
  const attemptedLoadRef = useRef(false);

  useEffect(() => {
    if (!hasSession) {
      attemptedLoadRef.current = false;
      return;
    }
    if (!configLoaded && !isLoadingConfig && !attemptedLoadRef.current) {
      attemptedLoadRef.current = true;
      void loadConfig();
    }
  }, [configLoaded, hasSession, isLoadingConfig, loadConfig]);
}
