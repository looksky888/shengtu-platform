import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";

import { EditorialGalleryStage } from "@/app/landing/editorial-gallery-stage";
import {
  LANDING_BRAND,
  STUDIO_CAPABILITY_SPECS,
} from "@/app/landing/landing-brand";
import { Button } from "@/components/ui/button";
import { usePageVisible } from "@/lib/use-page-visible";
import { cn } from "@/lib/utils";

interface LandingCTAProps {
  brandTitle: string;
  entered: boolean;
  prefersReducedMotion: boolean;
  registrationEnabled: boolean;
}

export function LandingCTA({
  brandTitle,
  entered,
  prefersReducedMotion,
  registrationEnabled,
}: LandingCTAProps) {
  const pageVisible = usePageVisible();
  const [phraseIndex, setPhraseIndex] = useState(0);
  const phrases = LANDING_BRAND.headlineRotatingPhrases;

  useEffect(() => {
    if (prefersReducedMotion || !pageVisible) return;
    const timer = window.setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % phrases.length);
    }, 3800);
    return () => window.clearInterval(timer);
  }, [pageVisible, phrases.length, prefersReducedMotion]);

  const currentPhrase = phrases[phraseIndex] ?? phrases[0];

  return (
    <main
      id="hero-main"
      tabIndex={-1}
      className={cn(
        "relative z-10 flex flex-1 flex-col justify-between outline-none",
        "transition-opacity duration-500 ease-out motion-reduce:transition-none",
        entered ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="mx-auto grid w-full max-w-[1380px] flex-1 items-center gap-10 px-4 py-8 sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-12 lg:px-10 xl:gap-16">
        {/* Hero Left Column — Editorial Studio Copy & Capability Spec Strip */}
        <div className="flex flex-col items-start gap-6 sm:gap-7">
          {/* Eyebrow Monochrome Studio Pill */}
          <div className="inline-flex items-center gap-2.5 rounded-full border border-border/80 bg-surface/90 px-3.5 py-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-sm">
            <span className="relative flex size-2" aria-hidden="true">
              <span
                className={cn(
                  "absolute inline-flex h-full w-full rounded-full bg-emerald-500/60",
                  !prefersReducedMotion && "animate-ping",
                )}
              />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-mono text-[10.5px] font-medium tracking-[0.06em] text-muted-foreground sm:text-[11px]">
              {LANDING_BRAND.eyebrow}
            </span>
          </div>

          {/* Editorial Headline */}
          <div className="flex flex-col gap-3.5">
            <h1
              className="text-balance text-[2rem] leading-[1.15] font-semibold tracking-[-0.035em] text-foreground sm:text-[2.65rem] xl:text-[3.1rem]"
              aria-label={`${LANDING_BRAND.headlinePrefix}${phrases[0]}`}
            >
              <span className="block">{LANDING_BRAND.headlinePrefix}</span>
              <span className="mt-1 inline-flex min-h-[1.22em] items-baseline">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={currentPhrase}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    className="inline-block border-b-2 border-foreground/20 pb-0.5 text-foreground"
                  >
                    {currentPhrase}
                  </motion.span>
                </AnimatePresence>
              </span>
            </h1>

            <p className="max-w-[34rem] text-pretty text-sm leading-7 text-muted-foreground sm:text-[15px]">
              {LANDING_BRAND.description}
            </p>
          </div>

          {/* Primary & Secondary CTAs */}
          <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Button
              asChild
              size="xl"
              className="group h-11 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground shadow-[0_2px_10px_rgba(0,0,0,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/90"
            >
              <Link to="/login">
                <span>立即开始创作</span>
                <ArrowRight
                  className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              size="xl"
              className="h-11 rounded-xl border-border/90 bg-surface/85 px-6 text-sm font-medium text-foreground backdrop-blur-sm transition-all duration-200 hover:border-border-strong hover:bg-surface-hover"
            >
              <Link to={registrationEnabled ? "/login?register=1" : "/login"}>
                {registrationEnabled ? "创建工作室账号" : "进入控制台"}
              </Link>
            </Button>
          </div>

          {/* Studio Capability Architectural Spec Strip */}
          <div className="w-full pt-2">
            <dl
              className="grid grid-cols-2 divide-y divide-border/80 overflow-hidden rounded-xl border border-border/80 bg-surface/85 shadow-2xs backdrop-blur-sm sm:grid-cols-4 sm:divide-x sm:divide-y-0"
              aria-label="核心创作能力"
            >
              {STUDIO_CAPABILITY_SPECS.map((spec, idx) => (
                <div
                  key={spec.index}
                  className={cn(
                    "flex flex-col gap-1 px-3 py-3 transition-colors hover:bg-surface-hover/60",
                    idx % 2 === 1 && "border-l border-border/80 sm:border-l-0",
                  )}
                >
                  <dt className="flex items-center justify-between gap-1 font-mono text-[10px] tracking-[0.08em] text-subtle-foreground">
                    <span>{spec.index}</span>
                    <span>{spec.code}</span>
                  </dt>
                  <dd className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                    {spec.label}
                  </dd>
                  <dd className="line-clamp-2 text-[11px] leading-[1.45] text-muted-foreground">
                    {spec.detail}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Hero Right Column — Curated Exhibition Gallery Stage */}
        <EditorialGalleryStage prefersReducedMotion={prefersReducedMotion} />
      </div>

      {/* Minimalist Architectural Footer Hairline */}
      <footer className="border-t border-border/60 bg-background/70 backdrop-blur-xs">
        <div className="mx-auto flex w-full max-w-[1380px] flex-col items-center justify-between gap-1.5 px-4 py-3 text-center font-mono text-[10px] tracking-[0.09em] text-subtle-foreground uppercase sm:flex-row sm:px-8 lg:px-10">
          <span>{brandTitle} · GALLERY PAPER &amp; OBSIDIAN INK</span>
          <span className="hidden sm:inline">{LANDING_BRAND.footerRight}</span>
        </div>
      </footer>
    </main>
  );
}
