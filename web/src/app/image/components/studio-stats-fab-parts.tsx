"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";
import { formatCount } from "./studio-stats-fab-utils";

function useAnimatedNumber(value: number, enabled: boolean) {
  const [display, setDisplay] = useState(() => (enabled ? 0 : value));
  useEffect(() => {
    if (!enabled) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const to = value;
    const duration = 700;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, value]);
  return display;
}

export function ProgressRing({ rate }: { rate: number }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - c * Math.max(0, Math.min(1, rate));
  return (
    <svg className="pointer-events-none absolute inset-0 -rotate-90" viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="3" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="url(#studioFabRing)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        style={{
          transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)",
          filter: "drop-shadow(0 0 4px rgba(52,211,153,0.65))",
        }}
      />
      <defs>
        <linearGradient id="studioFabRing" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="55%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function MetricCard({
  tone,
  label,
  value,
  hint,
  animate,
}: {
  tone: "ok" | "bad";
  label: string;
  value: number;
  hint: string;
  animate: boolean;
}) {
  const shown = useAnimatedNumber(value, animate);
  return (
    <motion.div
      whileHover={animate ? { y: -2 } : undefined}
      className={cn(
        "relative overflow-hidden rounded-2xl border p-3",
        tone === "ok"
          ? "border-emerald-400/25 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5"
          : "border-rose-400/25 bg-gradient-to-br from-rose-500/15 to-rose-500/5",
      )}
    >
      <div className={cn("text-[11px] font-semibold", tone === "ok" ? "text-emerald-300/90" : "text-rose-300/90")}>{label}</div>
      <div className="mt-1.5 text-[26px] font-extrabold tracking-tight text-white tabular-nums">{formatCount(shown)}</div>
      <div className="mt-1 text-[11px] text-slate-400">{hint}</div>
    </motion.div>
  );
}

