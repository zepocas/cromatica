// Film grain parameters (finish stage, D7); the noise itself is in
// shaders/color/grain.glsl. Grain is defined per output pixel (D4).
import type { Grain } from '../design/design';

/** Luma σ at amount 1, in encoded (0..1) units, at midtones: ≈ 15 LSB. */
export const GRAIN_SIGMA_MAX = 0.06;
/** Chroma σ relative to luma σ. */
export const GRAIN_CHROMA = 0.2;

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** Grain size in output pixels: size 0 → 1 px (white), 1 → 3 px. */
export const grainSizePx = (size: number) => 1 + 2 * clamp01(size);

export interface PreparedGrain {
  /** Luma σ at midtones, encoded units; 0 = off. */
  sigma: number;
  /** Lattice spacing in output pixels. */
  sizePx: number;
  chroma: number;
}

export function prepareGrain(grain: Grain | undefined): PreparedGrain {
  return {
    sigma: GRAIN_SIGMA_MAX * clamp01(grain?.amount ?? 0),
    sizePx: grainSizePx(grain?.size ?? 0),
    chroma: GRAIN_CHROMA,
  };
}
