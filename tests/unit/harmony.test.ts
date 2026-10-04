import { describe, expect, it } from 'vitest';
import { inSrgbGamut, maxChroma, oklchDistance } from '../../src/color/gamut';
import {
  generatePalette,
  HARMONY_RULES,
  KEY_BANDS,
  MIN_L_SPAN,
  minLSpan,
  minPaletteDeltaE,
  MOOD_TUNING,
} from '../../src/color/harmony';
import type { Oklch } from '../../src/color/types';
import { createRng } from '../../src/design/random';

/** Just the colors of a generated palette. */
const paletteColors = (...args: Parameters<typeof generatePalette>) => generatePalette(...args).colors;

const relChroma = (c: Oklch) => {
  const m = maxChroma(c[0], c[2]);
  return m > 1e-4 ? c[1] / m : 0;
};

describe('maxChroma', () => {
  it('finds the gamut boundary', () => {
    for (const [l, h] of [
      [0.5, 30],
      [0.7, 140],
      [0.4, 265],
      [0.9, 100],
    ]) {
      const m = maxChroma(l, h);
      expect(inSrgbGamut([l, m, h])).toBe(true);
      expect(inSrgbGamut([l, m + 1e-3, h])).toBe(false);
    }
    expect(maxChroma(0, 0)).toBe(0);
    expect(maxChroma(1, 0)).toBe(0);
  });
});

describe('generatePalette', () => {
  const cases = HARMONY_RULES.flatMap((rule) =>
    (['natural', 'vivid', 'any'] as const).flatMap((mood) =>
      [2, 3, 4, 5, 6, 8].map((count) => ({ rule, mood, count })),
    ),
  );

  it('meets gamut, ΔE spacing and lightness spread for every rule/mood/count', () => {
    for (const { rule, mood, count } of cases) {
      for (let seed = 0; seed < 12; seed++) {
        const pal = paletteColors(createRng(seed * 7919 + count), count, { rule, mood });
        expect(pal).toHaveLength(count);
        for (const c of pal) {
          expect(inSrgbGamut(c)).toBe(true);
          expect(c[2]).toBeGreaterThanOrEqual(0);
          expect(c[2]).toBeLessThan(360);
        }
        const min = minPaletteDeltaE(count);
        for (let i = 0; i < count; i++) {
          for (let j = i + 1; j < count; j++) expect(oklchDistance(pal[i], pal[j])).toBeGreaterThanOrEqual(min);
        }
        const ls = pal.map((c) => c[0]);
        const span = Math.max(...ls) - Math.min(...ls);
        if (count >= 3 && rule !== 'monochrome') expect(span).toBeGreaterThanOrEqual(MIN_L_SPAN);
        if (count >= 3 && rule === 'monochrome') expect(span).toBeGreaterThanOrEqual(0.4);
      }
    }
  });

  it('is deterministic for an rng state', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(paletteColors(createRng(seed), 5)).toEqual(paletteColors(createRng(seed), 5));
    }
  });

  it('covers the rules when none is requested', () => {
    // Hue structure is hidden, so just check variety: different seeds give different palettes.
    const keys = new Set(Array.from({ length: 50 }, (_, s) => JSON.stringify(paletteColors(createRng(s), 4))));
    expect(keys.size).toBe(50);
  });

  it('keeps natural chroma low/medium and vivid chroma high', () => {
    const nat = MOOD_TUNING.natural;
    const viv = MOOD_TUNING.vivid;
    const natRel: number[] = [];
    const vivRel: number[] = [];
    for (let seed = 0; seed < 200; seed++) {
      for (const c of paletteColors(createRng(seed), 5, { mood: 'natural' })) {
        expect(c[1]).toBeLessThanOrEqual(nat.maxChroma);
        if (c[1] < 0.045) continue; // near-neutral anchor: tiny absolute chroma, relative is meaningless
        expect(relChroma(c)).toBeLessThanOrEqual(nat.accent[1][1] + 0.01);
        natRel.push(relChroma(c));
      }
      const vivid = paletteColors(createRng(seed), 5, { mood: 'vivid' });
      // Near-neutral anchors (deep near-black) are allowed in vivid palettes;
      // supporting colors step back, but at least one color stays vivid.
      const chromatic = vivid.filter((c) => c[1] > 0.045);
      for (const c of chromatic) expect(relChroma(c)).toBeGreaterThanOrEqual(viv.support![0] - 0.01);
      expect(chromatic.filter((c) => relChroma(c) >= viv.rel[0] - 0.01).length).toBeGreaterThanOrEqual(1);
      vivRel.push(...vivid.map(relChroma));
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    expect(median(natRel)).toBeLessThan(0.45);
    expect(median(vivRel)).toBeGreaterThan(0.55);
  });

  it('vivid multi-hue palettes keep one lead hue and a single vivid accent', () => {
    const viv = MOOD_TUNING.vivid;
    const near = (h: number, base: number) => Math.abs(((h - base + 540) % 360) - 180) <= 15;
    for (let seed = 0; seed < 100; seed++) {
      for (const rule of ['triadic', 'tetradic', 'split-complementary'] as const) {
        const pal = paletteColors(createRng(seed), 6, { mood: 'vivid', rule, baseHue: 250 });
        const loudOthers = pal.filter((c) => c[1] > 0.045 && !near(c[2], 250) && relChroma(c) > viv.support![1] + 0.01);
        expect(loudOthers.length, `${rule} seed ${seed}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('caps acid yellow-greens', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const c of paletteColors(createRng(seed), 5, { mood: 'vivid', baseHue: 120 })) {
        if (c[1] > 0.045 && c[2] >= 100 && c[2] <= 140) expect(relChroma(c)).toBeLessThanOrEqual(0.56);
      }
    }
  });

  it('builds the rule around a given base hue and reports rule and mood', () => {
    for (let seed = 0; seed < 50; seed++) {
      const h = generatePalette(createRng(seed), 4, { rule: 'complementary', mood: 'natural', baseHue: 30 });
      expect(h.rule).toBe('complementary');
      expect(h.mood).toBe('natural');
      // Every chromatic color sits near 30° or its complement 210° (±8° jitter, ±15° nudges).
      for (const c of h.colors.filter((c) => c[1] > 0.045)) {
        const d = Math.min(Math.abs(((c[2] - 30 + 540) % 360) - 180), Math.abs(((c[2] - 210 + 540) % 360) - 180));
        expect(d).toBeLessThanOrEqual(24);
      }
      const auto = generatePalette(createRng(seed), 4);
      expect(HARMONY_RULES).toContain(auto.rule);
      expect(['natural', 'vivid']).toContain(auto.mood);
    }
  });

  it('includes near-neutral anchors in some natural palettes', () => {
    let anchors = 0;
    for (let seed = 0; seed < 100; seed++) {
      const pal = paletteColors(createRng(seed), 4, { mood: 'natural' });
      if (pal.some((c) => c[1] < 0.04 && (c[0] > 0.9 || c[0] < 0.3))) anchors++;
    }
    expect(anchors).toBeGreaterThan(20);
    expect(anchors).toBeLessThan(80);
  });

  it('mood any leans natural', () => {
    let natural = 0;
    for (let seed = 0; seed < 300; seed++) {
      const pal = paletteColors(createRng(seed), 4);
      if (pal.every((c) => c[1] <= MOOD_TUNING.natural.maxChroma + 1e-9 && relChroma(c) < 0.73)) natural++;
    }
    expect(natural / 300).toBeGreaterThan(0.5);
    expect(natural / 300).toBeLessThan(0.85);
  });

  it('handles 1 and 16 colors', () => {
    expect(paletteColors(createRng(1), 1)).toHaveLength(1);
    const pal = paletteColors(createRng(1), 16);
    expect(pal).toHaveLength(16);
    for (const c of pal) expect(inSrgbGamut(c)).toBe(true);
  });
});

describe('value key', () => {
  const meanL = (pal: Oklch[]) => pal.reduce((s, c) => s + c[0], 0) / pal.length;

  it('high and low keep spacing, gamut and their own spread for up to 5 colors', () => {
    for (const key of ['high', 'low'] as const) {
      const [lo, hi] = KEY_BANDS[key];
      for (const rule of HARMONY_RULES) {
        for (const mood of ['natural', 'vivid'] as const) {
          for (const count of [2, 3, 4, 5]) {
            for (let seed = 0; seed < 8; seed++) {
              const pal = paletteColors(createRng(seed * 104729 + count), count, { rule, mood, key });
              const min = minPaletteDeltaE(count);
              for (let i = 0; i < count; i++) {
                expect(inSrgbGamut(pal[i])).toBe(true);
                // Spacing nudges may step just outside the band.
                expect(pal[i][0]).toBeGreaterThanOrEqual(lo - 0.06);
                expect(pal[i][0]).toBeLessThanOrEqual(hi + 0.02);
                for (let j = i + 1; j < count; j++) expect(oklchDistance(pal[i], pal[j])).toBeGreaterThanOrEqual(min);
              }
              const ls = pal.map((c) => c[0]);
              if (count >= 3 && rule !== 'monochrome') {
                expect(Math.max(...ls) - Math.min(...ls)).toBeGreaterThanOrEqual(minLSpan(key));
              }
            }
          }
        }
      }
    }
  });

  it('high is light and soft, low is dark', () => {
    for (let seed = 0; seed < 40; seed++) {
      const full = paletteColors(createRng(seed), 5, { key: 'full' });
      const high = paletteColors(createRng(seed), 5, { key: 'high', mood: 'vivid' });
      const low = paletteColors(createRng(seed), 5, { key: 'low' });
      expect(meanL(high)).toBeGreaterThan(meanL(full));
      expect(meanL(low)).toBeLessThan(meanL(full));
      for (const c of high) expect(c[1]).toBeLessThanOrEqual(0.13 + 1e-9);
    }
  });

  it('defaults to full, with the same sequence as before keys existed', () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(paletteColors(createRng(seed), 5)).toEqual(paletteColors(createRng(seed), 5, { key: 'full' }));
      expect(generatePalette(createRng(seed), 5).key).toBe('full');
    }
  });

  it('key any reports what it picked and leans full', () => {
    const seen = { high: 0, full: 0, low: 0 };
    for (let seed = 0; seed < 300; seed++) seen[generatePalette(createRng(seed), 4, { key: 'any' }).key]++;
    expect(seen.full / 300).toBeGreaterThan(0.55);
    expect(seen.high).toBeGreaterThan(15);
    expect(seen.low).toBeGreaterThan(15);
  });
});
