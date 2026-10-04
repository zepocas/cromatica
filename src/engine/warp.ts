// Warp stage (M3): composition coords → warped composition coords, evaluated
// before the base pattern. This is the CPU reference, in doubles; the shader
// chunks in src/engine/shaders/warp/ do the same math in fp32 and read the
// same prepared uniforms (prepareWarp), so seeded parameters are bit-identical.
import { WARP_SHAPES, type Warp, type WarpShape } from '../design/design';
import {
  clampCoord,
  fbm,
  hash1,
  hash2,
  hashKey,
  pcg,
  simplex,
  type Vec2,
} from './noise';

const TAU = 6.283185307179586;

/** vec4 slots of seeded per-shape parameters (u_warpParam). */
export const WARP_PARAM_SLOTS = 6;
/** Composition coords are clamped to ±this before warping (fp32 headroom). */
export const MAX_WARP_COORD = 64;
/** Width of the softened steps of rows/columns/voronoi, composition units. */
export const WARP_EDGE = 0.0015;
/** fBm octaves of the domain warp (its recursion adds detail) and the fbm warp. */
const DOMAIN_OCTAVES = 3;
/** Inner warp strength of the domain warp, noise units (IQ uses 4; lower is silkier). */
export const DOMAIN_K = 1.5;
const FBM_OCTAVES = 5;
/** Curl-flow integration steps. */
export const CURL_STEPS = 8;

/** Per-shape displacement gain (at amount 1) and how it scales with feature size. */
interface ShapeTuning {
  gain: number;
  /** Feature frequency multiplier over warpFrequency(size). */
  density: number;
  /** amp ∝ (FREQ_REF / freq)^coupling: 0 = constant in composition units. */
  coupling: number;
}

const FREQ_REF = 1.3;

const TUNING: Record<Exclude<WarpShape, 'none'>, ShapeTuning> = {
  domain: { gain: 0.4, density: 0.7, coupling: 0.5 },
  fbm: { gain: 0.6, density: 1, coupling: 0.5 },
  simplex: { gain: 0.6, density: 1, coupling: 0.5 },
  waves: { gain: 0.35, density: 1.5, coupling: 0.5 },
  rows: { gain: 0.5, density: 2, coupling: 0 },
  columns: { gain: 0.5, density: 2, coupling: 0 },
  circular: { gain: 0.25, density: 2, coupling: 0.5 },
  oval: { gain: 6, density: 1, coupling: 0 }, // radians of swirl at the center
  worley: { gain: 1.6, density: 1.4, coupling: 0 }, // fraction of the pull onto the feature
  voronoi: { gain: 0.25, density: 2, coupling: 0.5 },
  curl: { gain: 0.6, density: 1, coupling: 0.5 },
};

/** Hash-key salts, shared with the shader (see shaders/warp/*.glsl). */
const SALT = [0x51, 0x52, 0x53, 0x54] as const;

/** The warp as the shader sees it. */
export interface PreparedWarp {
  /** Effective shape: 'none' when the amount is 0 (identity, cheapest variant). */
  shape: WarpShape;
  /** Feature frequency, cycles per image height. */
  freq: number;
  /** Displacement magnitude (shape-specific units, see TUNING). */
  amp: number;
  seed: number;
  /** WARP_PARAM_SLOTS × vec4 of seeded parameters. */
  params: Float64Array;
}

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** size ∈ [0, 1] → 0.5..8 cycles per image height, exponential. */
export const warpFrequency = (size: number) => 0.5 * Math.pow(16, clamp01(size));

/** Seeded uniform [0, 1) number i of a seed (CPU only; uploaded as uniforms). */
const seeded = (seed: number, i: number) => (pcg(hashKey(seed, 0x1000 + i)) >>> 8) / 16777216;

function seededParams(shape: WarpShape, seed: number): Float64Array {
  const p = new Float64Array(WARP_PARAM_SLOTS * 4);
  const r = (i: number) => seeded(seed, i);
  const set = (slot: number, ...v: number[]) => p.set(v, slot * 4);
  switch (shape) {
    case 'waves': {
      // Three waves at well-separated seeded angles; displacement is transverse
      // (along the wave fronts), which ripples like silk. Weights fall off so one
      // wave leads.
      const base = r(0) * TAU;
      const weights = [0.55, 0.3, 0.15];
      for (let i = 0; i < 3; i++) {
        const a = base + i * (TAU / 3) * (0.55 + 0.4 * r(1 + i));
        const m = 0.7 + 0.9 * r(4 + i);
        set(i, Math.cos(a) * m, Math.sin(a) * m, r(7 + i) * TAU, weights[i] / m);
      }
      break;
    }
    case 'circular':
      set(0, (r(0) - 0.5) * 0.7, (r(1) - 0.5) * 0.4, r(2) * TAU, Math.sin(r(2) * TAU));
      break;
    case 'oval': {
      const a = r(2) * Math.PI;
      const q = 0.4 + 0.3 * r(3);
      set(0, (r(0) - 0.5) * 0.6, (r(1) - 0.5) * 0.3, Math.cos(a), Math.sin(a));
      set(1, q, 1 / q, r(4) < 0.5 ? -1 : 1, 0);
      break;
    }
  }
  return p;
}

export function prepareWarp(warp: Warp | undefined): PreparedWarp {
  const shape: WarpShape = warp && WARP_SHAPES.includes(warp.shape) ? warp.shape : 'none';
  const amount = clamp01(warp?.amount ?? 0);
  const freq = warpFrequency(warp?.size ?? 0.5);
  const seed = Number.isFinite(warp?.seed) ? (warp!.seed >>> 0) : 0;
  if (shape === 'none' || amount === 0) {
    return { shape: 'none', freq, amp: 0, seed, params: new Float64Array(WARP_PARAM_SLOTS * 4) };
  }
  const t = TUNING[shape];
  const amp = amount * t.gain * Math.pow(FREQ_REF / freq, t.coupling);
  const f = freq * t.density;
  return { shape, freq: f, amp, seed, params: seededParams(shape, seed) };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Stepped bands along one axis: coordinate `along` is shifted by the band's
// hashed offset; band index comes from `across`. The step to the next band is
// a smoothstep over WARP_EDGE.
function bandOffset(across: number, w: PreparedWarp): number {
  const n = 2 * w.freq;
  const yy = clampCoord(across * n);
  const b = Math.floor(yy);
  const fr = yy - b;
  const key = hashKey(w.seed, SALT[0]);
  const o0 = hash1(b, 0, key) * 2 - 1;
  const o1 = hash1(b + 1, 0, key) * 2 - 1;
  const e = Math.min(0.45, WARP_EDGE * n);
  return w.amp * (o0 + (o1 - o0) * smoothstep(1 - e, 1, fr));
}

/** Jittered feature point of a Worley/Voronoi cell, cell units. */
function feature(cx: number, cy: number, key: number): Vec2 {
  const h = hash2(cx, cy, key);
  return [cx + 0.1 + 0.8 * h[0], cy + 0.1 + 0.8 * h[1]];
}

interface VoronoiCells {
  /** Nearest cell and its feature point. */
  c1: Vec2;
  p1: Vec2;
  /** The cell across the nearest border, and the distance to that border (cell units). */
  c2: Vec2;
  edge: number;
}

/** F1 cell, its nearest border (bisector) and the cell across it; 3×3 searches. */
function voronoiCells(sx: number, sy: number, key: number): VoronoiCells {
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  let best = Infinity;
  let cx = 0;
  let cy = 0;
  let px = 0;
  let py = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const f = feature(ix + i, iy + j, key);
      const d = (f[0] - sx) ** 2 + (f[1] - sy) ** 2;
      if (d < best) {
        best = d;
        cx = ix + i;
        cy = iy + j;
        px = f[0];
        py = f[1];
      }
    }
  }
  let edge = Infinity;
  let nx = cx;
  let ny = cy;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      if (i === 0 && j === 0) continue;
      const f = feature(cx + i, cy + j, key);
      const dx = f[0] - px;
      const dy = f[1] - py;
      const d = (((px + f[0]) * 0.5 - sx) * dx + ((py + f[1]) * 0.5 - sy) * dy) / Math.sqrt(dx * dx + dy * dy);
      if (d < edge) {
        edge = d;
        nx = cx + i;
        ny = cy + j;
      }
    }
  }
  return { c1: [cx, cy], p1: [px, py], c2: [nx, ny], edge };
}

/** Border distance (cell units) over which a worley bubble ramps to full strength. */
const WORLEY_RIM = 0.2;

function worley(x: number, y: number, w: PreparedWarp): Vec2 {
  // Bubbles: each cell pulls toward (or pushes from) its feature point, with a
  // signed hashed strength that fades to 0 at the cell border, so the field
  // is continuous with creases along the borders.
  const sx = clampCoord(x * w.freq);
  const sy = clampCoord(y * w.freq);
  const v = voronoiCells(sx, sy, hashKey(w.seed, SALT[0]));
  // Strength in ±[0.4, 1]: every cell is a visible bubble or dimple.
  const h = hash1(v.c1[0], v.c1[1], hashKey(w.seed, SALT[1]));
  const st = h < 0.5 ? -0.4 - 1.2 * h : 1.2 * h - 0.2;
  const s = (w.amp * st * smoothstep(0, WORLEY_RIM, v.edge)) / w.freq;
  return [x + s * (v.p1[0] - sx), y + s * (v.p1[1] - sy)];
}

function voronoi(x: number, y: number, w: PreparedWarp): Vec2 {
  const sx = clampCoord(x * w.freq);
  const sy = clampCoord(y * w.freq);
  const v = voronoiCells(sx, sy, hashKey(w.seed, SALT[0]));
  const ko = hashKey(w.seed, SALT[1]);
  const o1 = hash2(v.c1[0], v.c1[1], ko);
  const o2 = hash2(v.c2[0], v.c2[1], ko);
  // At the border both cells give the mean offset, so the step is continuous.
  const t = smoothstep(0, WARP_EDGE * w.freq, v.edge);
  const mx = (o1[0] + o2[0]) * 0.5;
  const my = (o1[1] + o2[1]) * 0.5;
  return [x + w.amp * ((mx + (o1[0] - mx) * t) * 2 - 1), y + w.amp * ((my + (o1[1] - my) * t) * 2 - 1)];
}

function curl(x: number, y: number, w: PreparedWarp): Vec2 {
  // Stateless streamline integration: CURL_STEPS Euler steps along the curl of
  // a two-octave simplex stream function.
  const k0 = hashKey(w.seed, SALT[0]);
  const k1 = hashKey(w.seed, SALT[1]);
  const step = (w.amp * 0.25) / CURL_STEPS;
  for (let i = 0; i < CURL_STEPS; i++) {
    const sx = x * w.freq;
    const sy = y * w.freq;
    const a = simplex(sx, sy, k0);
    const b = simplex(2 * sx, 2 * sy, k1);
    // ∇ψ in noise units; the second octave's chain-rule factor 2 cancels its 0.5 weight.
    const gx = a[1] + b[1];
    const gy = a[2] + b[2];
    x += step * gy;
    y -= step * gx;
  }
  return [x, y];
}

/**
 * CPU reference of the warp stage: composition coordinates → warped
 * composition coordinates, where the base pattern is then evaluated. Same
 * math as the shader, in doubles (GPU results may differ slightly in fp32).
 * Used by the UI (the color under a new mesh point) and by tests.
 */
export function warpPreparedPoint(w: PreparedWarp, x: number, y: number): Vec2 {
  if (w.shape === 'none') return [x, y];
  x = Math.min(MAX_WARP_COORD, Math.max(-MAX_WARP_COORD, x));
  y = Math.min(MAX_WARP_COORD, Math.max(-MAX_WARP_COORD, y));
  const f = w.freq;
  const A = w.amp;
  const P = w.params;
  const key = (i: number) => hashKey(w.seed, SALT[i]);
  switch (w.shape) {
    case 'domain': {
      const sx = x * f;
      const sy = y * f;
      const qx = fbm(sx, sy, key(0), DOMAIN_OCTAVES);
      const qy = fbm(sx, sy, key(1), DOMAIN_OCTAVES);
      const rx = fbm(sx + DOMAIN_K * qx, sy + DOMAIN_K * qy, key(2), DOMAIN_OCTAVES);
      const ry = fbm(sx + DOMAIN_K * qx, sy + DOMAIN_K * qy, key(3), DOMAIN_OCTAVES);
      return [x + A * rx, y + A * ry];
    }
    case 'fbm':
      return [x + A * fbm(x * f, y * f, key(0), FBM_OCTAVES), y + A * fbm(x * f, y * f, key(1), FBM_OCTAVES)];
    case 'simplex':
      return [x + A * simplex(x * f, y * f, key(0))[0], y + A * simplex(x * f, y * f, key(1))[0]];
    case 'waves': {
      let dx = 0;
      let dy = 0;
      for (let i = 0; i < 3; i++) {
        const kx = P[i * 4];
        const ky = P[i * 4 + 1];
        const s = P[i * 4 + 3] * Math.sin(TAU * f * (kx * x + ky * y) + P[i * 4 + 2]);
        dx -= s * ky;
        dy += s * kx;
      }
      return [x + A * dx, y + A * dy];
    }
    case 'rows':
      return [x + bandOffset(y, w), y];
    case 'columns':
      return [x, y + bandOffset(x, w)];
    case 'circular': {
      const dx = x - P[0];
      const dy = y - P[1];
      const r2 = dx * dx + dy * dy;
      // Minus sin(phase): the displacement vanishes at the center (no tear).
      const s = (A * (Math.sin(TAU * f * Math.sqrt(r2) + P[2]) - P[3])) / Math.sqrt(r2 + 0.0004);
      return [x + s * dx, y + s * dy];
    }
    case 'oval': {
      const [cx, cy, ca, sa, q, iq, spin] = P;
      const dx = x - cx;
      const dy = y - cy;
      // Rotate into the ellipse frame, squash to a circle, swirl, and undo.
      const ex = ca * dx + sa * dy;
      const ey = (-sa * dx + ca * dy) * iq;
      const th = A * spin * Math.exp(-(ex * ex + ey * ey) * f * f);
      const c = Math.cos(th);
      const s = Math.sin(th);
      const lx = c * ex - s * ey;
      const ly = (s * ex + c * ey) * q;
      return [cx + ca * lx - sa * ly, cy + sa * lx + ca * ly];
    }
    case 'worley':
      return worley(x, y, w);
    case 'voronoi':
      return voronoi(x, y, w);
    case 'curl':
      return curl(x, y, w);
  }
  return [x, y];
}

/** Warped composition coords of (x, y). Same math as the shader, in doubles. */
export function warpPoint(warp: Warp, x: number, y: number): [x: number, y: number] {
  return warpPreparedPoint(prepareWarp(warp), x, y);
}

/** Fast evaluator for many points of one warp (prepares once). */
export function createWarp(warp: Warp): (x: number, y: number) => Vec2 {
  const w = prepareWarp(warp);
  return (x, y) => warpPreparedPoint(w, x, y);
}
