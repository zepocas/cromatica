import type { Rgb } from '../design/design';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** sRGB [0, 1] → '#rrggbb'. */
export function rgbToHex(rgb: Rgb): string {
  return '#' + rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0')).join('');
}

/** '#rrggbb' → sRGB [0, 1]. Falls back to black on malformed input. */
export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
