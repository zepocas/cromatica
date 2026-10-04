// Film grain parameters (finish stage, D7); the noise itself is in
// shaders/color/grain.glsl. Grain is defined per output pixel (D4).
import type { Grain } from '../design/design';
import { clamp01 } from '../math';

/** Luma σ at amount 1, in encoded (0..1) units, at midtones: ≈ 15 LSB. */
const GRAIN_SIGMA_MAX = 0.06;
/** Chroma σ relative to luma σ. */
export const GRAIN_CHROMA = 0.2;

export interface PreparedGrain {
  /** Luma σ at midtones, encoded units; 0 = off. */
  sigma: number;
  /** Lattice spacing in output pixels: size 0 → 1 px (white), 1 → 3 px. */
  sizePx: number;
}

export function prepareGrain(grain: Grain | undefined): PreparedGrain {
  return {
    sigma: GRAIN_SIGMA_MAX * clamp01(grain?.amount ?? 0),
    sizePx: 1 + 2 * clamp01(grain?.size ?? 0),
  };
}
