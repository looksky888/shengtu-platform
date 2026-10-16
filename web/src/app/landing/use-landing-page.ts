import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReducedMotion } from "motion/react";

import type { HeroParallax } from "@/app/landing/hero-sphere-canvas";
import { fetchAuthProviders } from "@/lib/api";
import { usePageVisible } from "@/lib/use-page-visible";
import { getVerifiedAuthSession } from "@/lib/session";
import {
  applyColorTheme,
  getPreferredColorTheme,
  saveColorTheme,
  type ColorTheme,
} from "@/lib/theme";
import { getDefaultRouteForSession } from "@/store/auth";

export function useLandingPage() {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const pageVisible = usePageVisible();
  const [checking, setChecking] = useState(true);
  const [entered, setEntered] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [theme, setTheme] = useState<ColorTheme>(() => getPreferredColorTheme());
  const isDark = theme === "dark";

  const parallaxRef = useRef<HeroParallax>({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const themeToggleRef = useRef<HTMLButtonElement | null>(null);
  const watermarkRef = useRef<HTMLDivElement | null>(null);
  const ctaRef = useRef<HTMLElement | null>(null);
  const bgShiftRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (prefersReducedMotion || checking || !pageVisible) return;

    const onMove = (clientX: number, clientY: number) => {
      const nx = (clientX / window.innerWidth) * 2 - 1;
      const ny = (clientY / window.innerHeight) * 2 - 1;
      targetRef.current = {
        x: Math.max(-1, Math.min(1, nx)),
        y: Math.max(-1, Math.min(1, ny)),
      };
    };

    const onPointerMove = (event: PointerEvent) => onMove(event.clientX, event.clientY);
    const onLeave = () => {
      targetRef.current = { x: 0, y: 0 };
    };
    let current = { x: 0, y: 0 };

    const tick = () => {
      const target = targetRef.current;
      current = {
        x: current.x + (target.x - current.x) * 0.09,
        y: current.y + (target.y - current.y) * 0.09,
      };
      parallaxRef.current.x = current.x;
      parallaxRef.current.y = current.y;

      if (watermarkRef.current) {
        watermarkRef.current.style.transform = `translate3d(${current.x * -22}px, ${current.y * -12}px, 0)`;
      }
      if (ctaRef.current) {
        ctaRef.current.style.transform = `translate3d(${current.x * 5}px, ${current.y * 7}px, 0)`;
      }
      if (bgShiftRef.current) {
        bgShiftRef.current.style.transform = `translate3d(${current.x * 12}px, ${current.y * 10}px, 0) scale(1.04)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [checking, pageVisible, prefersReducedMotion]);

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
    bgShiftRef,
    checking,
    ctaRef,
    entered,
    handleThemeToggle,
    isDark,
    parallaxRef,
    prefersReducedMotion: !!prefersReducedMotion,
    registrationEnabled,
    themeToggleRef,
    watermarkRef,
  };
}
