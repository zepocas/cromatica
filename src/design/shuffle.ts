import { oklchDistance } from '../color/gamut';
import { type GeneratedPalette, generatePalette, type PaletteInfo, type PaletteOptions } from '../color/harmony';
import type { Oklch } from '../color/types';
import { applyMat2, clampZoom, transformMatrix } from '../engine/transform';
import { clamp } from '../math';
import {
  type ColorStop,
  type Design,
  type RampGradient,
  MAX_MESH_POINTS,
  MAX_STOPS,
  type MeshPoint,
  type PointMesh,
  type Transform,
  type Warp,
  WARP_SHAPES,
  type WarpShape,
} from './design';
import { createRng, pickWeighted, type Rng } from './random';

export interface ShuffleOptions {
  /** Replace stop/point colors with a new palette. */
  colors: boolean;
  /** Steers the new palette when `colors` is set. */
  palette?: PaletteOptions;
  /** Re-randomize layout: mesh points + radii (or gradient angle + stop positions), mesh sharpness, warp shape/amount/size/seed. */
  layout: boolean;
  seed: number;
}

export interface ShuffleResult {
  design: Design;
  /** Rule, mood and key of the new palette; null when colors weren't shuffled. */
  palette: PaletteInfo | null;
}

/** What shuffleMesh and shuffleRamp draw from. */
interface ShuffleContext {
  opts: ShuffleOptions;
  aspect: number;
  colorRng: Rng;
  layoutRng: Rng;
  /** A palette for n colors, from the color stream and the palette options. */
  makePalette: (n: number) => GeneratedPalette;
}

type Range = [min: number, max: number];

/**
 * Per-shape warp ranges for shuffle. First guesses, to be tuned against the
 * warp contact sheet. weight is relative; 'none' is kept at ~5%.
 */
export const WARP_SHUFFLE_TABLE: Record<WarpShape, { weight: number; amount: Range; size: Range }> = {
  none: { weight: 0.65, amount: [0, 0], size: [0.5, 0.5] },
  domain: { weight: 1.2, amount: [0.2, 0.55], size: [0.2, 0.5] },
  fbm: { weight: 1, amount: [0.2, 0.5], size: [0.2, 0.55] },
  simplex: { weight: 1, amount: [0.2, 0.55], size: [0.2, 0.55] },
  waves: { weight: 1, amount: [0.2, 0.55], size: [0.15, 0.5] },
  rows: { weight: 0.8, amount: [0.25, 0.65], size: [0.2, 0.6] },
  columns: { weight: 0.8, amount: [0.25, 0.65], size: [0.2, 0.6] },
  circular: { weight: 0.8, amount: [0.15, 0.45], size: [0.2, 0.55] },
  oval: { weight: 0.8, amount: [0.2, 0.55], size: [0.2, 0.55] },
  worley: { weight: 0.8, amount: [0.15, 0.45], size: [0.2, 0.5] },
  voronoi: { weight: 0.8, amount: [0.2, 0.55], size: [0.2, 0.5] },
  curl: { weight: 1, amount: [0.2, 0.55], size: [0.2, 0.5] },
  ridged: { weight: 1, amount: [0.2, 0.5], size: [0.2, 0.5] },
  marble: { weight: 0.8, amount: [0.3, 0.7], size: [0.2, 0.5] },
  bristle: { weight: 0.8, amount: [0.3, 0.7], size: [0.2, 0.5] },
  smudge: { weight: 0.8, amount: [0.3, 0.7], size: [0.2, 0.5] },
};

export const MESH_SHUFFLE = {
  /** Sharpness range (0 = haze, 1 = blobby). */
  sharpness: [0.1, 0.5] as Range,
  /** Radius as a fraction of the mean point spacing sqrt(frameArea / n). */
  radius: [0.5, 0.85] as Range,
  /** Points are sampled in the frame scaled by this factor, so a few sit just outside. */
  overscan: 1.15,
  /** Probability of changing the point count by ±1 (only when colors are shuffled too). */
  countChange: 0.35,
  /** Best-candidate samples per point (Mitchell); higher = more even spacing. */
  candidates: 10,
  /** How close to (or past) the frame edge a point may sit before it is penalised, in spacings. */
  edgeSlack: 0.55,
};

export const RAMP_SHUFFLE = {
  /** Minimum gap between adjacent stop positions. */
  minGap: 0.08,
  /** Ranges of the first and last stop positions. */
  first: [0, 0.12] as Range,
  last: [0.88, 1] as Range,
};

// Independent streams, so locking one aspect doesn't change what the other produces for the same seed.
const COLOR_STREAM = 0x9e3779b9;
const LAYOUT_STREAM = 0x85ebca6b;

/** Shuffled mesh radii stay in this range (composition units). */
const RADIUS_LIMITS: Range = [0.05, 2];

const WARP_WEIGHTS = Object.fromEntries(WARP_SHAPES.map((k) => [k, WARP_SHUFFLE_TABLE[k].weight])) as Record<
  WarpShape,
  number
>;

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
const copyColor = (c: Oklch): Oklch => [c[0], c[1], c[2]];

/**
 * Pure: a new design with fresh colors and/or layout, deterministic for
 * (design, opts, aspect). Keeps the pattern kind, grain and finish. Mesh layouts keep
 * points mostly inside the frame of the given aspect and avoid clumping; when
 * both colors and layout are shuffled, the point count may change by ±1.
 */
export function shuffleDesign(design: Design, opts: ShuffleOptions, aspect = 16 / 9): ShuffleResult {
  const seed = opts.seed >>> 0;
  const colorRng = createRng((seed ^ COLOR_STREAM) >>> 0);
  const ctx: ShuffleContext = {
    opts,
    aspect: Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9,
    colorRng,
    layoutRng: createRng((seed ^ LAYOUT_STREAM) >>> 0),
    makePalette: (n) => generatePalette(colorRng, n, opts.palette),
  };
  const shuffled = design.base.kind === 'mesh' ? shuffleMesh(design.base, ctx) : shuffleRamp(design.base, ctx);
  let base = shuffled.pattern;
  if (base.kind === 'mesh' && opts.layout && design.transform) base = toPatternSpace(base, design.transform);
  const warp = opts.layout ? shuffleWarp(ctx.layoutRng) : { ...design.warp };
  const out: Design = { engineVersion: design.engineVersion, base, warp, grain: { ...design.grain } };
  if (design.transform) out.transform = { ...design.transform };
  if (design.finish) out.finish = { ...design.finish };
  return { design: out, palette: shuffled.palette };
}

function paletteInfo({ rule, mood, key }: GeneratedPalette): PaletteInfo {
  return { rule, mood, key };
}

function shuffleWarp(rng: Rng): Warp {
  const shape = pickWeighted(rng, WARP_WEIGHTS);
  const t = WARP_SHUFFLE_TABLE[shape];
  return {
    shape,
    amount: round4(rng.range(t.amount[0], t.amount[1])),
    size: round4(rng.range(t.size[0], t.size[1])),
    seed: rng.uint32(),
  };
}

/** Best-candidate (Mitchell) sampling over the overscanned frame: even, not grid-like. */
function layoutPoints(rng: Rng, n: number, aspect: number): [number, number][] {
  const fw = aspect / 2;
  const hw = fw * MESH_SHUFFLE.overscan;
  const hh = 0.5 * MESH_SHUFFLE.overscan;
  const spacing = Math.sqrt(aspect / n);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let best: [number, number] = [0, 0];
    let bestD = -1;
    const k = i === 0 ? 1 : MESH_SHUFFLE.candidates;
    for (let j = 0; j < k; j++) {
      const c: [number, number] = [rng.range(-hw, hw), rng.range(-hh, hh)];
      let d = Infinity;
      for (const p of pts) d = Math.min(d, Math.hypot(c[0] - p[0], c[1] - p[1]));
      // Plain best-candidate piles points onto the border; treat the frame edge as a soft neighbour.
      const edge = Math.min(fw - Math.abs(c[0]), 0.5 - Math.abs(c[1]));
      d = Math.min(d, MESH_SHUFFLE.edgeSlack * spacing + 2 * edge);
      if (d > bestD) {
        best = c;
        bestD = d;
      }
    }
    pts.push(best);
  }
  return pts;
}

/** Greedy assignment so that nearby points get dissimilar colors. */
function assignMeshColors(points: { x: number; y: number }[], palette: Oklch[], spacing: number): Oklch[] {
  const left = palette.map(copyColor);
  const out: Oklch[] = [];
  for (let i = 0; i < points.length; i++) {
    let bestK = 0;
    let bestScore = -Infinity;
    for (let k = 0; k < left.length; k++) {
      let score = 0;
      for (let j = 0; j < i; j++) {
        const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) / spacing;
        // Close neighbours dominate; a similar color right next door is penalised hard.
        score += Math.exp(-d * d) * Math.min(oklchDistance(left[k], out[j]), 0.25);
      }
      if (score > bestScore + 1e-12) {
        bestScore = score;
        bestK = k;
      }
    }
    out.push(left.splice(bestK, 1)[0]);
  }
  return out;
}

function shuffleMesh(base: PointMesh, ctx: ShuffleContext): { pattern: PointMesh; palette: PaletteInfo | null } {
  const { opts, aspect, layoutRng } = ctx;
  let n = base.points.length;
  if (opts.layout && opts.colors && layoutRng.next() < MESH_SHUFFLE.countChange) {
    n = clamp(n + (layoutRng.next() < 0.5 ? -1 : 1), Math.min(2, n), MAX_MESH_POINTS);
  }
  const spacing = Math.sqrt(aspect / n);

  let geo: { x: number; y: number; radius: number }[];
  let sharpness = base.sharpness;
  if (opts.layout) {
    geo = layoutPoints(layoutRng, n, aspect).map(([x, y]) => ({
      x: round4(x),
      y: round4(y),
      radius: round4(clamp(spacing * layoutRng.range(...MESH_SHUFFLE.radius), ...RADIUS_LIMITS)),
    }));
    sharpness = round4(layoutRng.range(...MESH_SHUFFLE.sharpness));
  } else {
    geo = base.points.map((p) => ({ x: p.x, y: p.y, radius: p.radius }));
  }

  const palette = opts.colors ? ctx.makePalette(n) : null;
  const colors = palette ? assignMeshColors(geo, palette.colors, spacing) : base.points.map((p) => copyColor(p.color));
  const points: MeshPoint[] = geo.map((g, i) => ({ ...g, color: colors[i] }));
  return { pattern: { kind: 'mesh', points, sharpness }, palette: palette && paletteInfo(palette) };
}

/** Layouts are made on screen; map them under the transform so they land in view. */
function toPatternSpace(mesh: PointMesh, transform: Transform): PointMesh {
  const m = transformMatrix(transform);
  const zoom = clampZoom(transform.zoom);
  const points = mesh.points.map((p) => {
    const [x, y] = applyMat2(m, p.x, p.y);
    return { ...p, x: round4(x), y: round4(y), radius: round4(p.radius / zoom) };
  });
  return { ...mesh, points };
}

function stopPositions(rng: Rng, n: number): number[] {
  const first = rng.range(RAMP_SHUFFLE.first[0], RAMP_SHUFFLE.first[1]);
  const last = rng.range(RAMP_SHUFFLE.last[0], RAMP_SHUFFLE.last[1]);
  if (n === 1) return [first];
  const step = (last - first) / (n - 1);
  // Jitter interior stops by at most this much so that gaps stay >= minGap.
  const jitter = Math.max(0, (step - RAMP_SHUFFLE.minGap) / 2);
  return Array.from({ length: n }, (_, i) =>
    round4(i === 0 || i === n - 1 ? first + i * step : first + i * step + rng.range(-jitter, jitter)),
  );
}

function shuffleRamp(base: RampGradient, ctx: ShuffleContext): { pattern: RampGradient; palette: PaletteInfo | null } {
  const { opts, colorRng, layoutRng } = ctx;
  const n = Math.min(base.stops.length, MAX_STOPS);
  const stops = base.stops.slice(0, n);
  const angle = opts.layout ? Math.round(layoutRng.range(0, 360)) % 360 : base.angle;
  const positions = opts.layout ? stopPositions(layoutRng, n) : stops.map((s) => s.position);

  const palette = opts.colors ? ctx.makePalette(n) : null;
  let colors: Oklch[];
  if (palette) {
    // Lightness ramp reads well; direction random.
    colors = palette.colors.sort((a, b) => a[0] - b[0]);
    if (colorRng.next() < 0.5) colors.reverse();
  } else {
    colors = stops.map((s) => copyColor(s.color));
  }

  const out: ColorStop[] = stops.map((s, i) => ({ position: positions[i], color: colors[i], blend: s.blend }));
  return { pattern: { kind: base.kind, angle, stops: out }, palette: palette && paletteInfo(palette) };
}
