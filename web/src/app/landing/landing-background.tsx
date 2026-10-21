import type { RefObject } from "react";

import { HeroSphereCanvas, type HeroParallax } from "@/app/landing/hero-sphere-canvas";
import { LANDING_BRAND } from "@/app/landing/landing-brand";
import { cn } from "@/lib/utils";

interface LandingBackgroundProps {
  bgShiftRef: RefObject<HTMLDivElement | null>;
  entered: boolean;
  isDark: boolean;
  parallaxRef: RefObject<HeroParallax>;
  prefersReducedMotion: boolean;
  watermarkRef: RefObject<HTMLDivElement | null>;
}

export function LandingBackground({
  bgShiftRef,
  entered,
  isDark,
  parallaxRef,
  prefersReducedMotion,
  watermarkRef,
}: LandingBackgroundProps) {
  return (
    <>
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          isDark
            ? "bg-[radial-gradient(ellipse_at_center,rgba(15,23,42,1)_0%,rgba(9,11,16,1)_55%,rgba(6,8,12,1)_100%)]"
            : "bg-[radial-gradient(ellipse_at_center,rgba(239,246,255,1)_0%,rgba(248,250,252,1)_48%,rgba(241,245,249,0.95)_100%)]",
        )}
      />
      <div
        ref={bgShiftRef}
        className="pointer-events-none absolute -inset-[4%] will-change-transform"
        style={{
          background: isDark
            ? "radial-gradient(circle at 20% 24%, rgba(59,130,246,0.14), transparent 42%), radial-gradient(circle at 80% 70%, rgba(20,86,240,0.12), transparent 46%), radial-gradient(circle at 50% 40%, rgba(96,165,250,0.06), transparent 50%)"
            : "radial-gradient(circle at 20% 24%, rgba(59,130,246,0.12), transparent 42%), radial-gradient(circle at 80% 70%, rgba(37,99,235,0.08), transparent 46%), radial-gradient(circle at 50% 40%, rgba(96,165,250,0.05), transparent 50%)",
        }}
      />
      <div
        className={cn("pointer-events-none absolute inset-0 mix-blend-multiply", isDark ? "opacity-[0.06]" : "opacity-[0.03]")}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
        aria-hidden="true"
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t to-transparent",
          isDark ? "from-[#090b10] via-[#090b10]/88" : "from-[#f8fafc] via-[#f8fafc]/85",
        )}
        aria-hidden="true"
      />
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-700 ease-out",
          entered ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      >
        <HeroSphereCanvas reducedMotion={prefersReducedMotion} dark={isDark} parallaxRef={parallaxRef} />
      </div>
      <div
        ref={watermarkRef}
        className={cn(
          "pointer-events-none absolute inset-0 top-[6%] flex items-center justify-center select-none will-change-transform",
          "transition-opacity duration-1000 ease-out max-[480px]:opacity-40",
          entered ? "opacity-100" : "opacity-0",
        )}
        aria-hidden="true"
      >
        <div className="relative flex h-[min(48vh,26rem)] w-full max-w-[min(96vw,68rem)] items-center justify-between px-[clamp(0.5rem,3vw,1.5rem)]">
          {[LANDING_BRAND.left, LANDING_BRAND.right].map((text) => (
            <span
              key={text}
              className={cn(
                "bg-clip-text text-transparent",
                "text-[clamp(2rem,7.2vw,5.25rem)] font-semibold leading-none tracking-[-0.05em]",
                isDark
                  ? "bg-gradient-to-b from-blue-300/22 via-blue-400/12 to-blue-600/6"
                  : "bg-gradient-to-b from-slate-800/16 via-blue-800/10 to-blue-600/5",
              )}
            >
              {text}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
