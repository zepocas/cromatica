// Finishing effects (D33): vignette and bands. The shader (shaders/color/
// finish.glsl) reads the same prepared values as uniforms.
import type { Finish } from '../design/design';
import { clamp01 } from '../math';
import type { OutputSize } from './types';

/** Darkening at the frame corners at vignette 1 (linear light, multiplicative). */
const VIGNETTE_MAX = 0.75;
/** Where the vignette starts, as a fraction of the half diagonal. */
export const VIGNETTE_INNER = 0.35;
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
}

export function prepareFinish(finish: Finish | undefined, output: OutputSize): PreparedFinish {
  const bands = clamp01(finish?.bands ?? 0);
  return {
    vignette: VIGNETTE_MAX * clamp01(finish?.vignette ?? 0),
    vignetteScale: 1 / (0.5 * Math.hypot(output.width / output.height, 1)),
    bandSteps: bands > 0 ? Math.round(BAND_STEPS[0] + (BAND_STEPS[1] - BAND_STEPS[0]) * bands) : 0,
    bandEdge: clamp01(finish?.bandEdge ?? 0),
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

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
