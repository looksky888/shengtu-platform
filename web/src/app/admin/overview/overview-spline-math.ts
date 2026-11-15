export type SplinePoint2D = {
  x: number;
  y: number;
};

export type CubicBezierSegment = {
  p1: SplinePoint2D;
  cp1: SplinePoint2D;
  cp2: SplinePoint2D;
  p2: SplinePoint2D;
};

function clamp(value: number, min: number, max: number): number {
  if (min > max) return value;
  return Math.min(max, Math.max(min, value));
}

/**
 * Computes Fritsch-Carlson monotone cubic Bezier segments with explicit Y-clamping
 * to [minY, maxY] (in SVG coordinates: [padTop, baselineY]) so curves NEVER dip below
 * the y = 0 baseline or overshoot above the plot ceiling.
 */
export function computeClampedMonotoneSegments(
  rawPoints: ReadonlyArray<SplinePoint2D>,
  bounds: { minY: number; maxY: number },
): CubicBezierSegment[] {
  const n = rawPoints.length;
  if (n < 2) return [];

  const minY = Math.min(bounds.minY, bounds.maxY);
  const maxY = Math.max(bounds.minY, bounds.maxY);

  const pts = rawPoints.map((pt) => ({
    x: pt.x,
    y: clamp(pt.y, minY, maxY),
  }));

  const deltas: number[] = new Array(n - 1).fill(0);
  for (let i = 0; i < n - 1; i += 1) {
    const dx = pts[i + 1]!.x - pts[i]!.x;
    deltas[i] = dx > 1e-6 ? (pts[i + 1]!.y - pts[i]!.y) / dx : 0;
  }

  const tangents: number[] = new Array(n).fill(0);
  tangents[0] = deltas[0]!;
  tangents[n - 1] = deltas[n - 2]!;

  for (let i = 1; i < n - 1; i += 1) {
    const dPrev = deltas[i - 1]!;
    const dNext = deltas[i]!;
    if (dPrev * dNext <= 0) {
      tangents[i] = 0;
    } else {
      tangents[i] = (dPrev + dNext) / 2;
    }
  }

  for (let i = 0; i < n - 1; i += 1) {
    const delta = deltas[i]!;
    if (Math.abs(delta) < 1e-9) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const alpha = tangents[i]! / delta;
    const beta = tangents[i + 1]! / delta;
    const hypot = Math.hypot(alpha, beta);
    if (hypot > 3) {
      const tau = 3 / hypot;
      tangents[i] = tau * alpha * delta;
      tangents[i + 1] = tau * beta * delta;
    }
  }

  const segments: CubicBezierSegment[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const dx = Math.max(0, p2.x - p1.x);
    const segMinY = Math.min(p1.y, p2.y);
    const segMaxY = Math.max(p1.y, p2.y);

    const cp1y = clamp(clamp(p1.y + (tangents[i]! * dx) / 3, segMinY, segMaxY), minY, maxY);
    const cp2y = clamp(clamp(p2.y - (tangents[i + 1]! * dx) / 3, segMinY, segMaxY), minY, maxY);

    segments.push({
      p1,
      cp1: { x: p1.x + dx / 3, y: cp1y },
      cp2: { x: p2.x - dx / 3, y: cp2y },
      p2,
    });
  }

  return segments;
}

export function buildClampedSplinePath(
  points: ReadonlyArray<SplinePoint2D>,
  bounds: { minY: number; maxY: number },
): string {
  if (points.length === 0) return "";
  const minY = Math.min(bounds.minY, bounds.maxY);
  const maxY = Math.max(bounds.minY, bounds.maxY);

  if (points.length === 1) {
    const p = points[0]!;
    const y = clamp(p.y, minY, maxY);
    return `M ${p.x.toFixed(2)} ${y.toFixed(2)}`;
  }

  const segments = computeClampedMonotoneSegments(points, { minY, maxY });
  if (segments.length === 0) return "";

  const first = segments[0]!.p1;
  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  for (const seg of segments) {
    d += ` C ${seg.cp1.x.toFixed(2)} ${seg.cp1.y.toFixed(2)}, ${seg.cp2.x.toFixed(2)} ${seg.cp2.y.toFixed(2)}, ${seg.p2.x.toFixed(2)} ${seg.p2.y.toFixed(2)}`;
  }
  return d;
}

export function sampleCubicBezierY(seg: CubicBezierSegment, t: number): number {
  const u = 1 - t;
  return (
    u * u * u * seg.p1.y +
    3 * u * u * t * seg.cp1.y +
    3 * u * t * t * seg.cp2.y +
    t * t * t * seg.p2.y
  );
}
