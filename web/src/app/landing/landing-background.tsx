import { cn } from "@/lib/utils";

interface LandingBackgroundProps {
  isDark: boolean;
}

/**
 * Gallery Paper (#fafafa) & Obsidian Ink (#09090b) architectural studio backdrop.
 * Uses the 32px hairline grid (.studio-grid-bg) with a soft radial vignette mask
 * and subtle tactile paper grain — zero cold-blue cast.
 */
export function LandingBackground({ isDark }: LandingBackgroundProps) {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {/* Base Gallery Paper / Obsidian Ink canvas */}
      <div className="absolute inset-0 bg-background" />

      {/* 32px architectural hairline grid faded organically toward edges */}
      <div
        className="studio-grid-bg absolute inset-0 [mask-image:radial-gradient(ellipse_82%_74%_at_50%_42%,black_32%,transparent_100%)]"
      />

      {/* Restrained neutral luminance — warm paper diffuse light in light mode, subtle tungsten-silver glow in dark mode */}
      <div
        className="absolute inset-0"
        style={{
          background: isDark
            ? "radial-gradient(circle at 72% 38%, rgba(255, 255, 255, 0.045), transparent 48%), radial-gradient(circle at 22% 24%, rgba(244, 244, 245, 0.03), transparent 44%)"
            : "radial-gradient(circle at 72% 38%, rgba(24, 24, 27, 0.03), transparent 50%), radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.9), transparent 46%)",
        }}
      />

      {/* Fine editorial film/paper grain */}
      <div
        className={cn(
          "video-stage-grain absolute inset-0",
          isDark ? "opacity-[0.045]" : "opacity-[0.025]",
        )}
      />

      {/* Soft perimeter vignette */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t to-transparent",
          isDark ? "from-[#09090b]" : "from-[#fafafa]",
        )}
      />
    </div>
  );
}
