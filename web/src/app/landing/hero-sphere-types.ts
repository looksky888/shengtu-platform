import type { MutableRefObject, RefObject } from "react";

export type Vec3 = { x: number; y: number; z: number };

export type Dust = {
  theta: number;
  phi: number;
  r: number;
  size: number;
  phase: number;
  speed: number;
  hue: number;
  twinkle: number;
  trail: number;
};

export type Projected = { x: number; y: number; depth: number; z: number };

export type HeroParallax = { x: number; y: number };

export type HeroSphereQuality = "full" | "lite";

export type HeroSphereCanvasProps = {
  reducedMotion?: boolean;
  dark?: boolean;
  quality?: HeroSphereQuality;
  parallaxRef?: RefObject<HeroParallax | null> | MutableRefObject<HeroParallax>;
  parallax?: HeroParallax;
};
