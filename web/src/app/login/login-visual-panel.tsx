"use client";

import { motion, useReducedMotion } from "motion/react";

import { normalizeBrandTitle, type LoginAppMeta } from "@/app/login/login-utils";
import { LoginPageImageStage } from "@/components/login-page-image-stage";
import { resolveLoginPageImageSrc } from "@/lib/app-meta";

const DARKROOM_SECONDARY_PLATES = [
  {
    plate: "PL.02",
    src: "/presets/stellar-poster.webp",
    title: "暗曜石星穹拱门",
    tag: "2:3 PRINT",
  },
  {
    plate: "PL.03",
    src: "/presets/forza-horizon-shenzhen.webp",
    title: "滨海雨夜超跑追焦",
    tag: "16:10 RAW",
  },
] as const;

/**
 * Left Showcase Panel — Obsidian Darkroom Curatorial Gallery (#0c0c0e).
 * Preserves admin custom `login_page_image_url` + transform controls when configured;
 * renders the curated 3-artwork exhibition mosaic by default.
 */
export function LoginVisualPanel({
  appMeta,
  isRegisterMode = false,
}: {
  appMeta: LoginAppMeta;
  isRegisterMode?: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();
  const brand = normalizeBrandTitle(appMeta.app_title);
  const customImageUrl = String(appMeta.login_page_image_url || "").trim();
  const hasCustomImage = Boolean(customImageUrl);

  return (
    <section
      className="relative hidden min-h-[41rem] flex-col justify-between overflow-hidden bg-[#0c0c0e] p-7 text-zinc-100 lg:flex xl:p-8"
      aria-hidden="true"
    >
      {/* Subtle darkroom 32px hairline grid + neutral silver spotlight */}
      <div
        className="pointer-events-none absolute inset-0 opacity-100"
        style={{
          backgroundSize: "32px 32px",
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
          maskImage: "radial-gradient(ellipse 85% 80% at 50% 45%, black 35%, transparent 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.055), transparent 52%), radial-gradient(circle at 75% 78%, rgba(244,244,245,0.035), transparent 48%)",
        }}
      />

      {/* Architectural Viewfinder Registration Marks (+) */}
      <span className="pointer-events-none absolute top-3.5 left-4 z-[3] select-none font-mono text-xs leading-none text-zinc-600">+</span>
      <span className="pointer-events-none absolute top-3.5 right-4 z-[3] select-none font-mono text-xs leading-none text-zinc-600">+</span>
      <span className="pointer-events-none absolute bottom-3.5 left-4 z-[3] select-none font-mono text-xs leading-none text-zinc-600">+</span>
      <span className="pointer-events-none absolute bottom-3.5 right-4 z-[3] select-none font-mono text-xs leading-none text-zinc-600">+</span>

      {hasCustomImage ? (
        <>
          {/* Admin Custom Configured Showcase Image Stage */}
          <div className="absolute inset-0 z-[1]">
            <LoginPageImageStage
              src={resolveLoginPageImageSrc(customImageUrl)}
              mode={appMeta.login_page_image_mode}
              zoom={appMeta.login_page_image_zoom}
              positionX={appMeta.login_page_image_position_x}
              positionY={appMeta.login_page_image_position_y}
              fillParent
              className="h-full w-full"
              frameClassName="rounded-none"
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-28 bg-gradient-to-b from-[#0c0c0e]/80 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-48 bg-gradient-to-t from-[#0c0c0e]/92 via-[#0c0c0e]/60 to-transparent" />

          <DarkroomBrandHeader brand={brand} />
          <DarkroomCaptionFooter isRegisterMode={isRegisterMode} />
        </>
      ) : (
        <>
          {/* Top Brand & Darkroom Archive Header */}
          <DarkroomBrandHeader brand={brand} />

          {/* Center Curated Exhibition Mosaic */}
          <div className="relative z-[2] my-5 flex flex-col gap-3">
            {/* Featured Primary Exhibition Plate */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden rounded-xl border border-white/[0.1] bg-[#141417] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
            >
              <div className="relative aspect-[16/9.4] w-full overflow-hidden rounded-[8px] bg-zinc-900">
                <img
                  src="/presets/editorial-fashion.webp"
                  alt="东方高定暗调人像"
                  loading="eager"
                  decoding="async"
                  draggable={false}
                  className="h-full w-full select-none object-cover object-center"
                />
                <div className="pointer-events-none absolute inset-0 rounded-[8px] ring-1 ring-inset ring-white/[0.08]" />
                <span className="absolute top-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-[0.08em] text-zinc-200 backdrop-blur-xs">
                  35MM EDITORIAL
                </span>
              </div>
              <div className="flex items-center justify-between px-1.5 pt-2 pb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10px] text-zinc-500">PL.01</span>
                  <span className="text-xs font-medium text-zinc-200">东方高定暗调人像</span>
                </div>
                <span className="font-mono text-[10px] text-zinc-500">ISO 400 · RAW 4K</span>
              </div>
            </motion.div>

            {/* Secondary Diptych Exhibition Plates */}
            <div className="grid grid-cols-2 gap-3">
              {DARKROOM_SECONDARY_PLATES.map((item, idx) => (
                <motion.div
                  key={item.plate}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    prefersReducedMotion
                      ? { duration: 0 }
                      : { duration: 0.45, delay: 0.08 * (idx + 1), ease: [0.22, 1, 0.36, 1] }
                  }
                  className="overflow-hidden rounded-xl border border-white/[0.1] bg-[#141417] p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[7px] bg-zinc-900">
                    <img
                      src={item.src}
                      alt={item.title}
                      loading="eager"
                      decoding="async"
                      draggable={false}
                      className="h-full w-full select-none object-cover object-center"
                    />
                    <div className="pointer-events-none absolute inset-0 rounded-[7px] ring-1 ring-inset ring-white/[0.08]" />
                    <span className="absolute top-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[8.5px] font-medium tracking-[0.08em] text-zinc-200 backdrop-blur-xs">
                      {item.tag}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1 px-1 pt-1.5 pb-0.5">
                    <span className="truncate text-[11px] font-medium text-zinc-300">{item.title}</span>
                    <span className="shrink-0 font-mono text-[9.5px] text-zinc-500">{item.plate}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Bottom Editorial Quote & Capability Caption */}
          <DarkroomCaptionFooter isRegisterMode={isRegisterMode} />
        </>
      )}
    </section>
  );
}

function DarkroomBrandHeader({ brand }: { brand: string }) {
  return (
    <div className="relative z-[2] flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <img
          src="/logo-mark.svg"
          alt=""
          aria-hidden="true"
          className="size-8 rounded-lg ring-1 ring-white/15"
        />
        <span className="text-sm font-semibold tracking-[-0.02em] text-zinc-100">
          {brand}
        </span>
      </div>
      <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] tracking-[0.1em] text-zinc-400">
        DARKROOM · v4.9
      </span>
    </div>
  );
}

function DarkroomCaptionFooter({ isRegisterMode }: { isRegisterMode: boolean }) {
  return (
    <div className="relative z-[2] flex flex-col gap-2.5 border-t border-white/[0.08] pt-4">
      <p className="text-[13px] leading-relaxed font-normal text-zinc-200/95">
        {isRegisterMode
          ? "“开启专属数字暗房工作台，让每一次灵感推演都凝练为典藏级视觉作品。”"
          : "“以纸墨之静承载光影之变，让每一次提示词推演都凝练为典藏级视觉作品。”"}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] tracking-[0.08em] text-zinc-500">
        <span>文生图 · 局部蒙版重绘 · 多轨视频生成 · 云端归档</span>
        <span>CALIBRATED STUDIO</span>
      </div>
    </div>
  );
}
