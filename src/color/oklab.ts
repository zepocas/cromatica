// Oklab / Oklch ↔ linear sRGB conversions and the sRGB transfer functions.
// Björn Ottosson's matrices (2021 revision), as used by CSS Color 4 and culori.
import { normalizeDegrees } from '../math';
import type { Oklab, Oklch, Rgb } from './types';

/** Chroma below which hue is powerless and reported as 0. */
const ACHROMATIC_CHROMA = 1e-6;
const DEG = Math.PI / 180;

export function oklchToOklab(c: Oklch): Oklab {
  const [l, ch, h] = c;
  if (!(ch > 0)) return [l, 0, 0];
  return [l, ch * Math.cos(h * DEG), ch * Math.sin(h * DEG)];
}

/** h in [0, 360); h = 0 when the color is achromatic. */
export function oklabToOklch(c: Oklab): Oklch {
  const [l, a, b] = c;
  const ch = Math.sqrt(a * a + b * b);
  if (ch < ACHROMATIC_CHROMA) return [l, ch, 0];
  return [l, ch, normalizeDegrees(Math.atan2(b, a) / DEG)];
}

/** Unclamped: out-of-gamut colors give channels outside [0, 1]. */
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

/** Linear → sRGB-encoded, per channel. */
export function srgbEncode(x: number): number {
  const ax = Math.abs(x);
  const y = ax > 0.0031308 ? 1.055 * Math.pow(ax, 1 / 2.4) - 0.055 : ax * 12.92;
  return x < 0 ? -y : y;
}

/** sRGB-encoded → linear, per channel. */
export function srgbDecode(x: number): number {
  const ax = Math.abs(x);
  const y = ax > 0.04045 ? Math.pow((ax + 0.055) / 1.055, 2.4) : ax / 12.92;
  return x < 0 ? -y : y;
}
