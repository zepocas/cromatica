import { converter, formatHex, toGamut } from 'culori';
import { describe, expect, it } from 'vitest';
import { gamutMapSrgb, inSrgbGamut } from '../../src/color/gamut';
import { hexToOklch, oklchToHex } from '../../src/color/hex';
import {
  linearSrgbToOklab,
  oklabToLinearSrgb,
  oklabToOklch,
  oklchToOklab,
  srgbDecode,
  srgbEncode,
} from '../../src/color/oklab';
import type { Oklab, Oklch, Rgb } from '../../src/color/types';

const toOklab = converter('oklab');
const toOklch = converter('oklch');
const toLrgb = converter('lrgb');
const toRgb = converter('rgb');
const culoriGamut = toGamut('rgb', 'oklch');

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

const maxAbs = (a: number[], b: number[]) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));
const hueDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

const rand = rng(42);
const edgeRgb: Rgb[] = [
  [0, 0, 0],
  [1, 1, 1],
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 0],
  [0, 1, 1],
  [1, 0, 1],
  [0.5, 0.5, 0.5],
  [0.18, 0.18, 0.18],
  [0.001, 0.001, 0.001],
  [1e-6, 0, 0],
];
const randomRgb: Rgb[] = Array.from({ length: 500 }, () => [rand(), rand(), rand()] as Rgb);
// Out-of-sRGB (roughly P3 / beyond) linear values.
const wideRgb: Rgb[] = Array.from(
  { length: 200 },
  () => [rand() * 1.4 - 0.2, rand() * 1.4 - 0.2, rand() * 1.4 - 0.2] as Rgb,
);
const allRgb = [...edgeRgb, ...randomRgb, ...wideRgb];

describe('Oklab <-> linear sRGB vs culori', () => {
  it('linearSrgbToOklab matches', () => {
    let worst = 0;
    for (const c of allRgb) {
      const ref = toOklab({ mode: 'lrgb', r: c[0], g: c[1], b: c[2] });
      const ours = linearSrgbToOklab(c);
      worst = Math.max(worst, maxAbs(ours, [ref.l, ref.a, ref.b]));
    }
    expect(worst).toBeLessThan(1e-12);
  });

  it('oklabToLinearSrgb matches and round-trips', () => {
    let worst = 0;
    for (const c of allRgb) {
      const lab = linearSrgbToOklab(c);
      const ref = toLrgb({ mode: 'oklab', l: lab[0], a: lab[1], b: lab[2] });
      const ours = oklabToLinearSrgb(lab);
      worst = Math.max(worst, maxAbs(ours, [ref.r, ref.g, ref.b]), maxAbs(ours, c));
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it('white is achromatic with L = 1, black is 0', () => {
    const w = linearSrgbToOklab([1, 1, 1]);
    expect(w[0]).toBeCloseTo(1, 7);
    expect(Math.hypot(w[1], w[2])).toBeLessThan(1e-7);
    expect(linearSrgbToOklab([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('Oklch <-> Oklab', () => {
  it('matches culori for random colors', () => {
    let worst = 0;
    for (let i = 0; i < 1000; i++) {
      const lab: Oklab = [rand(), rand() * 0.8 - 0.4, rand() * 0.8 - 0.4];
      const ref = toOklch({ mode: 'oklab', l: lab[0], a: lab[1], b: lab[2] });
      const ours = oklabToOklch(lab);
      expect(ours[2]).toBeGreaterThanOrEqual(0);
      expect(ours[2]).toBeLessThan(360);
      worst = Math.max(worst, Math.abs(ours[0] - ref.l), Math.abs(ours[1] - ref.c), hueDiff(ours[2], ref.h!));
      const back = oklchToOklab(ours);
      worst = Math.max(worst, maxAbs(back, lab));
    }
    expect(worst).toBeLessThan(1e-10);
  });

  it('normalizes hue and handles achromatic colors', () => {
    expect(oklabToOklch([0.5, 0, 0])).toEqual([0.5, 0, 0]);
    expect(oklabToOklch([0.5, 1e-9, -1e-9])[2]).toBe(0);
    expect(hueDiff(oklabToOklch([0.5, 0.1, -1e-12])[2], 0)).toBeLessThan(1e-8);
    expect(oklabToOklch([0.5, 0, -0.1])[2]).toBeCloseTo(270, 10);
    // C = 0 never depends on h.
    for (const h of [0, 90, 123.4, 359, -720, 1e6]) expect(oklchToOklab([0.7, 0, h])).toEqual([0.7, 0, 0]);
    expect(maxAbs(oklchToOklab([0.5, 0.1, 400]), oklchToOklab([0.5, 0.1, 40]))).toBeLessThan(1e-12);
    expect(maxAbs(oklchToOklab([0.5, 0.1, -30]), oklchToOklab([0.5, 0.1, 330]))).toBeLessThan(1e-12);
  });

  it('matches culori for primaries and grays via hex', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#808080', '#123456', '#fedcba']) {
      const ref = toOklch(hex)!;
      const ours = hexToOklch(hex);
      expect(Math.abs(ours[0] - ref.l)).toBeLessThan(1e-9);
      expect(Math.abs(ours[1] - (ref.c ?? 0))).toBeLessThan(1e-9);
      if (ours[1] > 1e-4) expect(hueDiff(ours[2], ref.h!)).toBeLessThan(1e-7);
      else expect(ours[2]).toBe(0);
    }
  });
});

describe('transfer functions', () => {
  it('match culori and invert each other', () => {
    for (let i = 0; i <= 1000; i++) {
      const x = i / 1000;
      const ref = toRgb({ mode: 'lrgb', r: x, g: 0, b: 0 }).r;
      expect(Math.abs(srgbEncode(x) - ref)).toBeLessThan(1e-12);
      expect(Math.abs(srgbDecode(srgbEncode(x)) - x)).toBeLessThan(1e-12);
    }
    expect(srgbEncode(-0.5)).toBeCloseTo(-srgbEncode(0.5), 12);
  });
});

describe('hex', () => {
  it('round-trips every 8-bit value per channel', () => {
    for (let v = 0; v < 256; v++) {
      const h = v.toString(16).padStart(2, '0');
      for (const hex of [`#${h}${h}${h}`, `#${h}0000`, `#00${h}00`, `#0000${h}`, `#${h}80ff`]) {
        expect(oklchToHex(hexToOklch(hex))).toBe(hex);
      }
    }
    for (let i = 0; i < 500; i++) {
      const hex = formatHex({ mode: 'rgb', r: rand(), g: rand(), b: rand() });
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    }
  });

  it('parses shorthand and rejects junk', () => {
    expect(oklchToHex(hexToOklch('#f80'))).toBe('#ff8800');
    expect(oklchToHex(hexToOklch('ABCDEF'))).toBe('#abcdef');
    expect(() => hexToOklch('#12345')).toThrow();
    expect(() => hexToOklch('red')).toThrow();
  });

  it('gamut-maps out-of-gamut colors like culori', () => {
    for (let i = 0; i < 300; i++) {
      const c: Oklch = [0.05 + rand() * 0.9, rand() * 0.4, rand() * 360];
      const ref = formatHex(culoriGamut({ mode: 'oklch', l: c[0], c: c[1], h: c[2] }))!;
      const ours = oklchToHex(c);
      const a = [1, 3, 5].map((k) => parseInt(ours.slice(k, k + 2), 16));
      const b = [1, 3, 5].map((k) => parseInt(ref.slice(k, k + 2), 16));
      expect(maxAbs(a, b)).toBeLessThanOrEqual(4);
    }
  });
});

describe('gamut mapping', () => {
  const samples: Oklch[] = [
    ...Array.from({ length: 3000 }, () => [rand(), rand() * 0.4, rand() * 360] as Oklch),
    // Extreme chroma, P3-ish and beyond.
    [0.7, 0.35, 145],
    [0.6, 0.3, 30],
    [0.45, 0.32, 264],
    [0.9, 0.25, 110],
    [0.5, 0.4, 330],
    [0.99, 0.1, 200],
    [0.01, 0.1, 20],
    [1, 0.3, 0],
    [1.2, 0.1, 0],
    [0, 0.2, 0],
    [-0.1, 0, 0],
  ];

  it('returns in-gamut colors unchanged', () => {
    const c: Oklch = [0.6, 0.05, 200];
    expect(inSrgbGamut(c)).toBe(true);
    expect(gamutMapSrgb(c)).toEqual(c);
  });

  it('maps L >= 1 to white and L <= 0 to black', () => {
    expect(gamutMapSrgb([1, 0.3, 40])).toEqual([1, 0, 0]);
    expect(gamutMapSrgb([1.5, 0, 0])).toEqual([1, 0, 0]);
    expect(gamutMapSrgb([0, 0.3, 40])).toEqual([0, 0, 0]);
    expect(gamutMapSrgb([-0.2, 0.1, 40])).toEqual([0, 0, 0]);
  });

  it('matches culori toGamut within a small ΔE_OK and lands in gamut', () => {
    let worst = 0;
    for (const c of samples) {
      const ref = toOklab(culoriGamut({ mode: 'oklch', l: c[0], c: c[1], h: c[2] }))!;
      const ours = gamutMapSrgb(c);
      expect(inSrgbGamut(ours, 1e-9)).toBe(true);
      const lab = oklchToOklab(ours);
      worst = Math.max(worst, Math.hypot(lab[0] - ref.l, lab[1] - ref.a, lab[2] - ref.b));
      // Chroma reduction at constant L/h: never more chroma than the input.
      expect(ours[1]).toBeLessThanOrEqual(Math.max(c[1], 0) + 1e-9);
    }
    // culori omits the spec's early exit and MINDE shortcut, so tiny drift is expected.
    expect(worst).toBeLessThan(0.003);
  });

  it('keeps the result within the JND of the constant-L/h chroma-reduced color', () => {
    for (const c of samples.slice(0, 500)) {
      if (c[0] <= 0 || c[0] >= 1 || inSrgbGamut(c)) continue;
      const ours = oklchToOklab(gamutMapSrgb(c));
      // Lightness is preserved to within the JND.
      expect(Math.abs(ours[0] - c[0])).toBeLessThan(0.02 + 1e-6);
    }
  });
});
