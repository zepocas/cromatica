// Where a ramp gradient puts each point of the frame on its ramp: t in [0, 1].
// The shader (shaders/gradient/ramp-shape.glsl) reads the same prepared
// values as uniforms, so CPU references and the GPU agree.
import type { RampGradient, RampShape, Transform } from '../design/design';
import type { OutputSize } from './types';
import { applyMat2, orientationMatrix, transpose } from './transform';

/**
 * Conic: within this radius of the center (composition units) t eases toward
 * the middle of the ramp. Every color meets at the center, so without it a
 * warp shreds that point into a pinched knot.
 */
export const CONIC_CORE = 0.15;

export interface PreparedRampShape {
  shape: RampShape;
  /** Linear: direction / frame extent along it. Conic: unit start direction. */
  axis: [number, number];
  /** Radial: 1 / half the frame diagonal. */
  radialScale: number;
}

/**
 * Linear spans the frame along its direction, whatever the rotation and flips
 * (zoom is left out, so it still magnifies). Radial reaches t = 1 at the frame
 * corners. Conic runs t = (1 − cos θ) / 2 with θ the angle from the start
 * direction: 0 there, 1 opposite, and smooth all the way round, with no seam.
 */
export function prepareRampShape(
  g: RampGradient,
  output: OutputSize,
  transform: Transform | undefined,
): PreparedRampShape {
  const aspect = output.width / output.height;
  const a = (g.angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  if (g.kind === 'radial') return { shape: 'radial', axis: [dx, dy], radialScale: 1 / (0.5 * Math.hypot(aspect, 1)) };
  if (g.kind === 'conic') return { shape: 'conic', axis: [dx, dy], radialScale: 0 };
  // The frame is aspect × 1, rotated and flipped by the transform's orientation
  // O: its extent along d is |e.x|·aspect + |e.y| with e = Oᵀd.
  const [ex, ey] = applyMat2(transpose(orientationMatrix(transform)), dx, dy);
  const extent = Math.abs(ex) * aspect + Math.abs(ey);
  return { shape: 'linear', axis: [dx / extent, dy / extent], radialScale: 0 };
}

/** Smoothstep from 0 at x = 0 to 1 at x = 1. */
function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** Ramp position of pattern-space point (x, y). */
export function rampT(r: PreparedRampShape, x: number, y: number): number {
  switch (r.shape) {
    case 'radial':
      return Math.min(1, Math.hypot(x, y) * r.radialScale);
    case 'conic': {
      const len = Math.hypot(x, y);
      // The center has no angle; it takes the middle of the ramp.
      if (len < 1e-12) return 0.5;
      const k = smoothstep(len / CONIC_CORE);
      return 0.5 - (0.5 * k * (x * r.axis[0] + y * r.axis[1])) / len;
    }
    case 'linear':
      return Math.min(1, Math.max(0, x * r.axis[0] + y * r.axis[1] + 0.5));
  }
}
