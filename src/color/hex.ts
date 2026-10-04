import { clamp01 } from '../math';
import { gamutMapToLinearSrgb } from './gamut';
import { linearSrgbToOklab, oklabToOklch, srgbDecode, srgbEncode } from './oklab';
import type { Oklch, Rgb } from './types';

/** '#rrggbb', gamut-mapped into sRGB. */
export function oklchToHex(c: Oklch): string {
  const rgb = gamutMapToLinearSrgb(c);
  let hex = '#';
  for (const x of rgb) {
    const v = Math.round(clamp01(srgbEncode(x)) * 255);
    hex += v.toString(16).padStart(2, '0');
  }
  return hex;
}

/** '#rgb' or '#rrggbb' (the # is optional); throws on anything else. */
export function hexToOklch(hex: string): Oklch {
  let s = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.replace(/./g, (d) => d + d);
  if (!/^[0-9a-f]{6}$/i.test(s)) throw new Error(`Invalid hex color: ${hex}`);
  const rgb = [0, 2, 4].map((i) => srgbDecode(parseInt(s.slice(i, i + 2), 16) / 255)) as Rgb;
  return oklabToOklch(linearSrgbToOklab(rgb));
}
