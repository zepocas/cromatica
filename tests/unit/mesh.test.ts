import { describe, expect, it } from 'vitest';
import { createMeshEvaluator, evaluateMesh, meshGamutClip, meshWeights } from '../../src/color/mesh';
import { gamutMapSrgb, gamutMapToLinearSrgb, linearSrgbToOklab, oklabToOklch, oklchToOklab } from '../../src/color/oklab';
import type { Oklab } from '../../src/color/types';
import { defaultMesh, type MeshPoint, type Oklch, type PointMesh } from '../../src/design/design';

type PointSpec = [x: number, y: number, color: Oklch, radius: number];

const mesh = (sharpness: number, points: PointSpec[]): PointMesh => ({
  kind: 'mesh',
  sharpness,
  points: points.map(([x, y, color, radius]): MeshPoint => ({ x, y, color, radius })),
});

const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
const labOf = (c: Oklch): Oklab => oklchToOklab(gamutMapSrgb(c));

const primaries = mesh(0.2, [
  [-0.6, 0.25, [0.628, 0.2577, 29.23], 0.35],
  [0.0, 0.3, [0.8664, 0.2948, 142.5], 0.35],
  [0.6, 0.25, [0.452, 0.3132, 264.05], 0.35],
  [-0.4, -0.3, [0.9054, 0.1546, 194.77], 0.3],
  [0.4, -0.3, [0.7017, 0.3225, 328.36], 0.3],
]);

describe('evaluateMesh', () => {
  it('a single point is its (gamut-mapped) color everywhere', () => {
    const color: Oklch = [0.6, 0.35, 140]; // outside sRGB
    const m = mesh(0.5, [[0.2, -0.1, color, 0.3]]);
    for (const [x, y] of [
      [0.2, -0.1],
      [-0.8, 0.5],
      [1e3, -1e3],
      [1e6, 1e6],
    ]) {
      expect(dist(evaluateMesh(m, x, y), labOf(color))).toBeLessThan(1e-12);
    }
  });

  it('is ≈ a point color at that point when its radius is tiny and others are far', () => {
    const m = mesh(1, [
      [0, 0, [0.7, 0.12, 30], 0.01],
      [0.8, 0.4, [0.4, 0.1, 250], 0.4],
      [-0.8, -0.4, [0.9, 0.05, 100], 0.4],
    ]);
    expect(dist(evaluateMesh(m, 0, 0), labOf([0.7, 0.12, 30]))).toBeLessThan(1e-6);
    // Default mesh: each point dominates its own position.
    for (const p of defaultMesh.points) {
      const w = meshWeights(defaultMesh, p.x, p.y);
      expect(w[defaultMesh.points.indexOf(p)]).toBe(Math.max(...w));
    }
  });

  it('weights sum to 1 and stay finite far from all points', () => {
    const tiny = mesh(1, [
      [0, 0, [0.5, 0.1, 10], 1e-6],
      [0.1, 0, [0.6, 0.1, 100], 1e-3],
      [1e6, -1e6, [0.7, 0.1, 200], 1e4],
    ]);
    for (const m of [defaultMesh, primaries, tiny, { ...defaultMesh, sharpness: 0 }, { ...defaultMesh, sharpness: 1 }]) {
      for (const d of [0, 1, 1e3, 1e6, 1e9]) {
        for (const a of [0, 1, 2, 3, 4, 5]) {
          const w = meshWeights(m, d * Math.cos(a), d * Math.sin(a));
          for (const v of w) {
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
          }
          expect(Math.abs(w.reduce((s, v) => s + v, 0) - 1)).toBeLessThan(1e-12);
          for (const v of evaluateMesh(m, d * Math.cos(a), d * Math.sin(a))) expect(Number.isFinite(v)).toBe(true);
        }
      }
    }
  });

  it('far from all points blends softly (no Voronoi seams at a distance)', () => {
    // Two equal-radius points: far away perpendicular to their axis, the
    // weights approach 1/2 instead of splitting into hard cells.
    const m = mesh(1, [
      [-0.3, 0, [0.4, 0.1, 250], 0.3],
      [0.3, 0, [0.8, 0.1, 80], 0.3],
    ]);
    const w = meshWeights(m, 0.05, 1e3);
    expect(Math.abs(w[0] - 0.5)).toBeLessThan(1e-3);
    // The slope of the weight across the bisector flattens with distance
    // from the points (a Gaussian keeps it constant: a seam of fixed width).
    const slope = (y: number) => (meshWeights(m, 1e-4, y)[0] - meshWeights(m, -1e-4, y)[0]) / 2e-4;
    expect(Math.abs(slope(0.5))).toBeLessThan(Math.abs(slope(0)));
    expect(Math.abs(slope(5))).toBeLessThan(Math.abs(slope(0.5)) / 10);
    expect(Math.abs(slope(50))).toBeLessThan(Math.abs(slope(5)) / 10);
  });

  it('is continuous along dense lines, near and far from points', () => {
    const lines: [number, number, number, number][] = [
      [-1, 0.28, 1, 0.28], // through two points
      [-1, -0.5, 1, 0.5],
      [-500, 300, 500, 310], // far away
      [1e5, -1e5, 1e5 + 50, -1e5 + 20],
    ];
    for (const m of [defaultMesh, { ...defaultMesh, sharpness: 1 }, primaries]) {
      const evaluate = createMeshEvaluator(m);
      for (const [x0, y0, x1, y1] of lines) {
        const n = 20000;
        // Bound on |Δcolor| per sample step: the kernel is smooth, so steps
        // shrink with the step length (finer than an 8-bit LSB in Oklab).
        let prev = evaluate(x0, y0);
        let maxJump = 0;
        let prevRgb = meshGamutClip(prev);
        let maxRgbJump = 0;
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const lab = evaluate(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
          maxJump = Math.max(maxJump, dist(lab, prev));
          const rgb = meshGamutClip(lab);
          maxRgbJump = Math.max(maxRgbJump, dist(rgb, prevRgb));
          prev = lab;
          prevRgb = rgb;
        }
        expect(maxJump).toBeLessThan(2e-3);
        expect(maxRgbJump).toBeLessThan(4e-3);
      }
    }
  });

  it('sharpness increases contrast between two points', () => {
    const a: Oklch = [0.4, 0.12, 260];
    const b: Oklch = [0.85, 0.12, 80];
    let prev = -1;
    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      const m = mesh(s, [
        [-0.4, 0, a, 0.3],
        [0.4, 0, b, 0.3],
      ]);
      // L difference between points 0.1 left and right of the midpoint.
      const contrast = evaluateMesh(m, 0.1, 0)[0] - evaluateMesh(m, -0.1, 0)[0];
      expect(contrast).toBeGreaterThan(prev);
      prev = contrast;
    }
    expect(prev).toBeGreaterThan(0.3);
  });

  it('radius widens a point’s reach', () => {
    const at = (r: number) =>
      meshWeights(
        mesh(0.5, [
          [-0.4, 0, [0.4, 0.1, 250], r],
          [0.4, 0, [0.8, 0.1, 80], 0.3],
        ]),
        0.1,
        0,
      )[0];
    expect(at(0.6)).toBeGreaterThan(at(0.3));
    expect(at(0.3)).toBeGreaterThan(at(0.15));
  });
});

describe('meshGamutClip', () => {
  it('passes in-gamut colors through and maps out-of-gamut blends like CSS Color 4', () => {
    const evaluate = createMeshEvaluator(primaries);
    let max = 0;
    let clipped = 0;
    for (let y = -0.5; y <= 0.5; y += 0.01) {
      for (let x = -0.9; x <= 0.9; x += 0.01) {
        const lab = evaluate(x, y);
        const ours = meshGamutClip(lab);
        for (const v of ours) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        const css = gamutMapToLinearSrgb(oklabToOklch(lab));
        if (dist(ours, css) > 0) clipped++;
        max = Math.max(max, dist(linearSrgbToOklab(ours), linearSrgbToOklab(css)));
      }
    }
    expect(clipped).toBeGreaterThan(0);
    expect(max).toBeLessThan(2e-3);
  });

  it('keeps L and hue when it reduces chroma', () => {
    const lab: Oklab = [0.5, 0.3, -0.3];
    const out = oklabToOklch(linearSrgbToOklab(meshGamutClip(lab)));
    const src = oklabToOklch(lab);
    expect(out[1]).toBeLessThan(src[1]);
    // Within the JND that CSS mapping allows for the final channel clip.
    expect(dist(linearSrgbToOklab(meshGamutClip(lab)), [0.5, ...(oklchToOklab([0.5, out[1], src[2]]).slice(1))])).toBeLessThan(0.02);
  });
});
