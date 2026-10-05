// Planes (D37): seeded flat-color quads with torn edges. The layout is made on
// the CPU and passed to shaders/gradient/planes.glsl as uniforms; evaluatePlanes
// is the same per-pixel math in doubles, for tests.
import { gamutMapToLinearSrgb } from '../color/gamut';
import { srgbDecode } from '../color/oklab';
import type { Rgb } from '../color/types';
import { MAX_STOPS, type PlanesPattern } from '../design/design';
import { createRng } from '../design/random';
import { clamp01 } from '../math';
import { hash1, hashKey } from './noise';
import type { OutputSize } from './types';

export const MAX_PLANES = 24;
const PLANE_COUNT: [few: number, many: number] = [4, 24];
/** Half extents of the field the planes are spread over. Fixed (D4): a wider frame shows more of it. */
const FIELD: [x: number, y: number] = [1.2, 0.6];
/** Summed plane area over field area: on average each point is under this many planes. */
const COVERAGE = 2;
/** Area relative to the mean at the bottom and top of the stack. */
const AREA_TAPER: [bottom: number, top: number] = [1.5, 0.6];
const MAX_PLANE_ASPECT = 3;
/** Radians around the base angle (or base + 90°). */
const ANGLE_JITTER = 0.35;
/** Each corner moves along its diagonal by a factor in this range. */
const CORNER_JITTER: [min: number, max: number] = [0.8, 1.12];
/** How far a torn edge wanders at roughness 1, and the noise it follows. */
const TEAR_AMP = 0.012;
const TEAR_FREQ = 45;
const TEAR_OCTAVES = 4;
/** Paper rim along a torn edge, at roughness 1. */
const RIM_WIDTH = 0.004;
const RIM_STRENGTH = 0.5;
const PAPER_SRGB: Rgb = [0.95, 0.93, 0.88];
/** Antialiasing half width, output pixels. */
const AA_PIXELS = 0.75;
/** Edge half width added at blend 1, composition units: a slight blur of the line, not the planes. */
const BLEND_MAX = 0.012;
const PLANES_SALT = 0x71;
const PLANE_KEY_STEP = 0x85ebca6b;
const OCTAVE_KEY_STEP = 0x632be5ab;

const PAPER: Rgb = [srgbDecode(PAPER_SRGB[0]), srgbDecode(PAPER_SRGB[1]), srgbDecode(PAPER_SRGB[2])];

/** Constants the shader shares, as #defines. */
export const PLANES_SHADER_CONSTANTS = {
  MAX_PLANES,
  TEAR_FREQ: glslFloat(TEAR_FREQ),
  TEAR_OCTAVES,
  RIM_WIDTH: glslFloat(RIM_WIDTH),
  PAPER_COLOR: `vec3(${PAPER.map((c) => c.toFixed(6)).join(', ')})`,
  PLANE_KEY_STEP: `0x${PLANE_KEY_STEP.toString(16)}u`,
  OCTAVE_KEY_STEP: `0x${OCTAVE_KEY_STEP.toString(16)}u`,
};

function glslFloat(x: number): string {
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

/** Colors are linear sRGB; lengths are composition units. */
export interface PreparedPlanes {
  count: number;
  background: Rgb;
  /**
   * Per plane, 4 × (nx, ny, c) with n the unit inward normal: dot(n, p) - c is
   * the distance inside that edge. The quads are convex.
   */
  edges: Float64Array;
  /** Bounding circle per plane: x, y, radius. */
  bounds: Float64Array;
  colors: Float64Array;
  colorIndex: number[];
  backgroundIndex: number;
  corners: Float64Array;
  /** Torn-edge noise key of plane 0. */
  key: number;
  tear: number;
  rim: number;
  /** Half width of the edge transition: antialiasing plus blend. */
  soft: number;
}

export function planeCount(count: number): number {
  const c = clamp01(Number.isFinite(count) ? count : 0.5);
  return Math.round(PLANE_COUNT[0] + (PLANE_COUNT[1] - PLANE_COUNT[0]) * c);
}

type Vec2 = [number, number];

function isConvexCcw(c: Vec2[]): boolean {
  for (let k = 0; k < c.length; k++) {
    const [ax, ay] = c[k];
    const [bx, by] = c[(k + 1) % c.length];
    const [cx, cy] = c[(k + 2) % c.length];
    if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) <= 0) return false;
  }
  return true;
}

/** Corners of one plane: a jittered rectangle, rotated and placed. */
function planeCorners(rng: ReturnType<typeof createRng>, area: number, angle: number, center: Vec2): Vec2[] {
  const aspect = rng.range(1, MAX_PLANE_ASPECT);
  const hw = Math.sqrt(area * aspect) / 2;
  const hh = Math.sqrt(area / aspect) / 2;
  const rect: Vec2[] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ];
  // Draw all jitters first so the sequence doesn't depend on the convexity check.
  const jitter = rect.map(() => rng.range(CORNER_JITTER[0], CORNER_JITTER[1]));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const place = (pts: Vec2[], scale: number[]): Vec2[] =>
    pts.map(([x, y], k) => [center[0] + scale[k] * (cos * x - sin * y), center[1] + scale[k] * (sin * x + cos * y)]);
  const jittered = place(rect, jitter);
  return isConvexCcw(jittered) ? jittered : place(rect, [1, 1, 1, 1]);
}

export function preparePlanes(planes: PlanesPattern, output: OutputSize): PreparedPlanes {
  const k = planes.colors.length;
  if (k < 1 || k > MAX_STOPS) throw new RangeError(`Planes need 1 to ${MAX_STOPS} colors, got ${k}.`);
  const seed = planes.seed >>> 0;
  const rng = createRng(seed);
  const n = planeCount(planes.count);
  const palette = planes.colors.map((c) => gamutMapToLinearSrgb(c));

  const baseAngle = rng.range(0, Math.PI);
  const meanArea = (COVERAGE * 4 * FIELD[0] * FIELD[1]) / n;
  // Stratified across the field's width so the planes don't bunch up; the slots are dealt out in random order.
  const slots = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  const backgroundIndex = rng.int(k);
  const colorIndex: number[] = [];
  const edges = new Float64Array(n * 12);
  const bounds = new Float64Array(n * 3);
  const colors = new Float64Array(n * 3);
  const corners = new Float64Array(n * 8);
  let previous = backgroundIndex;
  for (let i = 0; i < n; i++) {
    const depth = n > 1 ? i / (n - 1) : 0;
    const area = meanArea * (AREA_TAPER[0] + (AREA_TAPER[1] - AREA_TAPER[0]) * depth) * rng.range(0.7, 1.3);
    const angle = baseAngle + (rng.next() < 0.5 ? 0 : Math.PI / 2) + rng.range(-ANGLE_JITTER, ANGLE_JITTER);
    const center: Vec2 = [-FIELD[0] + ((slots[i] + rng.next()) / n) * 2 * FIELD[0], rng.range(-FIELD[1], FIELD[1])];
    const c = planeCorners(rng, area, angle, center);
    let radius = 0;
    for (let e = 0; e < 4; e++) {
      const [ax, ay] = c[e];
      const [bx, by] = c[(e + 1) % 4];
      const len = Math.hypot(bx - ax, by - ay);
      const nx = -(by - ay) / len;
      const ny = (bx - ax) / len;
      edges.set([nx, ny, nx * ax + ny * ay], i * 12 + e * 3);
      corners.set([ax, ay], i * 8 + e * 2);
      radius = Math.max(radius, Math.hypot(ax - center[0], ay - center[1]));
    }
    bounds.set([center[0], center[1], radius], i * 3);
    // Never the color of the plane just below in the stack (or the background, for the first).
    const index = k === 1 ? 0 : (previous + 1 + rng.int(k - 1)) % k;
    colorIndex.push(index);
    colors.set(palette[index], i * 3);
    previous = index;
  }

  const roughness = clamp01(Number.isFinite(planes.roughness) ? planes.roughness : 0);
  const blend = clamp01(Number.isFinite(planes.blend) ? planes.blend : 0);
  return {
    count: n,
    background: palette[backgroundIndex],
    edges,
    bounds,
    colors,
    colorIndex,
    backgroundIndex,
    corners,
    key: hashKey(seed, PLANES_SALT),
    tear: TEAR_AMP * roughness,
    // A soft edge has no torn paper to show.
    rim: RIM_STRENGTH * roughness * (1 - blend),
    soft: AA_PIXELS / output.height + BLEND_MAX * blend,
  };
}

/** Smooth value noise on the integer lattice, [0, 1). */
function valueNoise(x: number, y: number, key: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash1(ix, iy, key);
  const b = hash1(ix + 1, iy, key);
  const c = hash1(ix, iy + 1, key);
  const d = hash1(ix + 1, iy + 1, key);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

const NOISE_MAX = 1e4;

/** Torn-edge noise, value fBm in [-1, 1]. */
export function tearNoise(x: number, y: number, key: number): number {
  let px = Math.min(NOISE_MAX, Math.max(-NOISE_MAX, x * TEAR_FREQ));
  let py = Math.min(NOISE_MAX, Math.max(-NOISE_MAX, y * TEAR_FREQ));
  let sum = 0;
  let amp = 1;
  for (let i = 0; i < TEAR_OCTAVES; i++) {
    sum += amp * (2 * valueNoise(px, py, (key + Math.imul(i, OCTAVE_KEY_STEP)) >>> 0) - 1);
    const nx = (0.8 * px - 0.6 * py) * 2;
    const ny = (0.6 * px + 0.8 * py) * 2;
    px = nx;
    py = ny;
    amp *= 0.5;
  }
  return sum / (2 - Math.pow(0.5, TEAR_OCTAVES - 1));
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Linear sRGB of the collage at pattern-space point (x, y). */
export function evaluatePlanes(p: PreparedPlanes, x: number, y: number): Rgb {
  const rgb: Rgb = [...p.background];
  const reach = p.tear + p.soft;
  // Beyond this distance inside, the noise can't bring the edge, its softness or its rim near.
  const near = p.tear + Math.max(RIM_WIDTH, p.soft);
  for (let i = 0; i < p.count; i++) {
    const b = i * 3;
    if (Math.hypot(x - p.bounds[b], y - p.bounds[b + 1]) > p.bounds[b + 2] + reach) continue;
    const e = i * 12;
    let d = Infinity;
    for (let k = 0; k < 4; k++)
      d = Math.min(d, p.edges[e + k * 3] * x + p.edges[e + k * 3 + 1] * y - p.edges[e + k * 3 + 2]);
    if (d < -reach) continue;
    let rim = 0;
    if (d < near) {
      if (p.tear > 0) d += p.tear * tearNoise(x, y, (p.key + Math.imul(i, PLANE_KEY_STEP)) >>> 0);
      rim = p.rim * (1 - smoothstep(0, RIM_WIDTH, d));
    }
    const cover = smoothstep(-p.soft, p.soft, d);
    for (let c = 0; c < 3; c++) {
      const color = p.colors[b + c] + (PAPER[c] - p.colors[b + c]) * rim;
      rgb[c] += (color - rgb[c]) * cover;
    }
  }
  return rgb;
}
