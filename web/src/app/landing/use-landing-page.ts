import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReducedMotion } from "motion/react";

import { normalizeBrandTitle } from "@/app/landing/landing-brand";
import { fetchAuthProviders } from "@/lib/api";
import { getVerifiedAuthSession } from "@/lib/session";
import {
  applyColorTheme,
  getPreferredColorTheme,
  saveColorTheme,
  type ColorTheme,
} from "@/lib/theme";
import { useAppMeta } from "@/lib/use-app-meta";
import { getDefaultRouteForSession } from "@/store/auth";

export function useLandingPage() {
  const navigate = useNavigate();
  const appMeta = useAppMeta();
  const prefersReducedMotion = useReducedMotion();
  const [checking, setChecking] = useState(true);
  const [entered, setEntered] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [theme, setTheme] = useState<ColorTheme>(() => getPreferredColorTheme());
  const isDark = theme === "dark";
  const themeToggleRef = useRef<HTMLButtonElement | null>(null);

  const brandTitle = normalizeBrandTitle(appMeta.app_title);

  useEffect(() => {
    applyColorTheme(theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const session = await getVerifiedAuthSession();
      if (!active) return;
      if (session) {
        navigate(getDefaultRouteForSession(session), { replace: true });
        return;
      }
      try {
        const providers = await fetchAuthProviders();
        if (active) setRegistrationEnabled(Boolean(providers.registration?.enabled));
      } catch {
        if (active) setRegistrationEnabled(false);
      }
      setChecking(false);
      requestAnimationFrame(() => setEntered(true));
    };
    void run();
    return () => {
      active = false;
    };
  }, [navigate]);

  const handleThemeToggle = () => {
    const next: ColorTheme = theme === "dark" ? "light" : "dark";
    const rect = themeToggleRef.current?.getBoundingClientRect();
    applyColorTheme(
      next,
      rect
        ? { origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, force: true }
        : { force: true },
    );
    saveColorTheme(next);
    setTheme(next);
  };

  return {
    brandTitle,
    checking,
    entered,
    handleThemeToggle,
    isDark,
    prefersReducedMotion: !!prefersReducedMotion,
    registrationEnabled,
    themeToggleRef,
  };
}
