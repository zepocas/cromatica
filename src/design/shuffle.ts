import { oklchDistance } from '../color/gamut';
import { type GeneratedPalette, generatePalette, type PaletteInfo, type PaletteOptions } from '../color/harmony';
import type { Oklch } from '../color/types';
import { applyMat2, clampZoom, transformMatrix } from '../engine/transform';
import { clamp } from '../math';
import {
  type BasePattern,
  type ColorStop,
  type Design,
  type Finish,
  type RampGradient,
  MAX_MESH_POINTS,
  MAX_STOPS,
  type MeshPoint,
  type PlanesPattern,
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
  /** With `layout`: also pick the pattern kind and the finishes (the app's main shuffle). */
  style?: boolean;
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
};

export const MESH_SHUFFLE = {
  /** Sharpness range (0 = haze, 1 = blobby). */
  sharpness: [0.1, 0.8] as Range,
  /** Radius as a fraction of the mean point spacing sqrt(frameArea / n). */
  radius: [0.4, 1.05] as Range,
  /** Probability that one point is made dominant, and its radius factor. */
  dominant: 0.4,
  dominantScale: 1.6,
  /** Points are sampled in the frame scaled by this factor, so a few sit just outside. */
  overscan: 1.15,
  /** Probability of changing the point count by ±1 (only when colors are shuffled too). */
  countChange: 0.35,
  /** Best-candidate samples per point (Mitchell), drawn per shuffle: fewer = looser, less even layouts. */
  candidates: [3, 10] as Range,
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

export const PLANES_SHUFFLE = {
  /** Count range of a shuffled layout. Roughness and blend are kept: they are deliberate choices. */
  count: [0.15, 0.65] as Range,
};

/** Style shuffle: how often each pattern kind comes up, and the finishes' odds and ranges. */
export const STYLE_SHUFFLE = {
  kinds: { mesh: 0.35, linear: 0.15, radial: 0.1, conic: 0.1, planes: 0.3 } as Record<BasePattern['kind'], number>,
  vignette: { chance: 0.3, range: [0.2, 0.6] as Range },
  print: { chance: 0.25, range: [0.2, 0.7] as Range },
  /** Not for planes, which are flat already. */
  bands: { chance: 0.15, range: [0.2, 0.7] as Range },
  planesRoughness: { clean: 0.25, range: [0.3, 1] as Range },
  planesBlend: { chance: 0.3, range: [0.2, 0.8] as Range },
};

// Independent streams, so locking one aspect doesn't change what the other produces for the same seed.
const COLOR_STREAM = 0x9e3779b9;
const LAYOUT_STREAM = 0x85ebca6b;
const STYLE_STREAM = 0xc2b2ae35;

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
  let b = design.base;
  let finish = design.finish;
  if (opts.layout && opts.style) {
    const styleRng = createRng((seed ^ STYLE_STREAM) >>> 0);
    b = withKind(b, pickWeighted(styleRng, STYLE_SHUFFLE.kinds));
    if (b.kind === 'planes') b = { ...b, ...shufflePlanesStyle(styleRng) };
    finish = shuffleFinish(styleRng, b.kind === 'planes');
  }
  const shuffled =
    b.kind === 'mesh' ? shuffleMesh(b, ctx) : b.kind === 'planes' ? shufflePlanes(b, ctx) : shuffleRamp(b, ctx);
  let base = shuffled.pattern;
  if (base.kind === 'mesh' && opts.layout && design.transform) base = toPatternSpace(base, design.transform);
  const warp = opts.layout ? shuffleWarp(ctx.layoutRng) : { ...design.warp };
  const out: Design = { engineVersion: design.engineVersion, base, warp, grain: { ...design.grain } };
  if (design.transform) out.transform = { ...design.transform };
  if (finish) out.finish = { ...finish };
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
function layoutPoints(rng: Rng, n: number, aspect: number, candidates: number): [number, number][] {
  const fw = aspect / 2;
  const hw = fw * MESH_SHUFFLE.overscan;
  const hh = 0.5 * MESH_SHUFFLE.overscan;
  const spacing = Math.sqrt(aspect / n);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let best: [number, number] = [0, 0];
    let bestD = -1;
    const k = i === 0 ? 1 : candidates;
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
    const [minK, maxK] = MESH_SHUFFLE.candidates;
    const candidates = minK + layoutRng.int(maxK - minK + 1);
    const dominant = layoutRng.next() < MESH_SHUFFLE.dominant ? layoutRng.int(n) : -1;
    geo = layoutPoints(layoutRng, n, aspect, candidates).map(([x, y], i) => {
      const scale = i === dominant ? MESH_SHUFFLE.dominantScale : 1;
      const radius = spacing * scale * layoutRng.range(...MESH_SHUFFLE.radius);
      return { x: round4(x), y: round4(y), radius: round4(clamp(radius, ...RADIUS_LIMITS)) };
    });
    sharpness = round4(layoutRng.range(...MESH_SHUFFLE.sharpness));
  } else {
    geo = base.points.map((p) => ({ x: p.x, y: p.y, radius: p.radius }));
  }

  const palette = opts.colors ? ctx.makePalette(n) : null;
  const colors = palette ? assignMeshColors(geo, palette.colors, spacing) : base.points.map((p) => copyColor(p.color));
  const points: MeshPoint[] = geo.map((g, i) => ({ ...g, color: colors[i] }));
  return { pattern: { kind: 'mesh', points, sharpness }, palette: palette && paletteInfo(palette) };
}

function baseColors(base: BasePattern): Oklch[] {
  if (base.kind === 'mesh') return base.points.map((p) => copyColor(p.color));
  if (base.kind === 'planes') return base.colors.map(copyColor);
  return base.stops.map((s) => copyColor(s.color));
}

/**
 * The same colors as a pattern of another kind. Geometry is a placeholder: the
 * layout shuffle that follows replaces it. Ramps keep their stops between kinds.
 */
function withKind(base: BasePattern, kind: BasePattern['kind']): BasePattern {
  if (kind === base.kind) return base;
  const colors = baseColors(base);
  if (kind === 'mesh') {
    return { kind, sharpness: 0.35, points: colors.map((color) => ({ x: 0, y: 0, radius: 0.4, color })) };
  }
  const n = Math.min(colors.length, MAX_STOPS);
  if (kind === 'planes') return { kind, colors: colors.slice(0, n), count: 0.4, roughness: 0.5, blend: 0, seed: 0 };
  if (base.kind !== 'mesh' && base.kind !== 'planes') return { ...base, kind };
  const ramp = n === 1 ? [colors[0], colors[0]] : colors.slice(0, n);
  const stops = ramp.map((color, i) => ({ position: i / (ramp.length - 1), color, blend: 'oklab' as const }));
  return { kind, angle: 0, stops };
}

function shufflePlanesStyle(rng: Rng): Pick<PlanesPattern, 'roughness' | 'blend'> {
  const { planesRoughness: r, planesBlend: b } = STYLE_SHUFFLE;
  return {
    roughness: rng.next() < r.clean ? 0 : round4(rng.range(...r.range)),
    blend: rng.next() < b.chance ? round4(rng.range(...b.range)) : 0,
  };
}

function shuffleFinish(rng: Rng, flat: boolean): Finish {
  const s = STYLE_SHUFFLE;
  const maybe = (f: { chance: number; range: Range }) => (rng.next() < f.chance ? round4(rng.range(...f.range)) : 0);
  const vignette = maybe(s.vignette);
  const print = maybe(s.print);
  const bands = maybe(s.bands);
  return { vignette, print, bands: flat ? 0 : bands, bandEdge: round4(rng.next()) };
}

/** Planes: a new layout is a new seed (and count); new colors are a palette of the same size. */
function shufflePlanes(
  base: PlanesPattern,
  ctx: ShuffleContext,
): { pattern: PlanesPattern; palette: PaletteInfo | null } {
  const { opts, layoutRng } = ctx;
  const count = opts.layout ? round4(layoutRng.range(...PLANES_SHUFFLE.count)) : base.count;
  const seed = opts.layout ? layoutRng.uint32() : base.seed;
  const n = Math.min(base.colors.length, MAX_STOPS);
  const palette = opts.colors ? ctx.makePalette(n) : null;
  const colors = palette ? palette.colors : base.colors.slice(0, n).map(copyColor);
  return {
    pattern: { kind: 'planes', colors, count, roughness: base.roughness, blend: base.blend, seed },
    palette: palette && paletteInfo(palette),
  };
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
