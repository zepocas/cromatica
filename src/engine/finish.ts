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
}

export function prepareFinish(finish: Finish | undefined, output: OutputSize): PreparedFinish {
  const bands = clamp01(finish?.bands ?? 0);
  return {
    vignette: VIGNETTE_MAX * clamp01(finish?.vignette ?? 0),
    vignetteScale: 1 / (0.5 * Math.hypot(output.width / output.height, 1)),
    bandSteps: bands > 0 ? Math.round(BAND_STEPS[0] + (BAND_STEPS[1] - BAND_STEPS[0]) * bands) : 0,
  };
}

/** Multiplier on linear RGB at composition coords (u, v): 1 in the middle, darker toward the corners. */
export function vignetteFactor(f: PreparedFinish, u: number, v: number): number {
  if (f.vignette === 0) return 1;
  const x = clamp01((Math.hypot(u, v) * f.vignetteScale - VIGNETTE_INNER) / (1 - VIGNETTE_INNER));
  return 1 - f.vignette * x * x * (3 - 2 * x);
}

/** The ramp position in flat steps: t = 0 and t = 1 stay exact, so do the end colors. */
export function bandT(f: PreparedFinish, t: number): number {
  if (f.bandSteps < 2) return t;
  return Math.min(1, Math.floor(t * f.bandSteps) / (f.bandSteps - 1));
}
