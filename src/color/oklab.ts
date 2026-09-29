import type { Oklab, Oklch, Rgb } from './types';

// Björn Ottosson's matrices (2021 revision), as used by CSS Color 4 and culori.

/** Chroma below which hue is powerless and reported as 0. */
export const ACHROMATIC_CHROMA = 1e-6;
/** Default tolerance of the sRGB gamut test, in linear units. */
const GAMUT_EPS = 1e-6;
const JND = 0.02;
const MAP_EPSILON = 0.0001;

const DEG = Math.PI / 180;

export function normalizeHue(h: number): number {
  const r = h % 360;
  const n = r < 0 ? r + 360 : r;
  return n >= 360 ? 0 : n;
}

export function oklchToOklab(c: Oklch): Oklab {
  const [l, ch, h] = c;
  if (!(ch > 0)) return [l, 0, 0];
  return [l, ch * Math.cos(h * DEG), ch * Math.sin(h * DEG)];
}

export function oklabToOklch(c: Oklab): Oklch {
  const [l, a, b] = c;
  const ch = Math.sqrt(a * a + b * b);
  if (ch < ACHROMATIC_CHROMA) return [l, ch, 0];
  return [l, ch, normalizeHue(Math.atan2(b, a) / DEG)];
}

export function oklabToLinearSrgb(c: Oklab): Rgb {
  const [l, a, b] = c;
  const lp = l + 0.3963377773761749 * a + 0.2158037573099136 * b;
  const mp = l - 0.1055613458156586 * a - 0.0638541728258133 * b;
  const sp = l - 0.0894841775298119 * a - 1.2914855480194092 * b;
  const L = lp * lp * lp;
  const M = mp * mp * mp;
  const S = sp * sp * sp;
  return [
    4.0767416360759574 * L - 3.3077115392580616 * M + 0.2309699031821044 * S,
    -1.2684379732850317 * L + 2.6097573492876887 * M - 0.3413193760026573 * S,
    -0.0041960761386756 * L - 0.7034186179359362 * M + 1.7076146940746117 * S,
  ];
}

export function linearSrgbToOklab(c: Rgb): Oklab {
  const [r, g, b] = c;
  const L = Math.cbrt(0.412221469470763 * r + 0.5363325372617348 * g + 0.0514459932675022 * b);
  const M = Math.cbrt(0.2119034958178252 * r + 0.6806995506452344 * g + 0.1073969535369406 * b);
  const S = Math.cbrt(0.0883024591900564 * r + 0.2817188391361215 * g + 0.6299787016738222 * b);
  return [
    0.210454268309314 * L + 0.7936177747023054 * M - 0.0040720430116193 * S,
    1.9779985324311684 * L - 2.4285922420485799 * M + 0.450593709617411 * S,
    0.0259040424655478 * L + 0.7827717124575296 * M - 0.8086757549230774 * S,
  ];
}

// Both transfer functions are extended to negative values by odd symmetry.
export function srgbEncode(x: number): number {
  const ax = Math.abs(x);
  const y = ax > 0.0031308 ? 1.055 * Math.pow(ax, 1 / 2.4) - 0.055 : ax * 12.92;
  return x < 0 ? -y : y;
}

export function srgbDecode(x: number): number {
  const ax = Math.abs(x);
  const y = ax > 0.04045 ? Math.pow((ax + 0.055) / 1.055, 2.4) : ax / 12.92;
  return x < 0 ? -y : y;
}

function rgbInGamut(rgb: Rgb, eps: number): boolean {
  const lo = -eps;
  const hi = 1 + eps;
  return rgb[0] >= lo && rgb[0] <= hi && rgb[1] >= lo && rgb[1] <= hi && rgb[2] >= lo && rgb[2] <= hi;
}

export function inSrgbGamut(c: Oklch, eps = GAMUT_EPS): boolean {
  return rgbInGamut(oklabToLinearSrgb(oklchToOklab(c)), eps);
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function clipRgb(rgb: Rgb): Rgb {
  return [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];
}

function deltaEOK(a: Oklab, b: Oklab): number {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

/**
 * CSS Color 4 "binary search gamut mapping with local MINDE" into sRGB.
 * Returns LINEAR sRGB, always within [0, 1].
 */
export function gamutMapToLinearSrgb(c: Oklch): Rgb {
  const [l, ch, h] = c;
  if (l >= 1) return [1, 1, 1];
  if (l <= 0) return [0, 0, 0];
  const origin = oklabToLinearSrgb(oklchToOklab(c));
  if (rgbInGamut(origin, GAMUT_EPS)) return clipRgb(origin);

  let clipped = clipRgb(origin);
  if (deltaEOK(linearSrgbToOklab(clipped), oklchToOklab(c)) < JND) return clipped;

  const cosH = Math.cos(h * DEG);
  const sinH = Math.sin(h * DEG);
  let min = 0;
  let max = ch;
  let minInGamut = true;
  while (max - min > MAP_EPSILON) {
    const chroma = (min + max) / 2;
    const current: Oklab = [l, chroma * cosH, chroma * sinH];
    const rgb = oklabToLinearSrgb(current);
    if (minInGamut && rgbInGamut(rgb, GAMUT_EPS)) {
      min = chroma;
      continue;
    }
    clipped = clipRgb(rgb);
    const e = deltaEOK(linearSrgbToOklab(clipped), current);
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

export function gamutMapSrgb(c: Oklch): Oklch {
  if (c[0] >= 1) return [1, 0, 0];
  if (c[0] <= 0) return [0, 0, 0];
  if (inSrgbGamut(c)) return [c[0], c[1], c[2]];
  return oklabToOklch(linearSrgbToOklab(gamutMapToLinearSrgb(c)));
}

export function oklchToHex(c: Oklch): string {
  const rgb = gamutMapToLinearSrgb(c);
  let hex = '#';
  for (const x of rgb) {
    const v = Math.round(clamp01(srgbEncode(x)) * 255);
    hex += v.toString(16).padStart(2, '0');
  }
  return hex;
}

export function hexToOklch(hex: string): Oklch {
  let s = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.replace(/./g, (d) => d + d);
  if (!/^[0-9a-f]{6}$/i.test(s)) throw new Error(`Invalid hex color: ${hex}`);
  const rgb: Rgb = [0, 2, 4].map((i) => srgbDecode(parseInt(s.slice(i, i + 2), 16) / 255)) as Rgb;
  return oklabToOklch(linearSrgbToOklab(rgb));
}
