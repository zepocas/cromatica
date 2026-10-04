import { describe, expect, it } from 'vitest';
import { WARP_SHAPES, defaultWarp, noWarp, type Warp, type WarpShape } from '../../src/design/design';
import { pcg3d } from '../../src/engine/noise';
import { createWarp, prepareWarp, warpPoint } from '../../src/engine/warp';

const SHAPES = WARP_SHAPES.filter((s) => s !== 'none');
const STEPPED: readonly WarpShape[] = ['rows', 'columns', 'voronoi'];
const warp = (shape: WarpShape, amount = 0.5, size = 0.5, seed = 7): Warp => ({ shape, amount, size, seed });

// Deterministic sample points over a 16:9 frame and a margin around it.
const samples: [number, number][] = Array.from({ length: 400 }, (_, i) => [
  ((i * 0.618034) % 1) * 2.4 - 1.2,
  ((i * 0.381966 + 0.1) % 1) * 1.4 - 0.7,
]);

describe('pcg3d', () => {
  it('is a uint32 hash that differs in every lane for neighbouring inputs', () => {
    const a = pcg3d(1, 2, 3);
    const b = pcg3d(1, 2, 4);
    for (const v of [...a, ...b]) expect(Number.isInteger(v) && v >= 0 && v < 2 ** 32).toBe(true);
    for (let k = 0; k < 3; k++) expect(a[k]).not.toBe(b[k]);
    expect(pcg3d(-1 >>> 0, 0, 0)).toEqual(pcg3d(0xffffffff, 0, 0));
  });
});

describe('warpPoint', () => {
  it("'none' and amount 0 are the exact identity", () => {
    for (const [x, y] of samples) {
      expect(warpPoint(noWarp, x, y)).toEqual([x, y]);
      for (const shape of SHAPES) expect(warpPoint(warp(shape, 0), x, y)).toEqual([x, y]);
    }
    expect(prepareWarp(warp('domain', 0)).shape).toBe('none');
  });

  for (const shape of SHAPES) {
    describe(shape, () => {
      it('is deterministic, seeded, and moves points', () => {
        const a = createWarp(warp(shape, 0.5, 0.5, 1));
        const a2 = createWarp(warp(shape, 0.5, 0.5, 1));
        const b = createWarp(warp(shape, 0.5, 0.5, 2));
        let seedDiff = 0;
        let moved = 0;
        for (const [x, y] of samples) {
          const p = a(x, y);
          expect(a2(x, y)).toEqual(p);
          const q = b(x, y);
          seedDiff = Math.max(seedDiff, Math.hypot(p[0] - q[0], p[1] - q[1]));
          moved = Math.max(moved, Math.hypot(p[0] - x, p[1] - y));
        }
        expect(seedDiff).toBeGreaterThan(1e-3);
        expect(moved).toBeGreaterThan(1e-3);
      });

      it('is finite and bounded everywhere, including far outside the frame', () => {
        for (const amount of [0.01, 0.3, 1]) {
          for (const size of [0, 0.35, 1]) {
            const w = createWarp({ shape, amount, size, seed: 0xffffffff });
            for (const [x, y] of [...samples, [1e6, -1e6], [-1e12, 3], [64, 64], [0, 0]] as [number, number][]) {
              const [u, v] = w(x, y);
              expect(Number.isFinite(u) && Number.isFinite(v)).toBe(true);
              expect(Math.abs(u)).toBeLessThan(100);
              expect(Math.abs(v)).toBeLessThan(100);
            }
          }
        }
      });

      if (STEPPED.includes(shape)) {
        it('steps are bounded by the displacement amplitude', () => {
          const p = prepareWarp(warp(shape, 0.8, 0.6));
          const w = createWarp(warp(shape, 0.8, 0.6));
          const h = 1e-4;
          let maxJump = 0;
          for (const [x, y] of samples) {
            const a = w(x, y);
            const b = w(x + h, y + h);
            maxJump = Math.max(maxJump, Math.hypot(b[0] - a[0], b[1] - a[1]));
          }
          // Offsets are in ±amp per axis, so any jump is at most the diagonal of that box.
          expect(maxJump).toBeLessThanOrEqual(2 * Math.SQRT2 * p.amp + 2 * h);
        });
      } else {
        it('is continuous (locally Lipschitz)', () => {
          for (const amount of [0.3, 1]) {
            const w = createWarp(warp(shape, amount, 0.6));
            const h = 1e-6;
            let maxRatio = 0;
            for (const [x, y] of samples) {
              const a = w(x, y);
              const b = w(x + h, y);
              const c = w(x, y + h);
              maxRatio = Math.max(
                maxRatio,
                Math.hypot(b[0] - a[0], b[1] - a[1]) / h,
                Math.hypot(c[0] - a[0], c[1] - a[1]) / h,
              );
            }
            expect(maxRatio).toBeLessThan(500);
          }
        });
      }
    });
  }

  it('the default warp displaces tastefully (well under a tenth of the frame on average)', () => {
    const w = createWarp(defaultWarp);
    let sum = 0;
    for (const [x, y] of samples) {
      const p = w(x, y);
      sum += Math.hypot(p[0] - x, p[1] - y);
    }
    const mean = sum / samples.length;
    expect(mean).toBeGreaterThan(0.005);
    expect(mean).toBeLessThan(0.1);
  });
});
