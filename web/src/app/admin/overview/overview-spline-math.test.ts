import assert from "node:assert/strict";
import test from "node:test";

import type * as SplineMathMod from "./overview-spline-math";

async function loadSplineMath(): Promise<typeof SplineMathMod> {
  return (await import(
    new URL("./overview-spline-math.ts", import.meta.url).href
  )) as typeof SplineMathMod;
}

test("clamped monotone spline never dips below baselineY on 0 -> 0 -> spike -> 0 -> 0", async () => {
  const { computeClampedMonotoneSegments, sampleCubicBezierY } =
    await loadSplineMath();

  const padTop = 18;
  const baselineY = 218;
  const points = [
    { x: 44, y: 218 },
    { x: 258, y: 218 },
    { x: 472, y: 18 },
    { x: 686, y: 218 },
    { x: 900, y: 218 },
  ];

  const segments = computeClampedMonotoneSegments(points, {
    minY: padTop,
    maxY: baselineY,
  });

  assert.equal(segments.length, 4);

  for (const idx of [0, 3]) {
    const seg = segments[idx]!;
    assert.equal(seg.cp1.y, baselineY);
    assert.equal(seg.cp2.y, baselineY);
  }

  for (const seg of segments) {
    assert.ok(seg.cp1.y >= padTop && seg.cp1.y <= baselineY);
    assert.ok(seg.cp2.y >= padTop && seg.cp2.y <= baselineY);
    for (let step = 0; step <= 50; step += 1) {
      const y = sampleCubicBezierY(seg, step / 50);
      assert.ok(
        y >= padTop - 1e-9 && y <= baselineY + 1e-9,
        `expected sampled y=${y} within [${padTop}, ${baselineY}]`,
      );
    }
  }
});

test("buildClampedSplinePath handles empty, single-point, and out-of-range inputs safely", async () => {
  const { buildClampedSplinePath } = await loadSplineMath();

  assert.equal(buildClampedSplinePath([], { minY: 18, maxY: 218 }), "");
  assert.equal(
    buildClampedSplinePath([{ x: 100, y: 260 }], { minY: 18, maxY: 218 }),
    "M 100.00 218.00",
  );
  const path = buildClampedSplinePath(
    [
      { x: 10, y: 250 },
      { x: 50, y: 5 },
    ],
    { minY: 18, maxY: 218 },
  );
  assert.match(path, /^M 10\.00 218\.00 C /);
  assert.match(path, /50\.00 18\.00$/);
});
