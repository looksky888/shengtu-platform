import { project } from "./hero-sphere-math";
import type { Projected, Vec3 } from "./hero-sphere-types";

/** Draw polyline with depth fade; optional energy sweep hotspot along path. */
export function strokePolyline(
  ctx: CanvasRenderingContext2D,
  line: Vec3[],
  rotate: (p: Vec3) => Vec3,
  scale: number,
  cx: number,
  cy: number,
  baseAlpha: number,
  dark: boolean,
  sweepT = -1,
) {
  let prev: Projected | null = null;
  let prevLocalZ = 0;
  const n = line.length;
  for (let i = 0; i < n; i++) {
    const r = rotate(line[i]);
    if (r.z < -0.62) {
      prev = null;
      continue;
    }
    const s = project(r, scale, cx, cy);
    const face = 0.4 + (r.z + 1) * 0.4;
    let alpha = baseAlpha * (0.2 + s.depth * 0.8) * face;

    // Traveling energy pulse along curve
    if (sweepT >= 0) {
      const u = i / (n - 1);
      const dist = Math.abs(u - sweepT);
      const band = Math.min(dist, 1 - dist);
      if (band < 0.08) {
        alpha += (1 - band / 0.08) * 0.45;
      }
    }

    if (!prev) {
      prev = s;
      prevLocalZ = r.z;
      continue;
    }
    // Soften when straddling silhouette
    if (prevLocalZ * r.z < 0 && Math.abs(prevLocalZ) + Math.abs(r.z) > 0.3) {
      prev = s;
      prevLocalZ = r.z;
      continue;
    }

    const a = Math.min(0.72, alpha);
    ctx.strokeStyle = a > 0.38
      ? dark
        ? `rgba(253, 224, 71, ${a})`
        : `rgba(217, 119, 6, ${a})`
      : dark
        ? `rgba(251, 191, 36, ${a * 0.9})`
        : `rgba(180, 83, 9, ${a})`;
    ctx.lineWidth = 0.55 + s.depth * 0.65 + (a > 0.4 ? 0.35 : 0);
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
    prev = s;
    prevLocalZ = r.z;
  }
}
