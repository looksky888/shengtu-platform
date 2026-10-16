import type { Dust, Projected, Vec3 } from "./hero-sphere-types";

export function spherePoint(lat: number, lon: number): Vec3 {
  const cl = Math.cos(lat);
  return {
    x: cl * Math.cos(lon),
    y: Math.sin(lat),
    z: cl * Math.sin(lon),
  };
}

export function project(p: Vec3, scale: number, cx: number, cy: number): Projected {
  const perspective = 3.55 / (3.55 + p.z);
  return {
    x: cx + p.x * scale * perspective,
    y: cy + p.y * scale * perspective,
    depth: perspective,
    z: p.z,
  };
}

export function rotateFactory(rotY: number, rotX: number, rotZ = 0) {
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);
  const cosZ = Math.cos(rotZ);
  const sinZ = Math.sin(rotZ);
  return (p: Vec3): Vec3 => {
    // Y → X → small Z roll
    const x = p.x * cosY - p.z * sinY;
    let z = p.x * sinY + p.z * cosY;
    const y = p.y * cosX - z * sinX;
    z = p.y * sinX + z * cosX;
    const x2 = x * cosZ - y * sinZ;
    const y2 = x * sinZ + y * cosZ;
    return { x: x2, y: y2, z };
  };
}

export type HeroSphereGeometry = {
  meridianLines: Vec3[][];
  parallelLines: Vec3[][];
  equator: Vec3[];
  innerMeridians: Vec3[][];
  innerParallels: Vec3[][];
  nodes: Vec3[];
  sparkles: Vec3[];
  sweepPath: Vec3[];
  dust: Dust[];
};

/** Precompute wireframe / dust for a quality tier (full vs lite). */
export function buildHeroSphereGeometry(lite: boolean): HeroSphereGeometry {
  const meridians = lite ? 10 : 16;
  const parallels = lite ? 6 : 10;
  const segs = lite ? 24 : 40;

  const meridianLines: Vec3[][] = [];
  for (let m = 0; m < meridians; m++) {
    const lon = (m / meridians) * Math.PI * 2;
    const line: Vec3[] = [];
    for (let i = 0; i <= segs; i++) {
      line.push(spherePoint(-Math.PI / 2 + (i / segs) * Math.PI, lon));
    }
    meridianLines.push(line);
  }

  const parallelLines: Vec3[][] = [];
  for (let p = 1; p < parallels; p++) {
    const lat = -Math.PI / 2 + (p / parallels) * Math.PI;
    const line: Vec3[] = [];
    for (let i = 0; i <= segs; i++) {
      line.push(spherePoint(lat, (i / segs) * Math.PI * 2));
    }
    parallelLines.push(line);
  }

  const equator: Vec3[] = [];
  for (let i = 0; i <= segs; i++) {
    equator.push(spherePoint(0, (i / segs) * Math.PI * 2));
  }

  const innerScale = 0.72;
  const innerMeridians: Vec3[][] = meridianLines
    .filter((_, i) => i % 2 === 0)
    .map((line) => line.map((p) => ({ x: p.x * innerScale, y: p.y * innerScale, z: p.z * innerScale })));
  const innerParallels: Vec3[][] = parallelLines
    .filter((_, i) => i % 2 === 0)
    .map((line) => line.map((p) => ({ x: p.x * innerScale, y: p.y * innerScale, z: p.z * innerScale })));

  const nodes: Vec3[] = [];
  for (let p = 1; p < parallels; p++) {
    const lat = -Math.PI / 2 + (p / parallels) * Math.PI;
    for (let m = 0; m < meridians; m++) {
      nodes.push(spherePoint(lat, (m / meridians) * Math.PI * 2));
    }
  }
  nodes.push(spherePoint(Math.PI / 2, 0), spherePoint(-Math.PI / 2, 0));

  const sparkles: Vec3[] = [];
  const sparkleN = lite ? 28 : 72;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < sparkleN; i++) {
    const y = 1 - (i / Math.max(1, sparkleN - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    sparkles.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
  }

  const dust: Dust[] = Array.from({ length: lite ? 24 : 64 }, (_, i) => ({
    theta: Math.random() * Math.PI * 2,
    phi: Math.acos(2 * Math.random() - 1),
    r: 1.04 + (i % 8) * 0.045 + Math.random() * 0.14,
    size: 0.85 + Math.random() * 2.6,
    phase: Math.random() * Math.PI * 2,
    speed: 0.1 + Math.random() * 0.42,
    hue: 24 + Math.random() * 34,
    twinkle: 0.55 + Math.random() * 1.5,
    trail: Math.random(),
  }));

  return {
    meridianLines,
    parallelLines,
    equator,
    innerMeridians,
    innerParallels,
    nodes,
    sparkles,
    sweepPath: meridianLines[0],
    dust,
  };
}
