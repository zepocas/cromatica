import { describe, expect, it } from 'vitest';
import {
  gamutMapToLinearSrgb,
  hexToOklch,
  inSrgbGamut,
  linearSrgbToOklab,
  oklabToOklch,
  oklchToOklab,
} from '../../src/color/oklab';
import { bakeRamp, evaluateRamp } from '../../src/color/ramp';
import { RAMP_SIZE, type Oklab, type Oklch } from '../../src/color/types';
import type { BlendMode, ColorStop } from '../../src/design/design';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const MODES: BlendMode[] = ['oklab', 'oklab-chroma', 'oklch-short', 'oklch-long'];
const maxAbs = (a: number[], b: number[]) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));
const hueDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const stop = (position: number, color: Oklch, blend: BlendMode = 'oklab'): ColorStop => ({ position, color, blend });

const BLUE = hexToOklch('#0000ff');
const YELLOW = hexToOklch('#ffff00');
const RED = hexToOklch('#ff0000');
const GRAY = hexToOklch('#808080');

function randomStops(rand: () => number, n: number, modes: BlendMode[] = MODES): ColorStop[] {
  const pos = Array.from({ length: n }, (_, i) => (i === 0 ? 0 : i === n - 1 ? 1 : rand())).sort((a, b) => a - b);
  return pos.map((p) =>
    stop(p, [0.1 + rand() * 0.85, rand() * 0.3, rand() * 360], modes[Math.floor(rand() * modes.length)]),
  );
}

describe('evaluateRamp basics', () => {
  it('hits every stop color exactly at its position', () => {
    const rand = rng(1);
    for (let k = 0; k < 50; k++) {
      const stops = randomStops(rand, 2 + (k % 7));
      for (const s of stops) {
        expect(maxAbs(evaluateRamp(stops, s.position), oklchToOklab(s.color))).toBeLessThan(1e-12);
      }
    }
  });

  it('holds end colors outside the stop range and clamps t', () => {
    const stops = [stop(0.2, RED), stop(0.8, BLUE)];
    const red = oklchToOklab(RED);
    const blue = oklchToOklab(BLUE);
    for (const t of [-1, 0, 0.1, 0.2]) expect(evaluateRamp(stops, t)).toEqual(red);
    for (const t of [0.8, 0.9, 1, 2]) expect(evaluateRamp(stops, t)).toEqual(blue);
    // Eases into the hold: no slope kink at the end stops.
    const h = 1e-5;
    for (const p of [0.2, 0.8]) {
      const inner = p === 0.2 ? p + h : p - h;
      expect(maxAbs(evaluateRamp(stops, inner), evaluateRamp(stops, p)) / h).toBeLessThan(1e-3);
    }
  });

  it('is linear for two stops spanning [0, 1] in oklab', () => {
    const stops = [stop(0, RED), stop(1, BLUE)];
    const a = oklchToOklab(RED);
    const b = oklchToOklab(BLUE);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      expect(maxAbs(evaluateRamp(stops, t), a.map((x, k) => x + (b[k] - x) * t))).toBeLessThan(1e-12);
    }
  });

  it('makes a hard edge at equal positions (color after the edge wins)', () => {
    const stops = [stop(0, RED), stop(0.5, GRAY), stop(0.5, BLUE), stop(1, YELLOW)];
    expect(maxAbs(evaluateRamp(stops, 0.5 - 1e-9), oklchToOklab(GRAY))).toBeLessThan(1e-7);
    expect(maxAbs(evaluateRamp(stops, 0.5), oklchToOklab(BLUE))).toBeLessThan(1e-12);
    expect(maxAbs(evaluateRamp(stops, 0.5 + 1e-9), oklchToOklab(BLUE))).toBeLessThan(1e-7);
    // A stop hidden between two coincident ones never shows.
    const triple = [stop(0, RED), stop(0.5, GRAY), stop(0.5, YELLOW), stop(0.5, BLUE), stop(1, RED)];
    expect(maxAbs(evaluateRamp(triple, 0.5), oklchToOklab(BLUE))).toBeLessThan(1e-12);
    // Edge at the ends.
    const ends = [stop(0, RED), stop(0, BLUE), stop(1, YELLOW), stop(1, GRAY)];
    expect(evaluateRamp(ends, 0)).toEqual(oklchToOklab(BLUE));
    expect(maxAbs(evaluateRamp(ends, 1 - 1e-9), oklchToOklab(YELLOW))).toBeLessThan(1e-7);
  });

  it('handles a single stop as a constant and sorts unsorted input', () => {
    for (const t of [0, 0.3, 1]) expect(evaluateRamp([stop(0.4, RED)], t)).toEqual(oklchToOklab(RED));
    const sorted = [stop(0, RED), stop(0.3, GRAY), stop(1, BLUE)];
    const shuffled = [sorted[2], sorted[0], sorted[1]];
    expect(evaluateRamp(shuffled, 0.2)).toEqual(evaluateRamp(sorted, 0.2));
  });
});

describe('monotone spline', () => {
  it('never overshoots stop values per channel in the segment space', () => {
    const rand = rng(7);
    for (let k = 0; k < 200; k++) {
      const stops = randomStops(rand, 3 + (k % 6));
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i];
        const b = stops[i + 1];
        const len = b.position - a.position;
        if (len <= 0) continue;
        const lch = a.blend !== 'oklab';
        const va = lch ? oklabToOklch(oklchToOklab(a.color)) : oklchToOklab(a.color);
        const vb = lch ? oklabToOklch(oklchToOklab(b.color)) : oklchToOklab(b.color);
        const channels = lch ? [0, 1] : [0, 1, 2];
        for (let j = 0; j <= 64; j++) {
          const lab = evaluateRamp(stops, a.position + (len * j) / 64);
          const v = lch ? oklabToOklch(lab) : lab;
          for (const c of channels) {
            expect(v[c]).toBeGreaterThanOrEqual(Math.min(va[c], vb[c]) - 1e-9);
            expect(v[c]).toBeLessThanOrEqual(Math.max(va[c], vb[c]) + 1e-9);
          }
        }
      }
    }
  });

  it('keeps hue monotone within oklch segments', () => {
    const stops = [stop(0, [0.6, 0.15, 10], 'oklch-short'), stop(0.3, [0.6, 0.15, 100], 'oklch-long'), stop(1, [0.6, 0.15, 90])];
    let prev = 10;
    let travelled = 0;
    for (let j = 1; j <= 1000; j++) {
      const h = oklabToOklch(evaluateRamp(stops, j / 1000))[2];
      const step = ((h - prev + 540) % 360) - 180;
      // 10 → 100 short (+90), then 100 → 90 the long way (+350).
      expect(step).toBeGreaterThanOrEqual(-1e-9);
      travelled += Math.abs(step);
      prev = h;
    }
    expect(travelled).toBeCloseTo(90 + 350, 3);
  });

  const slopes = (stops: ColorStop[], p: number, h = 1e-6) => {
    const f0 = evaluateRamp(stops, p);
    const left = evaluateRamp(stops, p - h).map((x, k) => (f0[k] - x) / h);
    const right = evaluateRamp(stops, p + h).map((x, k) => (x - f0[k]) / h);
    return { left, right };
  };

  it('is C1 at interior stops (Oklab derivative), for same and mixed modes', () => {
    const rand = rng(11);
    const cases: BlendMode[][] = [...MODES.map((m) => [m, m]), ['oklab', 'oklch-short'], ['oklch-short', 'oklab'], ['oklab-chroma', 'oklch-long'], ['oklab', 'oklab-chroma']];
    for (const [m0, m1] of cases) {
      for (let k = 0; k < 100; k++) {
        const col = (): Oklch => [0.2 + rand() * 0.7, 0.005 + rand() * 0.3, rand() * 360];
        const stops = [stop(0, col(), m0), stop(0.3 + rand() * 0.4, col(), m1), stop(1, col())];
        const { left, right } = slopes(stops, stops[1].position);
        const scale = Math.max(1, ...left.map(Math.abs));
        expect(maxAbs(left, right) / scale, `${m0}/${m1}`).toBeLessThan(2e-3);
      }
    }
  });

  it('removes the kink a piecewise-linear blend would have', () => {
    const stops = [stop(0, [0.2, 0, 0]), stop(0.2, [0.8, 0, 0]), stop(1, [0.9, 0, 0])];
    const { left, right } = slopes(stops, 0.2);
    // Linear secants would be 3 and 0.125.
    expect(Math.abs(left[0] - right[0])).toBeLessThan(1e-3);
    expect(left[0]).toBeGreaterThan(0);
  });
});

describe('blend modes', () => {
  const mid = (mode: BlendMode, a = BLUE, b = YELLOW) => oklabToOklch(evaluateRamp([stop(0, a, mode), stop(1, b)], 0.5));
  const minC = Math.min(BLUE[1], YELLOW[1]);

  it('oklab dips toward gray between blue and yellow', () => {
    expect(mid('oklab')[1]).toBeLessThan(minC * 0.5);
  });

  it('oklab-chroma keeps chroma and takes the short arc', () => {
    const m = mid('oklab-chroma');
    expect(m[1]).toBeGreaterThanOrEqual(minC * 0.9);
    const shortMid = BLUE[2] + (((YELLOW[2] - BLUE[2] + 540) % 360) - 180) / 2;
    expect(hueDiff(m[2], shortMid)).toBeLessThan(30);
    // Chroma along the whole segment never drops below the ends.
    for (let j = 0; j <= 100; j++) {
      const c = oklabToOklch(evaluateRamp([stop(0, BLUE, 'oklab-chroma'), stop(1, YELLOW)], j / 100))[1];
      expect(c).toBeGreaterThanOrEqual(minC - 1e-9);
    }
  });

  it('oklch-short and oklch-long go opposite ways around the hue circle', () => {
    const d = ((YELLOW[2] - BLUE[2] + 540) % 360) - 180;
    const short = mid('oklch-short');
    const long = mid('oklch-long');
    expect(hueDiff(short[2], BLUE[2] + d / 2)).toBeLessThan(1e-6);
    expect(hueDiff(long[2], BLUE[2] + (d > 0 ? d - 360 : d + 360) / 2)).toBeLessThan(1e-6);
    expect(hueDiff(short[2], long[2])).toBeCloseTo(180, 6);
    expect(short[1]).toBeCloseTo((BLUE[1] + YELLOW[1]) / 2, 10);
  });

  it('handles hue wrap across 0/360', () => {
    const a: Oklch = [0.6, 0.15, 350];
    const b: Oklch = [0.6, 0.15, 20];
    expect(hueDiff(mid('oklch-short', a, b)[2], 5)).toBeLessThan(1e-6);
    expect(hueDiff(mid('oklch-long', a, b)[2], 185)).toBeLessThan(1e-6);
    expect(hueDiff(mid('oklab-chroma', a, b)[2], 5)).toBeLessThan(1e-6);
  });

  it('oklab-chroma equals oklab when one end is gray, and is continuous as chroma vanishes', () => {
    const gray: Oklch = [0.5, 0, 0];
    const nearGray: Oklch = [0.5, 1e-6, 180];
    for (let j = 0; j <= 20; j++) {
      const t = j / 20;
      const lab = evaluateRamp([stop(0, RED, 'oklab'), stop(1, gray)], t);
      expect(maxAbs(evaluateRamp([stop(0, RED, 'oklab-chroma'), stop(1, gray)], t), lab)).toBeLessThan(1e-12);
      expect(maxAbs(evaluateRamp([stop(0, gray, 'oklab-chroma'), stop(1, RED)], 1 - t), lab)).toBeLessThan(1e-12);
      expect(maxAbs(evaluateRamp([stop(0, RED, 'oklab-chroma'), stop(1, nearGray)], t), lab)).toBeLessThan(1e-5);
    }
    // Hue modes also ignore a gray end's arbitrary hue.
    for (const m of ['oklch-short', 'oklch-long'] as const) {
      const c = oklabToOklch(evaluateRamp([stop(0, RED, m), stop(1, [0.5, 0, 200])], 0.5));
      expect(hueDiff(c[2], RED[2])).toBeLessThan(1e-9);
    }
  });

  it('oklab-chroma rotation concentrates near a low-chroma end', () => {
    const lowC: Oklch = [0.6, 0.02, 200];
    const hi: Oklch = [0.6, 0.2, 100];
    const q = oklabToOklch(evaluateRamp([stop(0, lowC, 'oklab-chroma'), stop(1, hi)], 0.25));
    const u = oklabToOklch(evaluateRamp([stop(0, lowC, 'oklch-short'), stop(1, hi)], 0.25));
    expect(hueDiff(q[2], 100)).toBeLessThan(hueDiff(u[2], 100));
  });
});

describe('bakeRamp', () => {
  const rand = rng(3);
  const wide: ColorStop[] = [
    stop(0, [0.25, 0.12, 280], 'oklab-chroma'),
    stop(0.15, [0.7, 0.35, 145], 'oklch-short'),
    stop(0.3, [0.6, 0.3, 30], 'oklch-long'),
    stop(0.45, [0.45, 0.32, 264], 'oklab'),
    stop(0.6, [0.9, 0.25, 110], 'oklab'),
    stop(0.7, [0.5, 0.0, 0], 'oklab-chroma'),
    stop(0.85, [0.98, 0.1, 200], 'oklch-short'),
    stop(1, [0.05, 0.1, 20]),
  ];

  it('outputs RAMP_SIZE linear, gamut-mapped RGBA entries in [0, 1]', () => {
    const ramp = bakeRamp(wide);
    expect(ramp).toBeInstanceOf(Float32Array);
    expect(ramp.length).toBe(RAMP_SIZE * 4);
    for (let i = 0; i < RAMP_SIZE; i++) {
      for (let k = 0; k < 3; k++) {
        expect(ramp[i * 4 + k]).toBeGreaterThanOrEqual(0);
        expect(ramp[i * 4 + k]).toBeLessThanOrEqual(1);
      }
      expect(ramp[i * 4 + 3]).toBe(1);
      const lab: Oklab = evaluateRamp(wide, i / (RAMP_SIZE - 1));
      const expected = gamutMapToLinearSrgb(oklabToOklch(lab));
      expect(maxAbs([ramp[i * 4], ramp[i * 4 + 1], ramp[i * 4 + 2]], expected)).toBeLessThan(1e-6);
    }
  });

  it('keeps in-gamut entries exact and honours size', () => {
    const stops = [stop(0, hexToOklch('#203040')), stop(1, hexToOklch('#e0c0a0'))];
    const ramp = bakeRamp(stops, 5);
    expect(ramp.length).toBe(20);
    for (let i = 0; i < 5; i++) {
      const lab = linearSrgbToOklab([ramp[i * 4], ramp[i * 4 + 1], ramp[i * 4 + 2]]);
      expect(inSrgbGamut(oklabToOklch(lab), 1e-6)).toBe(true);
      expect(maxAbs(lab, evaluateRamp(stops, i / 4))).toBeLessThan(1e-6);
    }
  });

  it('bakes 4096 entries with 8 stops quickly', () => {
    const sets = [wide, ...Array.from({ length: 4 }, () => randomStops(rand, 8))];
    for (const s of sets) bakeRamp(s);
    const runs: number[] = [];
    for (let r = 0; r < 10; r++) {
      const s = sets[r % sets.length];
      const t0 = performance.now();
      bakeRamp(s);
      runs.push(performance.now() - t0);
    }
    runs.sort((a, b) => a - b);
    const median = runs[runs.length >> 1];
    console.info(`bakeRamp median ${median.toFixed(2)} ms, max ${runs[runs.length - 1].toFixed(2)} ms`);
    expect(median).toBeLessThan(20);
  });
});
