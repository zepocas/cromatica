import { linearSrgbToOklab, srgbDecode } from '../color/oklab';

/** Per-pixel luminance and Oklab lightness of a small render, row-major from the top. */
export interface LightnessMap {
  width: number;
  height: number;
  /** WCAG relative luminance. */
  luminance: Float32Array;
  /** Oklab L. */
  lightness: Float32Array;
}

/** A zone in fractions of the image: x and w of the width, y and h of the height, from the top left. */
export interface ZoneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LegibilityIssue = 'midtone' | 'busy';

export interface Legibility {
  /** WCAG contrast of the zone's worst pixels against the better of white and black text. */
  contrast: number;
  text: 'white' | 'black';
  /** Mean Oklab lightness gradient, in L per image height. */
  busyness: number;
  issues: LegibilityIssue[];
}

/** WCAG AA: large text (clocks) and normal text (labels, menus). */
export const MIN_CONTRAST = { large: 3, normal: 4.5 };
export const MAX_BUSYNESS = 2;
/** The text has to read over nearly all of the zone, not just its average. */
const WORST_SHARE = 0.1;

export function lightnessMap(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): LightnessMap {
  const n = width * height;
  const luminance = new Float32Array(n);
  const lightness = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = srgbDecode(rgba[i * 4] / 255);
    const g = srgbDecode(rgba[i * 4 + 1] / 255);
    const b = srgbDecode(rgba[i * 4 + 2] / 255);
    luminance[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lightness[i] = linearSrgbToOklab([r, g, b])[0];
  }
  return { width, height, luminance, lightness };
}

const contrastRatio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

function quantile(sorted: Float32Array, q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
}

export function assessZone(map: LightnessMap, zone: ZoneRect, large = false): Legibility | null {
  const x0 = Math.max(0, Math.floor(zone.x * map.width));
  const y0 = Math.max(0, Math.floor(zone.y * map.height));
  const x1 = Math.min(map.width, Math.ceil((zone.x + zone.w) * map.width));
  const y1 = Math.min(map.height, Math.ceil((zone.y + zone.h) * map.height));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;

  const ys = new Float32Array((x1 - x0) * (y1 - y0));
  let gradient = 0;
  let k = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * map.width + x;
      ys[k++] = map.luminance[i];
      // Forward differences, staying inside the zone at its far edges.
      const gx = x + 1 < x1 ? map.lightness[i + 1] - map.lightness[i] : 0;
      const gy = y + 1 < y1 ? map.lightness[i + map.width] - map.lightness[i] : 0;
      gradient += Math.hypot(gx, gy);
    }
  }
  ys.sort();

  const onWhite = contrastRatio(1, quantile(ys, 1 - WORST_SHARE));
  const onBlack = contrastRatio(0, quantile(ys, WORST_SHARE));
  const contrast = Math.max(onWhite, onBlack);
  const busyness = (gradient / ys.length) * map.height;
  const issues: LegibilityIssue[] = [];
  if (contrast < MIN_CONTRAST[large ? 'large' : 'normal']) issues.push('midtone');
  if (busyness > MAX_BUSYNESS) issues.push('busy');
  return { contrast, text: onWhite >= onBlack ? 'white' : 'black', busyness, issues };
}
