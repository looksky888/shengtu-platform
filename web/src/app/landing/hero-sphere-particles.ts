import { project } from "./hero-sphere-math";
import type { Dust, Projected, Vec3 } from "./hero-sphere-types";

type HeroSphereParticleFrame = {
  ctx: CanvasRenderingContext2D;
  nodes: Vec3[];
  sparkles: Vec3[];
  dust: Dust[];
  rotate: (point: Vec3) => Vec3;
  scale: number;
  cx: number;
  cy: number;
  t: number;
  dt: number;
  reducedMotion: boolean;
  isDark: boolean;
  lightX: number;
  lite: boolean;
};

export function drawHeroSphereNodesAndSparkles({
  ctx,
  nodes,
  sparkles,
  rotate,
  scale,
  cx,
  cy,
  t,
  reducedMotion,
  isDark,
  lightX,
}: HeroSphereParticleFrame) {
  const drawnNodes: Projected[] = [];
  for (const point of nodes) {
    const rotated = rotate(point);
    if (rotated.z < -0.4) continue;
    drawnNodes.push(project(rotated, scale, cx, cy));
  }
  drawnNodes.sort((a, b) => a.z - b.z);

  for (const node of drawnNodes) {
    const lit = Math.max(
      0.35,
      Math.min(1, 0.45 + node.depth * 0.4 + ((node.x - cx) / scale) * lightX * -0.15),
    );
    const alpha = (0.14 + node.depth * 0.5) * lit * (isDark ? 1.15 : 1);
    const radius = 0.75 + node.depth * 1.45;
    ctx.fillStyle = `rgba(59, 130, 246, ${alpha * 0.28})`;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius * 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isDark
      ? `rgba(96, 165, 250, ${alpha})`
      : `rgba(20, 86, 240, ${alpha})`;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (node.z > 0.35) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.35 + node.depth * 0.3})`;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const point of sparkles) {
    const rotated = rotate(point);
    if (rotated.z < -0.1) continue;
    const sparkle = project(rotated, scale, cx, cy);
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.25 + point.x * 7 + point.y * 5);
    const alpha = (0.07 + sparkle.depth * 0.26) * (0.4 + pulse * 0.6);
    ctx.fillStyle = `rgba(96, 165, 250, ${alpha})`;
    ctx.beginPath();
    ctx.arc(sparkle.x, sparkle.y, 0.5 + sparkle.depth * 0.85 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawHeroSphereDust({
  ctx,
  dust,
  rotate,
  scale,
  cx,
  cy,
  dt,
  reducedMotion,
  lite,
}: HeroSphereParticleFrame) {
  const dustScreen: Array<Projected & { size: number; alpha: number; hue: number }> = [];
  for (const particle of dust) {
    if (!reducedMotion) {
      particle.theta += dt * 0.22 * particle.speed;
      particle.phase += dt * 0.7 * particle.twinkle;
    }
    const breathe = 1 + Math.sin(particle.phase) * 0.028;
    const radius = particle.r * breathe;
    const sinPhi = Math.sin(particle.phi);
    const local: Vec3 = {
      x: radius * sinPhi * Math.cos(particle.theta),
      y: radius * Math.cos(particle.phi),
      z: radius * sinPhi * Math.sin(particle.theta),
    };
    const rotated = rotate(local);
    if (rotated.z < -0.3) continue;
    const projected = project(rotated, scale, cx, cy);
    const twinkle = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(particle.phase));
    const alpha = (0.14 + projected.depth * 0.4) * twinkle;
    const size = particle.size * projected.depth * (0.78 + 0.22 * twinkle);
    dustScreen.push({ ...projected, size, alpha, hue: particle.hue });

    if (particle.trail > 0.72 && !reducedMotion) {
      const back: Vec3 = {
        x: radius * sinPhi * Math.cos(particle.theta - 0.08),
        y: radius * Math.cos(particle.phi),
        z: radius * sinPhi * Math.sin(particle.theta - 0.08),
      };
      const rotatedBack = rotate(back);
      if (rotatedBack.z > -0.2) {
        const projectedBack = project(rotatedBack, scale, cx, cy);
        ctx.strokeStyle = `hsla(${particle.hue}, 80%, 58%, ${alpha * 0.35})`;
        ctx.lineWidth = size * 0.35;
        ctx.beginPath();
        ctx.moveTo(projectedBack.x, projectedBack.y);
        ctx.lineTo(projected.x, projected.y);
        ctx.stroke();
      }
    }
  }

  if (!lite) {
    for (let i = 0; i < dustScreen.length; i++) {
      const a = dustScreen[i];
      for (let j = i + 1; j < Math.min(dustScreen.length, i + 6); j++) {
        const b = dustScreen[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist2 = dx * dx + dy * dy;
        const maxDistance = scale * 0.22;
        if (dist2 < maxDistance * maxDistance && dist2 > 4) {
          const distance = Math.sqrt(dist2);
          const alpha =
            (1 - distance / maxDistance) * 0.08 * Math.min(a.alpha, b.alpha) * 2.5;
          ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
  }

  for (const particle of dustScreen) {
    ctx.fillStyle = `hsla(${particle.hue}, 80%, 62%, ${particle.alpha * 0.32})`;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * 1.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `hsla(${particle.hue}, 88%, 56%, ${particle.alpha})`;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * 0.48, 0, Math.PI * 2);
    ctx.fill();
  }
}
