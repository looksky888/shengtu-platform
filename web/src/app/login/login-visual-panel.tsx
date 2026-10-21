"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { Layers, Sparkles, Zap } from "lucide-react";

import { HeroSphereCanvas } from "@/app/landing/hero-sphere-canvas";
import { LoginPageImageStage } from "@/components/login-page-image-stage";
import type { LoginAppMeta } from "./login-utils";
import { cn } from "@/lib/utils";

const CHANNELS = [
  { label: "GPT 号池", icon: Layers },
  { label: "Grok 渠道", icon: Zap },
  { label: "登录即用", icon: Sparkles },
];

/**
 * Right brand panel — mirrors Hero warm globe for visual continuity.
 * Optional admin-configured image sits as a soft floating card.
 */
export function LoginVisualPanel({
  appMeta,
  isRegisterMode = false,
}: {
  appMeta: LoginAppMeta;
  isRegisterMode?: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [dark, setDark] = useState(() =>
    typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false,
  );

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const hasCustomImage = Boolean(String(appMeta.login_page_image_url || "").trim());

  return (
    <section
      className={cn(
        "relative hidden min-h-[38rem] overflow-hidden border-l lg:flex",
        "border-slate-200/80 bg-slate-50/80 dark:border-white/10 dark:bg-[#0d1118]",
      )}
      aria-hidden="true"
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          dark
            ? "bg-[radial-gradient(circle_at_40%_35%,rgba(59,130,246,0.14),transparent_55%),radial-gradient(circle_at_70%_80%,rgba(20,86,240,0.12),transparent_50%)]"
            : "bg-[radial-gradient(circle_at_40%_35%,rgba(59,130,246,0.16),transparent_55%),radial-gradient(circle_at_70%_80%,rgba(37,99,235,0.08),transparent_50%)]",
        )}
      />

      <div className="absolute inset-0 opacity-95">
        <HeroSphereCanvas quality="lite" reducedMotion={!!prefersReducedMotion} dark={dark} />
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t to-transparent",
          dark ? "from-[#0d1118] via-[#0d1118]/85" : "from-slate-50 via-slate-50/80",
        )}
      />

      {hasCustomImage ? (
        <div className="absolute right-5 top-5 z-[2] h-36 w-44 overflow-hidden rounded-xl border border-slate-200/80 shadow-md dark:border-white/15">
          <LoginPageImageStage
            src={appMeta.login_page_image_url}
            mode={appMeta.login_page_image_mode}
            zoom={appMeta.login_page_image_zoom}
            positionX={appMeta.login_page_image_position_x}
            positionY={appMeta.login_page_image_position_y}
            fillParent
            frameClassName="rounded-xl"
            imageClassName="rounded-xl"
          />
        </div>
      ) : null}

      <div className="relative z-[2] mt-auto flex w-full flex-col gap-3 p-8">
        <div
          className={cn(
            "inline-flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
            dark
              ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
              : "border-blue-200/90 bg-white/85 text-[#1456f0]",
          )}
        >
          <Sparkles className="size-3.5 text-[#1456f0] dark:text-blue-400" />
          AI Image Studio
        </div>
        <div className="flex flex-col gap-1.5">
          <p className={cn("text-2xl font-semibold tracking-[-0.03em]", dark ? "text-slate-50" : "text-slate-900")}>
            {isRegisterMode ? "加入多模型生图工作台" : "多模型生图工作台"}
          </p>
          <p className={cn("max-w-xs text-sm leading-6", dark ? "text-slate-400" : "text-slate-500")}>
            GPT 与 Grok 渠道一体接入，登录后即用。
          </p>
        </div>
        <ul className="flex flex-wrap gap-2 pt-1">
          {CHANNELS.map(({ label, icon: Icon }) => (
            <li
              key={label}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium",
                dark
                  ? "border-white/10 bg-slate-900/60 text-slate-300"
                  : "border-slate-200/80 bg-white/85 text-slate-600",
              )}
            >
              <Icon className="size-3 text-[#1456f0] dark:text-blue-400" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
