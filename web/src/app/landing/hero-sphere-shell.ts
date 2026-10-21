import { project } from "./hero-sphere-math";
import type { Vec3 } from "./hero-sphere-types";

type HeroSphereShellFrame = {
  ctx: CanvasRenderingContext2D;
  cx: number;
  cy: number;
  scale: number;
  t: number;
  px: number;
  py: number;
  reducedMotion: boolean;
  isDark: boolean;
  rotate: (point: Vec3) => Vec3;
};

export function drawHeroSphereAtmosphereAndOrbits({
  ctx,
  cx,
  cy,
  scale,
  t,
  px,
  py,
  reducedMotion,
  isDark,
}: HeroSphereShellFrame) {
  const bloom = ctx.createRadialGradient(cx, cy, scale * 0.05, cx, cy, scale * 1.7);
  if (isDark) {
    bloom.addColorStop(0, "rgba(59, 130, 246, 0.26)");
    bloom.addColorStop(0.25, "rgba(37, 99, 235, 0.12)");
    bloom.addColorStop(0.55, "rgba(20, 86, 240, 0.06)");
    bloom.addColorStop(1, "rgba(9, 11, 16, 0)");
  } else {
    bloom.addColorStop(0, "rgba(191, 219, 254, 0.38)");
    bloom.addColorStop(0.25, "rgba(96, 165, 250, 0.13)");
    bloom.addColorStop(0.55, "rgba(59, 130, 246, 0.05)");
    bloom.addColorStop(1, "rgba(248, 250, 252, 0)");
  }
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(cx, cy, scale * 1.7, 0, Math.PI * 2);
  ctx.fill();

  const halo = ctx.createRadialGradient(cx, cy, scale * 0.92, cx, cy, scale * 1.25);
  halo.addColorStop(0, "rgba(59, 130, 246, 0)");
  halo.addColorStop(0.55, isDark ? "rgba(96, 165, 250, 0.1)" : "rgba(59, 130, 246, 0.06)");
  halo.addColorStop(1, "rgba(59, 130, 246, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, scale * 1.25, 0, Math.PI * 2);
  ctx.fill();

  const volume = ctx.createRadialGradient(
    cx - scale * 0.12,
    cy - scale * 0.14,
    scale * 0.04,
    cx,
    cy,
    scale * 1.02,
  );
  if (isDark) {
    volume.addColorStop(0, "rgba(239, 246, 255, 0.2)");
    volume.addColorStop(0.35, "rgba(96, 165, 250, 0.1)");
    volume.addColorStop(0.72, "rgba(20, 86, 240, 0.06)");
    volume.addColorStop(1, "rgba(15, 23, 42, 0)");
  } else {
    volume.addColorStop(0, "rgba(255, 255, 255, 0.65)");
    volume.addColorStop(0.35, "rgba(219, 234, 254, 0.24)");
    volume.addColorStop(0.72, "rgba(147, 197, 253, 0.08)");
    volume.addColorStop(1, "rgba(147, 197, 253, 0)");
  }
  ctx.fillStyle = volume;
  ctx.beginPath();
  ctx.arc(cx, cy, scale * 1.02, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 4; i++) {
    const rx = scale * (1.06 + i * 0.135);
    const ry = scale * (0.19 + i * 0.03);
    const tilt =
      (reducedMotion ? i * 0.48 + 0.25 : t * (0.048 + i * 0.016) + i * 0.72) +
      px * 0.2 -
      py * 0.1;
    ctx.save();
    ctx.rotate(tilt);
    ctx.strokeStyle = isDark
      ? `rgba(96, 165, 250, ${0.18 - i * 0.03})`
      : `rgba(20, 86, 240, ${0.15 - i * 0.026})`;
    ctx.lineWidth = 1.1 - i * 0.08;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(59, 130, 246, ${isDark ? 0.22 - i * 0.03 : 0.14 - i * 0.022})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, -0.55 + i * 0.08 + t * 0.15, 0.75 + i * 0.06 + t * 0.15);
    ctx.stroke();
    if (!reducedMotion) {
      const ang = t * (0.35 + i * 0.08) + i;
      const bx = Math.cos(ang) * rx;
      const by = Math.sin(ang) * ry;
      const bead = ctx.createRadialGradient(bx, by, 0, bx, by, 5);
      bead.addColorStop(0, "rgba(255, 255, 255, 0.9)");
      bead.addColorStop(0.35, "rgba(96, 165, 250, 0.6)");
      bead.addColorStop(1, "rgba(96, 165, 250, 0)");
      ctx.fillStyle = bead;
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

export function drawHeroSphereCore({
  ctx,
  cx,
  cy,
  scale,
  t,
  reducedMotion,
  rotate,
}: HeroSphereShellFrame) {
  const corePulse = reducedMotion ? 1 : 0.93 + Math.sin(t * 0.85) * 0.07;
  const coreRadius = scale * 0.2 * corePulse;
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 1.45);
  core.addColorStop(0, "rgba(255, 255, 255, 0.97)");
  core.addColorStop(0.15, "rgba(239, 246, 255, 0.88)");
  core.addColorStop(0.4, "rgba(96, 165, 250, 0.4)");
  core.addColorStop(0.7, "rgba(59, 130, 246, 0.1)");
  core.addColorStop(1, "rgba(59, 130, 246, 0)");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, coreRadius * 1.45, 0, Math.PI * 2);
  ctx.fill();

  const glint = rotate({ x: -0.38, y: -0.42, z: 0.82 });
  if (glint.z <= 0.15) return;
  const projected = project(
    { x: glint.x * 0.52, y: glint.y * 0.52, z: glint.z * 0.52 },
    scale,
    cx,
    cy,
  );
  const glow = ctx.createRadialGradient(
    projected.x,
    projected.y,
    0,
    projected.x,
    projected.y,
    scale * 0.13,
  );
  glow.addColorStop(0, "rgba(255, 255, 255, 0.6)");
  glow.addColorStop(0.4, "rgba(255, 255, 255, 0.12)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(projected.x, projected.y, scale * 0.13, 0, Math.PI * 2);
  ctx.fill();
}

export function drawHeroSphereRim({ ctx, cx, cy, scale, isDark }: HeroSphereShellFrame) {
  ctx.strokeStyle = isDark ? "rgba(96, 165, 250, 0.22)" : "rgba(20, 86, 240, 0.14)";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(cx, cy, scale * 0.998, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = isDark ? "rgba(59, 130, 246, 0.14)" : "rgba(59, 130, 246, 0.08)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, scale * 1.02, 0, Math.PI * 2);
  ctx.stroke();
}
