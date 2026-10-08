// Finishing effects (D33): vignette and bands. The shader (shaders/color/
// finish.glsl) reads the same prepared values as uniforms.
import type { MeshBanding } from '../color/mesh';
import { BAND_STYLES, type Finish } from '../design/design';
import { clamp01 } from '../math';
import type { OutputSize } from './types';

/** Darkening at the frame corners at vignette 1 (linear light, multiplicative). */
const VIGNETTE_MAX = 0.75;
/** Where the vignette starts, as a fraction of the half diagonal. */
export const VIGNETTE_INNER = 0.35;
/** Print texture: tooth modulation of the ink at print 1, and the screen's tones per channel. */
const PRINT_INK = 0.35;
const PRINT_LEVELS = 3;
/** Lithograph's top end on the print scale: just where the old slider started to blend the xerox screen in. */
const LITHO_MAX = 0.7;
/** Print amount over which the effect fades in, so the slider starts gently. */
const PRINT_FADE_IN = 0.25;
/** Fraction of pixels that get a toner speck at print 1. */
const PRINT_SPECKLE = 0.0015;
/** Darkening at the frame edges at print 1. */
const PRINT_EDGE = 0.2;
/** Band steps at bands just above 0 and at 1. */
const BAND_STEPS: [many: number, few: number] = [24, 3];

export interface PreparedFinish {
  /** Darkening at the corners; 0 = off. */
  vignette: number;
  /** 1 / half the frame diagonal, composition units. */
  vignetteScale: number;
  /** Number of flat steps; 0 = off. */
  bandSteps: number;
  /** Fraction of each step over which it rises into the next; 0 = hard. */
  bandEdge: number;
  /** Index into BAND_STYLES (the shader's u_bandMode). */
  bandStyle: number;
  /** Print texture: how much of the printed look is mixed in; 0 = off. */
  printMix: number;
  /** How strongly the paper tooth modulates the ink (litho). */
  printInk: number;
  /** How much of the thresholded screen is mixed in (xerox). */
  printScreen: number;
  /** Tones per channel of the screen. */
  printLevels: number;
  /** Fraction of pixels with a toner speck. */
  printSpeckle: number;
  /** Darkening at the frame edges. */
  printEdge: number;
}

/**
 * The print scale (ink, speckle, edges) and screen mix of the noise: lithograph is the gentle end,
 * xerox the same texture at full range with the thresholded screen blended in; halftone is not print.
 */
function printLook(finish: Finish | undefined): { print: number; screen: number } {
  const noise = finish?.noise;
  const amount = clamp01(noise?.amount ?? 0);
  if (noise?.type === 'lithograph') return { print: LITHO_MAX * amount, screen: 0 };
  if (noise?.type === 'xerox') return { print: amount, screen: smoothstep(0, 1, amount) };
  return { print: 0, screen: 0 };
}

export function prepareFinish(finish: Finish | undefined, output: OutputSize): PreparedFinish {
  const bands = clamp01(finish?.bands ?? 0);
  const { print, screen } = printLook(finish);
  return {
    vignette: VIGNETTE_MAX * clamp01(finish?.vignette ?? 0),
    vignetteScale: 1 / (0.5 * Math.hypot(output.width / output.height, 1)),
    bandSteps: bands > 0 ? Math.round(BAND_STEPS[0] + (BAND_STEPS[1] - BAND_STEPS[0]) * bands) : 0,
    bandEdge: clamp01(finish?.bandEdge ?? 0),
    bandStyle: Math.max(0, BAND_STYLES.indexOf(finish?.bandStyle ?? 'weights')),
    printMix: smoothstep(0, PRINT_FADE_IN, print),
    printInk: PRINT_INK * print,
    printScreen: screen,
    printLevels: PRINT_LEVELS,
    printSpeckle: PRINT_SPECKLE * print * print,
    printEdge: PRINT_EDGE * print,
  };
}

/** Multiplier on linear RGB at composition coords (u, v): 1 in the middle, darker toward the corners. */
export function vignetteFactor(f: PreparedFinish, u: number, v: number): number {
  if (f.vignette === 0) return 1;
  return 1 - f.vignette * smoothstep(VIGNETTE_INNER, 1, Math.hypot(u, v) * f.vignetteScale);
}

/**
 * x in [0, 1] in flat steps: n levels from 0 to 1, each rising smoothly into
 * the next over the last `bandEdge` of its width (0 = a hard edge). 0 and 1
 * stay exact. Ramps band their position t; meshes each point's weight
 * relative to the strongest (src/color/mesh.ts).
 */
export function bandLevel(f: PreparedFinish, x: number): number {
  const n = f.bandSteps;
  if (n < 2) return x;
  const q = x * n;
  const k = Math.floor(q);
  const rise = f.bandEdge > 0 ? smoothstep(1 - f.bandEdge, 1, q - k) : 0;
  return Math.min(1, (k + rise) / (n - 1));
}

/** How the CPU mesh reference bands, from the prepared finish. */
export function meshBanding(f: PreparedFinish): MeshBanding {
  return {
    style: BAND_STYLES[f.bandStyle],
    steps: f.bandSteps,
    level: (x) => bandLevel(f, x),
    stepLightness: (l) => stepLightness(f, l),
  };
}

/**
 * Lightness in flat steps, each at its band's center so the mean lightness
 * holds, and rising into the next over the last `bandEdge`. Off is exactly l.
 */
export function stepLightness(f: PreparedFinish, l: number): number {
  const n = f.bandSteps;
  if (n < 2) return l;
  const q = clamp01(l) * n;
  const k = Math.floor(q);
  const rise = f.bandEdge > 0 ? smoothstep(1 - f.bandEdge, 1, q - k) : 0;
  return Math.min(1, (k + rise + 0.5) / n);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
