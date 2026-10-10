// Halftone (M8): every pixel becomes ink or paper on a 45° screen. Ink is a
// darker, richer version of the color there and paper a lighter, paler one;
// dots cover the share that mixes back to the color's luminance, so tones hold
// from a distance. Dots are in image units, fixed on screen. The shader
// (shaders/color/halftone.glsl) does the same in float32.
import { linearSrgbToOklab, oklabToLinearSrgb } from '../color/oklab';
import type { Oklab, Rgb } from '../color/types';
import type { Finish } from '../design/design';
import { clamp01 } from '../math';

/** Screen pitch, composition units (image height = 1): ~4 px at 1080p. */
const HALFTONE_CELL = 0.0035;
/** Lightness gap between ink and paper at halftone 1, as a share of the way to black and white. */
const HALFTONE_CONTRAST = 0.85;
/** Ink gains chroma, paper loses it, per unit of contrast. */
const INK_CHROMA = 0.3;
const PAPER_FADE = 0.5;
/** Entries in the ink share → threshold table. */
export const HALFTONE_LUT_SIZE = 33;

const TAU = 2 * Math.PI;

/** Screen coords (cell units) of composition coords: the screen is turned 45°. */
const screen = (u: number, v: number) => [
  ((u + v) * Math.SQRT1_2) / HALFTONE_CELL,
  ((v - u) * Math.SQRT1_2) / HALFTONE_CELL,
];

/** Spot function: 0 at dot centres, 1 between them. */
function spot(u: number, v: number): number {
  const [x, y] = screen(u, v);
  return 0.5 - 0.25 * (Math.cos(TAU * x) + Math.cos(TAU * y));
}

/**
 * Threshold on the spot function that inks a share `i / (size - 1)` of the
 * image: quantiles of the spot function sampled over many cells.
 */
function coverageTable(): number[] {
  const n = 384;
  const span = 24 * HALFTONE_CELL;
  const values = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) values[j * n + i] = spot(((i + 0.5) / n) * span, ((j + 0.5) / n) * span);
  }
  values.sort();
  return Array.from({ length: HALFTONE_LUT_SIZE }, (_, k) => {
    const q = k / (HALFTONE_LUT_SIZE - 1);
    return values[Math.min(values.length - 1, Math.round(q * (values.length - 1)))];
  });
}

export const HALFTONE_TABLE: readonly number[] = coverageTable();

/** Ink/paper contrast for a finish; 0 = off. */
export function halftoneContrast(finish: Finish | undefined): number {
  return finish?.noise.type === 'halftone' ? HALFTONE_CONTRAST * clamp01(finish.noise.amount) : 0;
}

export const HALFTONE_SHADER_CONSTANTS = {
  HALFTONE: 1,
  HALFTONE_CELL: HALFTONE_CELL.toFixed(4),
  INK_CHROMA: INK_CHROMA.toFixed(4),
  PAPER_FADE: PAPER_FADE.toFixed(4),
  HALFTONE_LUT_SIZE,
};

/** GLSL smoothstep. */
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** How much of the pixel at (u, v) is ink, for an ink share `cover`. */
function inkAt(cover: number, u: number, v: number, pixel: number): number {
  if (cover <= 0 || cover >= 1) return cover;
  const x = cover * (HALFTONE_LUT_SIZE - 1);
  const i = Math.min(HALFTONE_LUT_SIZE - 2, Math.floor(x));
  const threshold = HALFTONE_TABLE[i] + (HALFTONE_TABLE[i + 1] - HALFTONE_TABLE[i]) * (x - i);
  const [sx, sy] = screen(u, v);
  const slope = 0.25 * TAU * Math.hypot(Math.sin(TAU * sx), Math.sin(TAU * sy));
  // Anti-aliased over one pixel; the width stays above 0 where the dot edge is flat.
  const w = Math.max(((0.5 * pixel) / HALFTONE_CELL) * slope, 1e-4);
  return 1 - smoothstep(threshold - w, threshold + w, spot(u, v));
}

/** `rgb` (linear) at composition coords (u, v) as ink or paper; `pixel` = 1 / output height. */
export function applyHalftone(contrast: number, rgb: Rgb, u: number, v: number, pixel: number): Rgb {
  const [L, a, b] = linearSrgbToOklab(rgb.map((c) => Math.max(c, 0)) as Rgb);
  const k = contrast;
  const ink: Oklab = [L * (1 - k), a * (1 + INK_CHROMA * k), b * (1 + INK_CHROMA * k)];
  const paper: Oklab = [L + k * (1 - L), a * (1 - PAPER_FADE * k), b * (1 - PAPER_FADE * k)];
  // The eye mixes ink and paper in linear light; for these colors Y ≈ L³.
  const paperY = paper[0] ** 3;
  const inkY = ink[0] ** 3;
  const cover = paperY > inkY ? (paperY - L ** 3) / (paperY - inkY) : 0;
  const t = inkAt(clamp01(cover), u, v, pixel);
  // Edge pixels mix in linear light too.
  const inkRgb = oklabToLinearSrgb(ink);
  const paperRgb = oklabToLinearSrgb(paper);
  return [0, 1, 2].map((i) => paperRgb[i] + (inkRgb[i] - paperRgb[i]) * t) as Rgb;
}
