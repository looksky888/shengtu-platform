"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Aperture, ArrowUpRight, Terminal } from "lucide-react";

import {
  CURATED_GALLERY_ARTWORKS,
  PENDING_STUDIO_PROMPT_STORAGE_KEY,
  type CuratedArtwork,
} from "@/app/landing/landing-brand";
import { getCachedAuthSession } from "@/lib/session";
import { usePageVisible } from "@/lib/use-page-visible";
import { cn } from "@/lib/utils";

interface EditorialGalleryStageProps {
  prefersReducedMotion: boolean;
}

export function EditorialGalleryStage({
  prefersReducedMotion,
}: EditorialGalleryStageProps) {
  const navigate = useNavigate();
  const pageVisible = usePageVisible();
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion || paused || !pageVisible) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % CURATED_GALLERY_ARTWORKS.length);
    }, 4600);
    return () => window.clearInterval(timer);
  }, [pageVisible, paused, prefersReducedMotion]);

  const activeArtwork = CURATED_GALLERY_ARTWORKS[activeIndex] ?? CURATED_GALLERY_ARTWORKS[0];

  const handleCreateWithInspiration = () => {
    const prompt = activeArtwork.prompt.trim();
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(PENDING_STUDIO_PROMPT_STORAGE_KEY, prompt);
      } catch {
        // Ignore private-mode storage restrictions; URL query param still carries prompt.
      }
    }
    const encodedPrompt = encodeURIComponent(prompt);
    if (getCachedAuthSession()) {
      navigate(`/image?prompt=${encodedPrompt}`);
    } else {
      navigate(`/login?prompt=${encodedPrompt}`);
    }
  };

  return (
    <div
      className="relative mx-auto w-full max-w-[40rem] lg:max-w-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      {/* Outer Architectural Exhibition Sheet */}
      <div className="relative rounded-2xl border border-border/80 bg-surface/65 p-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.08)] backdrop-blur-sm sm:p-4 dark:bg-[#111113]/75 dark:shadow-[0_24px_64px_rgba(0,0,0,0.55)]">
        {/* Viewfinder corner registration marks */}
        <span className="pointer-events-none absolute top-1.5 left-2 select-none font-mono text-[10px] leading-none text-subtle-foreground/70" aria-hidden="true">+</span>
        <span className="pointer-events-none absolute top-1.5 right-2 select-none font-mono text-[10px] leading-none text-subtle-foreground/70" aria-hidden="true">+</span>
        <span className="pointer-events-none absolute bottom-1.5 left-2 select-none font-mono text-[10px] leading-none text-subtle-foreground/70" aria-hidden="true">+</span>
        <span className="pointer-events-none absolute bottom-1.5 right-2 select-none font-mono text-[10px] leading-none text-subtle-foreground/70" aria-hidden="true">+</span>

        {/* Stage Micro Header */}
        <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            <Aperture className="size-3 text-foreground/75" aria-hidden="true" />
            <span>CURATED EXHIBITION · 04 PLATES</span>
          </div>
          <span className="font-mono text-[10px] tracking-[0.08em] text-subtle-foreground">
            GALLERY ARCHIVE / 4K RAW
          </span>
        </div>

        {/* Layered Asymmetric 12-Col Bento Exhibition Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          {CURATED_GALLERY_ARTWORKS.map((artwork, index) => {
            const isHeroSpan = index === 0 || index === 3;
            const isActive = index === activeIndex;
            return (
              <GalleryExhibitionFrame
                key={artwork.id}
                artwork={artwork}
                index={index}
                isActive={isActive}
                isHeroSpan={isHeroSpan}
                prefersReducedMotion={prefersReducedMotion}
                onSelect={() => setActiveIndex(index)}
              />
            );
          })}
        </div>

        {/* Floating "Prompt → Render" Studio HUD Card */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: 0.45, delay: 0.28, ease: [0.22, 1, 0.36, 1] }
          }
          className="mt-3 rounded-xl border border-border-strong/65 bg-surface/95 px-3.5 py-3 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.09)] backdrop-blur-md dark:bg-[#161619]/95 dark:shadow-[0_16px_40px_rgba(0,0,0,0.6)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2 py-0.5 font-mono text-[10px] font-medium tracking-[0.06em] text-primary-foreground">
                <Terminal className="size-2.5" aria-hidden="true" />
                PROMPT → RENDER
              </span>
              <span className="font-mono text-[11px] font-medium text-foreground">
                {activeArtwork.plate}
              </span>
              <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
                · {activeArtwork.title}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                {activeArtwork.renderSpec}
              </span>

              <div className="flex items-center gap-1 pl-1" role="tablist" aria-label="切换展陈作品">
                {CURATED_GALLERY_ARTWORKS.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={idx === activeIndex}
                    aria-label={`查看作品 ${item.title}`}
                    onClick={() => setActiveIndex(idx)}
                    className={cn(
                      "inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/25",
                      idx === activeIndex
                        ? "bg-foreground text-background font-semibold"
                        : "bg-surface-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    0{idx + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
            <div className="flex min-h-[2.25rem] min-w-0 flex-1 items-start gap-2">
              <span className="mt-0.5 select-none font-mono text-xs font-semibold text-muted-foreground" aria-hidden="true">
                ›
              </span>
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={activeArtwork.id}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, y: -3 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="line-clamp-2 text-xs leading-[1.55] text-foreground/90"
                >
                  {activeArtwork.prompt}
                </motion.p>
              </AnimatePresence>
            </div>

            <button
              type="button"
              onClick={handleCreateWithInspiration}
              className="group/inspire inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border-strong/75 bg-surface-muted/85 px-3.5 text-xs font-semibold tracking-[-0.01em] text-foreground shadow-2xs transition-all duration-150 hover:-translate-y-[1px] hover:border-foreground/40 hover:bg-foreground hover:text-background active:scale-[0.98]"
            >
              <span>以此灵感创作</span>
              <ArrowUpRight
                className="size-3.5 transition-transform duration-150 group-hover/inspire:translate-x-0.5 group-hover/inspire:-translate-y-0.5"
                aria-hidden="true"
              />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function GalleryExhibitionFrame({
  artwork,
  index,
  isActive,
  isHeroSpan,
  prefersReducedMotion,
  onSelect,
}: {
  artwork: CuratedArtwork;
  index: number;
  isActive: boolean;
  isHeroSpan: boolean;
  prefersReducedMotion: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      onFocus={onSelect}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : { duration: 0.45, delay: 0.06 * index, ease: [0.22, 1, 0.36, 1] }
      }
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl bg-surface p-1.5 text-left transition-all duration-200",
        "ring-1 ring-black/[0.08] dark:ring-white/[0.12]",
        isHeroSpan ? "sm:col-span-7" : "sm:col-span-5",
        isActive
          ? "shadow-[0_10px_28px_-8px_rgba(0,0,0,0.14)] ring-foreground/35 dark:ring-white/35"
          : "hover:ring-black/[0.18] dark:hover:ring-white/[0.22]",
      )}
      aria-label={`${artwork.title} — ${artwork.subtitle}`}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-[8px] bg-surface-muted",
          isHeroSpan
            ? index === 0
              ? "aspect-[16/10]"
              : "aspect-[16/9.6]"
            : "aspect-[16/10] sm:min-h-[9.25rem] sm:flex-1 sm:aspect-auto",
        )}
      >
        <img
          src={artwork.src}
          alt={artwork.title}
          loading="eager"
          decoding="async"
          draggable={false}
          className={cn(
            "h-full w-full select-none object-cover object-center transition-transform duration-500 ease-out",
            !prefersReducedMotion && "group-hover:scale-[1.03]",
          )}
        />
        <div className="pointer-events-none absolute inset-0 rounded-[8px] ring-1 ring-inset ring-black/[0.06] dark:ring-white/[0.08]" />

        <span className="pointer-events-none absolute top-2 right-2 rounded bg-black/68 px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-[0.08em] text-zinc-100 backdrop-blur-xs">
          {artwork.aspectTag}
        </span>
      </div>

      {/* Studio Mat & Caption Bar */}
      <div className="flex items-center justify-between gap-2 px-1.5 pt-2 pb-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 font-mono text-[10px] font-medium text-subtle-foreground">
            {artwork.plate}
          </span>
          <span className=" whitespace-nowrap text-xs font-medium tracking-[-0.01em] text-foreground">
            {artwork.title}
          </span>
        </div>
        <span
          className={cn(
            "shrink-0 whitespace-nowrap text-[10px] text-muted-foreground",
            isHeroSpan ? "hidden xl:inline" : "hidden 2xl:inline",
          )}
        >
          {artwork.subtitle}
        </span>
      </div>
    </motion.button>
  );
}
