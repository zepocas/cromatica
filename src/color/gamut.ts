// The sRGB gamut: membership, distances, CSS Color 4 gamut mapping, and the
// chroma limits the palette code plans against.
import { clamp01, normalizeDegrees } from '../math';
import { linearSrgbToOklab, oklabToLinearSrgb, oklabToOklch, oklchToOklab } from './oklab';
import type { Oklab, Oklch, Rgb } from './types';

/** Default tolerance of the sRGB gamut test, in linear units. */
const GAMUT_EPS = 1e-6;
/** Just-noticeable difference in ΔE_OK, as CSS Color 4 gamut mapping uses it. */
export const JND = 0.02;
const MAP_EPSILON = 0.0001;
/** Bisection steps of maxChroma, over C in [0, MAX_SEARCH_CHROMA]. */
const MAX_CHROMA_STEPS = 24;
const MAX_SEARCH_CHROMA = 0.4;

export function rgbInGamut(rgb: Rgb, eps = GAMUT_EPS): boolean {
  const lo = -eps;
  const hi = 1 + eps;
  return rgb[0] >= lo && rgb[0] <= hi && rgb[1] >= lo && rgb[1] <= hi && rgb[2] >= lo && rgb[2] <= hi;
}

export function inSrgbGamut(c: Oklch, eps = GAMUT_EPS): boolean {
  return rgbInGamut(oklabToLinearSrgb(oklchToOklab(c)), eps);
}

/** Each channel clipped to [0, 1]. */
export function clipRgb(rgb: Rgb): Rgb {
  return [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];
}

/** ΔE_OK: Euclidean distance in Oklab. */
export function oklabDistance(a: Oklab, b: Oklab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** ΔE_OK between two Oklch colors. */
export function oklchDistance(a: Oklch, b: Oklch): number {
  return oklabDistance(oklchToOklab(a), oklchToOklab(b));
}

/**
 * CSS Color 4 "binary search gamut mapping with local MINDE" into sRGB:
 * chroma reduction at constant L and hue, accepting a channel clip within JND.
 * Returns LINEAR sRGB, always within [0, 1].
 */
export function gamutMapToLinearSrgb(c: Oklch): Rgb {
  const [l, ch, h] = c;
  if (l >= 1) return [1, 1, 1];
  if (l <= 0) return [0, 0, 0];
  const origin = oklabToLinearSrgb(oklchToOklab(c));
  if (rgbInGamut(origin)) return clipRgb(origin);

  let clipped = clipRgb(origin);
  if (oklabDistance(linearSrgbToOklab(clipped), oklchToOklab(c)) < JND) return clipped;

  let min = 0;
  let max = ch;
  let minInGamut = true;
  while (max - min > MAP_EPSILON) {
    const chroma = (min + max) / 2;
    const current = oklchToOklab([l, chroma, h]);
    const rgb = oklabToLinearSrgb(current);
    if (minInGamut && rgbInGamut(rgb)) {
      min = chroma;
      continue;
    }
    clipped = clipRgb(rgb);
    const e = oklabDistance(linearSrgbToOklab(clipped), current);
    if (e < JND) {
      if (JND - e < MAP_EPSILON) return clipped;
      minInGamut = false;
      min = chroma;
    } else {
      max = chroma;
    }
  }
  return clipped;
}

/** The same mapping, as Oklch. */
export function gamutMapSrgb(c: Oklch): Oklch {
  if (c[0] >= 1) return [1, 0, 0];
  if (c[0] <= 0) return [0, 0, 0];
  if (inSrgbGamut(c)) return [c[0], c[1], c[2]];
  return oklabToOklch(linearSrgbToOklab(gamutMapToLinearSrgb(c)));
}

/** Largest chroma at (L, h) that is still inside sRGB, by bisection. */
export function maxChroma(l: number, h: number): number {
  if (l <= 0 || l >= 1) return 0;
  let lo = 0;
  let hi = MAX_SEARCH_CHROMA;
  for (let i = 0; i < MAX_CHROMA_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (inSrgbGamut([l, mid, h])) lo = mid;
    else hi = mid;
  }
  return lo;
}

const cuspCache = new Map<number, number>();

/** Lightness of the gamut cusp (the most chroma) for a hue, at 1° resolution. */
export function cuspLightness(h: number): number {
  const key = Math.round(normalizeDegrees(h)) % 360;
  let l = cuspCache.get(key);
  if (l === undefined) {
    let best = 0;
    l = 0.5;
    for (let x = 0.3; x <= 0.99; x += 0.01) {
      const c = maxChroma(x, key);
      if (c > best) {
        best = c;
        l = x;
      }
    }
    cuspCache.set(key, l);
  }
  return l;
}
