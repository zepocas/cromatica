// Analog film grain parameters (finish stage, D7, D60); the noise itself is in
// shaders/color/grain.glsl. Grain is defined per output pixel (D4).
import type { Noise } from '../design/design';
import { clamp01 } from '../math';

/** Luma σ at amount 1, in encoded (0..1) units, at midtones: ≈ 38 LSB. */
const GRAIN_SIGMA_MAX = 0.15;
/** Chroma σ relative to luma σ: a little color in the grain, as in film. */
export const GRAIN_CHROMA = 0.2;
/** Lattice spacing in output pixels: a fine layer for the tooth and a coarser one for the clumps. */
const GRAIN_SIZE_PX = 0.85;
const GRAIN_CLUMP_PX = 1.9;

/** Amount steps that get their own pattern: the slider's step, so each notch shows fresh grain. */
const GRAIN_SEED_STEPS = 100;

export interface PreparedGrain {
  /** Luma σ at midtones, encoded units; 0 = off. */
  sigma: number;
  /** 1 / lattice spacing of the fine layer, in output pixels. */
  scale: number;
  /** 1 / lattice spacing of the clumps, in output pixels. */
  clumpScale: number;
  /** Which pattern: a pure function of the amount, so dragging the slider shimmers but a saved design always draws the same grain. */
  seed: number;
}

export function prepareGrain(noise: Noise | undefined): PreparedGrain {
  return {
    sigma: noise?.type === 'grain' ? GRAIN_SIGMA_MAX * clamp01(noise.amount) : 0,
    scale: 1 / GRAIN_SIZE_PX,
    clumpScale: 1 / GRAIN_CLUMP_PX,
    seed: Math.round(clamp01(noise?.amount ?? 0) * GRAIN_SEED_STEPS),
  };
}
