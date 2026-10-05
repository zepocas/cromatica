// Where a ramp gradient puts each point of the frame on its ramp: t in [0, 1].
// The shader (shaders/gradient/ramp-shape.glsl) reads the same prepared
// values as uniforms, so CPU references and the GPU agree.
import type { RampGradient, RampShape, Transform } from '../design/design';
import { clamp01 } from '../math';
import { clampCoord, fbm, hash1, hashKey, ridged } from './noise';
import type { OutputSize } from './types';
import { applyMat2, orientationMatrix, transpose } from './transform';
import { feature, voronoiCells } from './warp';

/**
 * Conic: within this radius of the center (composition units) t eases toward
 * the middle of the ramp. Every color meets at the center, so without it a
 * warp shreds that point into a pinched knot.
 */
export const CONIC_CORE = 0.15;

/** Contour noise: fBm octaves, frequency factor, and how many times the ramp repeats over the noise's range. */
export const CONTOUR_OCTAVES = 3;
export const CONTOUR_FREQ = 0.5;
export const CONTOUR_REPEATS = 3;
/** Ridged noise: octaves, frequency factor, and the gain that spreads it over the ramp. */
export const RIDGE_OCTAVES = 3;
export const RIDGE_FREQ = 0.7;
export const RIDGE_GAIN = 0.6;
/** Cells: how much of the ramp the per-cell hash and the distance to the cell's center span. */
export const CELL_TINT = 0.75;
export const CELL_SHADE = 0.45;
/** Cells: edge antialiasing half width, output pixels. */
const CELL_AA_PIXELS = 0.75;
const NOISE_SALT = 0x81;
const CELL_SALT = 0x82;

export interface PreparedRampShape {
  shape: RampShape;
  /** Linear: direction / frame extent along it. Conic: unit start direction. */
  axis: [number, number];
  /** Radial: 1 / half the frame diagonal. */
  radialScale: number;
  /** Noise and cells: features per unit of image height. */
  freq: number;
  /** Noise: fBm key. Cells: feature key and tint key. */
  key: number;
  key2: number;
  /** Cells: antialiasing half width, cell units. */
  edge: number;
  ridged: boolean;
}

/** scale ∈ [0, 1] → 0.6..6 features per image height, exponential. */
const noiseFrequency = (scale: number) => 0.6 * Math.pow(10, clamp01(Number.isFinite(scale) ? scale : 0.35));

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
  const none = { radialScale: 0, freq: 0, key: 0, key2: 0, edge: 0, ridged: false };
  if (g.kind === 'radial')
    return { ...none, shape: 'radial', axis: [dx, dy], radialScale: 1 / (0.5 * Math.hypot(aspect, 1)) };
  if (g.kind === 'conic') return { ...none, shape: 'conic', axis: [dx, dy] };
  if (g.kind === 'noise' || g.kind === 'cells') {
    const freq = noiseFrequency(g.scale ?? 0.35);
    const seed = Number.isFinite(g.seed) ? g.seed! >>> 0 : 1;
    const salt = g.kind === 'noise' ? NOISE_SALT : CELL_SALT;
    return {
      ...none,
      shape: g.kind,
      axis: [0, 0],
      freq,
      key: hashKey(seed, salt),
      key2: hashKey(seed, salt + 0x10),
      edge: (CELL_AA_PIXELS / output.height) * freq,
      ridged: g.kind === 'noise' && g.noiseStyle === 'ridged',
    };
  }
  // The frame is aspect × 1, rotated and flipped by the transform's orientation
  // O: its extent along d is |e.x|·aspect + |e.y| with e = Oᵀd.
  const [ex, ey] = applyMat2(transpose(orientationMatrix(transform)), dx, dy);
  const extent = Math.abs(ex) * aspect + Math.abs(ey);
  return { ...none, shape: 'linear', axis: [dx / extent, dy / extent] };
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
    case 'noise': {
      if (r.ridged) {
        const f = r.freq * RIDGE_FREQ;
        return clamp01(0.5 + RIDGE_GAIN * ridged(x * f, y * f, r.key, RIDGE_OCTAVES));
      }
      // Mirrored repeats (0 → 1 → 0), so the stripes have no seams.
      const f = r.freq * CONTOUR_FREQ;
      return 0.5 - 0.5 * Math.cos(2 * Math.PI * CONTOUR_REPEATS * fbm(x * f, y * f, r.key, CONTOUR_OCTAVES));
    }
    case 'cells':
      return cellsT(r, x, y);
  }
}

/**
 * Worley cells: each cell takes a hashed spot on the ramp, shaded by the
 * distance to its feature point. Across a border the two cells meet at their
 * mean over the antialiasing width, so the edge is crisp but not jagged.
 */
function cellsT(r: PreparedRampShape, x: number, y: number): number {
  const sx = clampCoord(x * r.freq);
  const sy = clampCoord(y * r.freq);
  const v = voronoiCells(sx, sy, r.key);
  const cellT = (cx: number, cy: number, fx: number, fy: number) =>
    CELL_TINT * hash1(cx, cy, r.key2) + CELL_SHADE * Math.hypot(sx - fx, sy - fy);
  const t1 = cellT(v.c1[0], v.c1[1], v.p1[0], v.p1[1]);
  const p2 = feature(v.c2[0], v.c2[1], r.key);
  const t2 = cellT(v.c2[0], v.c2[1], p2[0], p2[1]);
  const mid = 0.5 * (t1 + t2);
  return clamp01(mid + (t1 - mid) * smoothstep(v.edge / r.edge));
}
