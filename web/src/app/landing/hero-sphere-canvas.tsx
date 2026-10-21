"use client";

import { useEffect, useRef } from "react";

import { strokePolyline } from "./hero-sphere-draw";
import { buildHeroSphereGeometry, project, rotateFactory } from "./hero-sphere-math";
import { drawHeroSphereDust, drawHeroSphereNodesAndSparkles } from "./hero-sphere-particles";
import {
  drawHeroSphereAtmosphereAndOrbits,
  drawHeroSphereCore,
  drawHeroSphereRim,
} from "./hero-sphere-shell";
import type { HeroSphereCanvasProps } from "./hero-sphere-types";

export type { HeroParallax } from "./hero-sphere-types";

/**
 * Premium lat/lon globe hero — dual-pass depth, energy sweep, orbital rings,
 * calm dust. Canvas 2D; rotation follows time + mouse parallax.
 * No WebGL: keeps bundle small while still reading as soft 3D.
 */
export function HeroSphereCanvas({
  reducedMotion = false,
  dark = false,
  quality = "full",
  parallaxRef: externalParallaxRef,
  parallax = { x: 0, y: 0 },
}: HeroSphereCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const localParallaxRef = useRef(parallax);
  localParallaxRef.current = parallax;
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const redrawStaticRef = useRef<() => void>(() => undefined);
  const lite = quality === "lite";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let t = 0;
    let lastNow = performance.now();
    let px = 0;
    let py = 0;

    // Cap DPR harder on lite panel to cut fill cost.
    const dprCap = Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 2);
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      const dpr = dprCap;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const {
      meridianLines,
      parallelLines,
      equator,
      innerMeridians,
      innerParallels,
      nodes,
      sparkles,
      sweepPath,
      dust,
    } = buildHeroSphereGeometry(lite);

    const draw = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;
      const isDark = darkRef.current;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const target =
        externalParallaxRef?.current ?? localParallaxRef.current ?? { x: 0, y: 0 };
      // Frame-rate independent exponential smoothing toward mouse.
      const ease = reducedMotion ? 1 : 1 - Math.exp(-10 * dt);
      px += (target.x - px) * ease;
      py += (target.y - py) * ease;

      const minDim = Math.min(w, h);
      const cx = w * 0.5 + px * minDim * 0.022;
      const cy = h * 0.39 + py * minDim * 0.016;
      const scale = minDim * 0.315;

      // Idle drift so it never feels frozen
      const idleX = reducedMotion ? 0 : Math.sin(t * 0.11) * 0.04;
      const idleY = reducedMotion ? 0 : Math.cos(t * 0.09) * 0.025;

      const baseY = reducedMotion ? 0.55 : t * 0.14;
      const baseX = reducedMotion ? 0.22 : 0.18 + Math.sin(t * 0.2) * 0.04;
      const baseZ = reducedMotion ? 0 : Math.sin(t * 0.07) * 0.03;
      const rotY = baseY + px * 0.52 + idleX;
      const rotX = baseX - py * 0.34 + idleY;
      const rotate = rotateFactory(rotY, rotX, baseZ);

      // Light direction for pseudo-3D shading (screen-space)
      const light = { x: -0.45 + px * 0.15, y: -0.55 - py * 0.1, z: 0.7 };
      const renderFrame = {
        ctx,
        cx,
        cy,
        scale,
        t,
        dt,
        px,
        py,
        reducedMotion,
        isDark,
        lite,
        nodes,
        sparkles,
        dust,
        rotate,
        lightX: light.x,
      };
      drawHeroSphereAtmosphereAndOrbits(renderFrame);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // ===== Inner shell (dimmer, nested) =====
      for (const line of innerMeridians) {
        strokePolyline(ctx, line, rotate, scale, cx, cy, 0.18, isDark);
      }
      for (const line of innerParallels) {
        strokePolyline(ctx, line, rotate, scale, cx, cy, 0.15, isDark);
      }

      // Energy sweep position 0..1
      const sweepT = reducedMotion ? -1 : (t * 0.12) % 1;

      // ===== Outer wireframe =====
      for (let mi = 0; mi < meridianLines.length; mi++) {
        // Sweep only on a couple meridians for drama
        const s = mi === 0 || mi === Math.floor(meridianLines.length / 3) ? sweepT : -1;
        strokePolyline(ctx, meridianLines[mi], rotate, scale, cx, cy, 0.4, isDark, s);
      }
      for (const line of parallelLines) {
        strokePolyline(ctx, line, rotate, scale, cx, cy, 0.34, isDark);
      }
      strokePolyline(ctx, equator, rotate, scale, cx, cy, 0.58, isDark, (sweepT + 0.5) % 1);
      drawHeroSphereNodesAndSparkles(renderFrame);

      // Sweep hotspot glow on surface
      if (sweepT >= 0 && sweepPath) {
        const idx = Math.floor(sweepT * (sweepPath.length - 1));
        const sp = rotate(sweepPath[idx]);
        if (sp.z > -0.2) {
          const s = project(sp, scale, cx, cy);
          const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, scale * 0.14);
          g.addColorStop(0, "rgba(255, 255, 255, 0.55)");
          g.addColorStop(0.3, "rgba(96, 165, 250, 0.35)");
          g.addColorStop(1, "rgba(96, 165, 250, 0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(s.x, s.y, scale * 0.14, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      drawHeroSphereCore(renderFrame);
      drawHeroSphereDust(renderFrame);
      drawHeroSphereRim(renderFrame);

      if (!reducedMotion) {
        t += dt;
        raf = requestAnimationFrame(draw);
      }
    };

    const redrawStatic = () => draw(performance.now());
    const handleResize = () => {
      resize();
      if (reducedMotion) redrawStatic();
    };
    redrawStaticRef.current = redrawStatic;
    window.addEventListener("resize", handleResize);

    if (reducedMotion) {
      redrawStatic();
      return () => {
        running = false;
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", handleResize);
        redrawStaticRef.current = () => undefined;
      };
    }

    const updateAnimationForVisibility = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState !== "hidden") {
        lastNow = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", updateAnimationForVisibility);
    updateAnimationForVisibility();
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", updateAnimationForVisibility);
      window.removeEventListener("resize", handleResize);
      redrawStaticRef.current = () => undefined;
    };
  }, [reducedMotion, externalParallaxRef, lite]);

  useEffect(() => {
    if (reducedMotion) redrawStaticRef.current();
  }, [dark, parallax.x, parallax.y, reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
