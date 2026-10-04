// Warp stage (D23): composition coords → warped composition coords, evaluated
// before the base pattern. This is the CPU reference, in doubles; the shader
// chunks in src/engine/shaders/warp/ do the same math in fp32, read the same
// prepared uniforms (prepareWarp) and get the constants below as #defines
// (WARP_SHADER_CONSTANTS), so CPU and GPU can't drift apart.
import { type Warp, WARP_SHAPES, type WarpShape } from '../design/design';
import { clamp, clamp01 } from '../math';
import { clampCoord, fbm, hash1, hash2, hashKey, pcg, ridged, simplex, TAU, type Vec2 } from './noise';

/** vec4 slots of seeded per-shape parameters (u_warpParam). */
export const WARP_PARAM_SLOTS = 6;
/** Composition coords are clamped to ±this before warping (fp32 headroom). */
const MAX_WARP_COORD = 64;
/** Width of the softened steps of rows/columns/voronoi, composition units. */
const WARP_EDGE = 0.0015;
/** fBm octaves of the domain warp (its recursion adds the detail). */
const DOMAIN_OCTAVES = 3;
/** Inner warp strength of the domain warp, noise units (IQ uses 4; lower is silkier). */
const DOMAIN_K = 1.5;
/** fBm octaves of the fbm warp. */
const FBM_OCTAVES = 5;
/** Curl-flow integration steps. */
const CURL_STEPS = 8;
/** Border distance (cell units) over which a worley bubble ramps to full strength. */
const WORLEY_RIM = 0.2;
/** fBm octaves of the ridged (silk) warp, and how much slower its noise runs along the folds than across them. */
const RIDGED_OCTAVES = 2;
const SILK_ALONG = 0.25;
/** fBm octaves and phase turbulence (radians at amount-independent strength) of the marble warp. */
const MARBLE_OCTAVES = 4;
const MARBLE_TURBULENCE = 4.5;

/** Bristle: noise frequency along and across the stroke (fine lines across, long along). */
const BRISTLE_ALONG = 0.3;
const BRISTLE_ACROSS = 8;
/** Smudge: fBm frequency along and across the stroke. */
const SMUDGE_ALONG = 0.4;
const SMUDGE_ACROSS = 2.5;
/** Squared radius added under the circular warp's 1 / r, so the center doesn't tear. */
const CIRCULAR_SOFTENING = 0.0004;
/** Hash-key salts, one per independent noise channel of a shape. */
const SALT = [0x51, 0x52, 0x53, 0x54] as const;

/** The constants above, as the shader's #defines. Float values are GLSL float literals. */
export const WARP_SHADER_CONSTANTS = {
  WARP_PARAM_SLOTS,
  MAX_WARP_COORD,
  WARP_EDGE: glslFloat(WARP_EDGE),
  DOMAIN_OCTAVES,
  DOMAIN_K: glslFloat(DOMAIN_K),
  FBM_OCTAVES,
  RIDGED_OCTAVES,
  SILK_ALONG: glslFloat(SILK_ALONG),
  MARBLE_OCTAVES,
  MARBLE_TURBULENCE: glslFloat(MARBLE_TURBULENCE),
  BRISTLE_ALONG: glslFloat(BRISTLE_ALONG),
  BRISTLE_ACROSS: glslFloat(BRISTLE_ACROSS),
  SMUDGE_ALONG: glslFloat(SMUDGE_ALONG),
  SMUDGE_ACROSS: glslFloat(SMUDGE_ACROSS),
  CURL_STEPS,
  WORLEY_RIM: glslFloat(WORLEY_RIM),
  CIRCULAR_SOFTENING: glslFloat(CIRCULAR_SOFTENING),
  ...Object.fromEntries(SALT.map((salt, i) => [`WARP_SALT${i}`, `0x${salt.toString(16)}u`])),
};

function glslFloat(x: number): string {
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

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
  ridged: { gain: 0.6, density: 0.6, coupling: 0.5 },
  marble: { gain: 0.8, density: 2, coupling: 1 }, // displacement ∝ band spacing
  bristle: { gain: 0.18, density: 1, coupling: 0.5 },
  smudge: { gain: 0.4, density: 1, coupling: 0.5 },
};

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

/** size ∈ [0, 1] → 0.5..8 cycles per image height, exponential. */
const warpFrequency = (size: number) => 0.5 * Math.pow(16, clamp01(size));

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
    case 'ridged':
    case 'marble':
    case 'bristle':
    case 'smudge': {
      // Folds (silk), bands (marble) or strokes (bristle, smudge) along a seeded direction.
      const a = r(0) * Math.PI;
      set(0, Math.cos(a), Math.sin(a), 0, 0);
      break;
    }
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
  const seed = Number.isFinite(warp?.seed) ? warp!.seed >>> 0 : 0;
  if (shape === 'none' || amount === 0) {
    return { shape: 'none', freq, amp: 0, seed, params: new Float64Array(WARP_PARAM_SLOTS * 4) };
  }
  const t = TUNING[shape];
  const amp = amount * t.gain * Math.pow(FREQ_REF / freq, t.coupling);
  const f = freq * t.density;
  return { shape, freq: f, amp, seed, params: seededParams(shape, seed) };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const saltKey = (w: PreparedWarp, i: number) => hashKey(w.seed, SALT[i]);

// Stepped bands along one axis: coordinate `along` is shifted by the band's
// hashed offset; band index comes from `across`. The step to the next band is
// a smoothstep over WARP_EDGE.
function bandOffset(across: number, w: PreparedWarp): number {
  const n = 2 * w.freq;
  const yy = clampCoord(across * n);
  const b = Math.floor(yy);
  const fr = yy - b;
  const key = saltKey(w, 0);
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

function worley(x: number, y: number, w: PreparedWarp): Vec2 {
  // Bubbles: each cell pulls toward (or pushes from) its feature point, with a
  // signed hashed strength that fades to 0 at the cell border, so the field
  // is continuous with creases along the borders.
  const sx = clampCoord(x * w.freq);
  const sy = clampCoord(y * w.freq);
  const v = voronoiCells(sx, sy, saltKey(w, 0));
  // Strength in ±[0.4, 1]: every cell is a visible bubble or dimple.
  const h = hash1(v.c1[0], v.c1[1], saltKey(w, 1));
  const st = h < 0.5 ? -0.4 - 1.2 * h : 1.2 * h - 0.2;
  const s = (w.amp * st * smoothstep(0, WORLEY_RIM, v.edge)) / w.freq;
  return [x + s * (v.p1[0] - sx), y + s * (v.p1[1] - sy)];
}

function voronoi(x: number, y: number, w: PreparedWarp): Vec2 {
  const sx = clampCoord(x * w.freq);
  const sy = clampCoord(y * w.freq);
  const v = voronoiCells(sx, sy, saltKey(w, 0));
  const ko = saltKey(w, 1);
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
  const k0 = saltKey(w, 0);
  const k1 = saltKey(w, 1);
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

function domain(x: number, y: number, w: PreparedWarp): Vec2 {
  // IQ recursive domain warp: p + A · fbm(s + K · fbm(s)). Liquid, silky folds.
  const sx = x * w.freq;
  const sy = y * w.freq;
  const qx = fbm(sx, sy, saltKey(w, 0), DOMAIN_OCTAVES);
  const qy = fbm(sx, sy, saltKey(w, 1), DOMAIN_OCTAVES);
  const rx = fbm(sx + DOMAIN_K * qx, sy + DOMAIN_K * qy, saltKey(w, 2), DOMAIN_OCTAVES);
  const ry = fbm(sx + DOMAIN_K * qx, sy + DOMAIN_K * qy, saltKey(w, 3), DOMAIN_OCTAVES);
  return [x + w.amp * rx, y + w.amp * ry];
}

function fbmWarp(x: number, y: number, w: PreparedWarp): Vec2 {
  const sx = x * w.freq;
  const sy = y * w.freq;
  return [x + w.amp * fbm(sx, sy, saltKey(w, 0), FBM_OCTAVES), y + w.amp * fbm(sx, sy, saltKey(w, 1), FBM_OCTAVES)];
}

function simplexWarp(x: number, y: number, w: PreparedWarp): Vec2 {
  const sx = x * w.freq;
  const sy = y * w.freq;
  return [x + w.amp * simplex(sx, sy, saltKey(w, 0))[0], y + w.amp * simplex(sx, sy, saltKey(w, 1))[0]];
}

function waves(x: number, y: number, w: PreparedWarp): Vec2 {
  const P = w.params;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < 3; i++) {
    const kx = P[i * 4];
    const ky = P[i * 4 + 1];
    const s = P[i * 4 + 3] * Math.sin(TAU * w.freq * (kx * x + ky * y) + P[i * 4 + 2]);
    dx -= s * ky;
    dy += s * kx;
  }
  return [x + w.amp * dx, y + w.amp * dy];
}

function circular(x: number, y: number, w: PreparedWarp): Vec2 {
  const P = w.params;
  const dx = x - P[0];
  const dy = y - P[1];
  const r2 = dx * dx + dy * dy;
  // Minus sin(phase): the displacement vanishes at the center (no tear).
  const s = (w.amp * (Math.sin(TAU * w.freq * Math.sqrt(r2) + P[2]) - P[3])) / Math.sqrt(r2 + CIRCULAR_SOFTENING);
  return [x + s * dx, y + s * dy];
}

function oval(x: number, y: number, w: PreparedWarp): Vec2 {
  const [cx, cy, ca, sa, q, iq, spin] = w.params;
  const dx = x - cx;
  const dy = y - cy;
  // Rotate into the ellipse frame, squash to a circle, swirl, and undo.
  const ex = ca * dx + sa * dy;
  const ey = (-sa * dx + ca * dy) * iq;
  const th = w.amp * spin * Math.exp(-(ex * ex + ey * ey) * w.freq * w.freq);
  const c = Math.cos(th);
  const s = Math.sin(th);
  const lx = c * ex - s * ey;
  const ly = (s * ex + c * ey) * q;
  return [cx + ca * lx - sa * ly, cy + sa * lx + ca * ly];
}

function silk(x: number, y: number, w: PreparedWarp): Vec2 {
  // Long folds along a seeded direction d: ridged noise that runs slowly
  // along d and fast across it, displacing across d like draped satin.
  const [dx, dy] = w.params;
  const along = (dx * x + dy * y) * SILK_ALONG * w.freq;
  const across = (-dy * x + dx * y) * w.freq;
  const s = w.amp * ridged(along, across, saltKey(w, 0), RIDGED_OCTAVES);
  return [x - s * dy, y + s * dx];
}

function marble(x: number, y: number, w: PreparedWarp): Vec2 {
  // Displace along the band normal by a sine of the band phase, the phase
  // stirred by fBm: the color ramp veins like stone.
  const [dx, dy] = w.params;
  const turbulence = MARBLE_TURBULENCE * fbm(x * w.freq, y * w.freq, saltKey(w, 0), MARBLE_OCTAVES);
  const s = w.amp * Math.sin(TAU * w.freq * (dx * x + dy * y) + turbulence);
  return [x + s * dx, y + s * dy];
}

/** Coordinates along and across the seeded stroke direction, in feature units. */
function strokeFrame(x: number, y: number, w: PreparedWarp): [along: number, across: number] {
  const [dx, dy] = w.params;
  return [(dx * x + dy * y) * w.freq, (-dy * x + dx * y) * w.freq];
}

function bristle(x: number, y: number, w: PreparedWarp): Vec2 {
  // Bristle lines: noise fast across the stroke and slow along it, displacing
  // along the stroke so colors smear into streaks; a coarse mask breaks the
  // strokes off, like a dry brush.
  const [dx, dy] = w.params;
  const [along, across] = strokeFrame(x, y, w);
  const streak = simplex(along * BRISTLE_ALONG, across * BRISTLE_ACROSS, saltKey(w, 0))[0];
  const mask = smoothstep(-0.3, 0.3, simplex(along * 0.5, across * 0.5, saltKey(w, 1))[0]);
  const s = w.amp * streak * mask;
  return [x + s * dx, y + s * dy];
}

function smudge(x: number, y: number, w: PreparedWarp): Vec2 {
  // A one-way drag: every point samples from behind it along the stroke, by
  // a smooth positive amount, so colors trail like a finger smear.
  const [dx, dy] = w.params;
  const [along, across] = strokeFrame(x, y, w);
  const s = w.amp * (0.5 + 0.5 * fbm(along * SMUDGE_ALONG, across * SMUDGE_ACROSS, saltKey(w, 0), 3));
  return [x - s * dx, y - s * dy];
}

const SHAPES: Record<Exclude<WarpShape, 'none'>, (x: number, y: number, w: PreparedWarp) => Vec2> = {
  domain,
  fbm: fbmWarp,
  simplex: simplexWarp,
  waves,
  rows: (x, y, w) => [x + bandOffset(y, w), y],
  columns: (x, y, w) => [x, y + bandOffset(x, w)],
  circular,
  oval,
  worley,
  voronoi,
  curl,
  ridged: silk,
  marble,
  bristle,
  smudge,
};

/** Warped composition coords of (x, y) under a prepared warp. */
export function warpPreparedPoint(w: PreparedWarp, x: number, y: number): Vec2 {
  if (w.shape === 'none') return [x, y];
  return SHAPES[w.shape](clamp(x, -MAX_WARP_COORD, MAX_WARP_COORD), clamp(y, -MAX_WARP_COORD, MAX_WARP_COORD), w);
}

/**
 * CPU reference of the warp stage: composition coordinates → warped
 * composition coordinates, where the base pattern is then evaluated. Same
 * math as the shader, in doubles (GPU results may differ slightly in fp32).
 * Used by the UI (the color under a new mesh point) and by tests.
 */
export function warpPoint(warp: Warp, x: number, y: number): [x: number, y: number] {
  return warpPreparedPoint(prepareWarp(warp), x, y);
}

/** Fast evaluator for many points of one warp (prepares once). */
export function createWarp(warp: Warp): (x: number, y: number) => Vec2 {
  const w = prepareWarp(warp);
  return (x, y) => warpPreparedPoint(w, x, y);
}
