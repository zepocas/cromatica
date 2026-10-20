import { oklchDistance } from '../color/gamut';
import { type GeneratedPalette, generatePalette, type PaletteInfo, type PaletteOptions } from '../color/harmony';
import type { Oklch } from '../color/types';
import { applyMat2, clampZoom, transformMatrix } from '../engine/transform';
import { clamp } from '../math';
import {
  AURORA_BLEND,
  type AuroraPattern,
  type BlobsPattern,
  type BasePattern,
  type GridMesh,
  MAX_GRID,
  MIN_GRID,
  type ColorStop,
  type Design,
  type Finish,
  identityTransform,
  type RampGradient,
  MAX_MESH_POINTS,
  MAX_STOPS,
  noFinish,
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
  /** With `layout`: also pick the pattern kind (the app's main shuffle). Unless `finish` is given, also the finishes. */
  style?: boolean;
  /** Re-roll the finishes (noise, vignette, bands, lighting) on their own, whatever `layout` says (D64). */
  finish?: boolean;
  /** Re-roll the warp's amount and size, whatever else is rolled; default: with `layout`. The shape and seed follow `layout` (D64). */
  levels?: boolean;
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
  /** Half width and height of the visible frame in pattern space: the frame turned and scaled by the transform. */
  extent: [number, number];
  colorRng: Rng;
  layoutRng: Rng;
  /** A palette for n colors, from the color stream and the palette options. */
  makePalette: (n: number) => GeneratedPalette;
  /** The surprise slot (D76): this shuffle draws from the pre-tuning tables. */
  surprise: boolean;
}

type Range = [min: number, max: number];

/** Per-shape warp ranges for shuffle. weight is relative; 'none' is kept at ~5%. */
export const WARP_SHUFFLE_TABLE: Record<WarpShape, { weight: number; amount: Range; size: Range }> = {
  none: { weight: 0.65, amount: [0, 0], size: [0.5, 0.5] },
  domain: { weight: 1.2, amount: [0.08, 0.85], size: [0, 0.4] },
  fbm: { weight: 0.8, amount: [0.08, 0.8], size: [0, 0.4] },
  simplex: { weight: 1, amount: [0.08, 0.85], size: [0, 0.4] },
  waves: { weight: 1.2, amount: [0.08, 0.85], size: [0, 0.4] },
  rows: { weight: 0.8, amount: [0.13, 0.9], size: [0, 0.4] },
  columns: { weight: 0.8, amount: [0.13, 0.9], size: [0, 0.4] },
  circular: { weight: 0.8, amount: [0.08, 0.75], size: [0, 0.4] },
  oval: { weight: 0.8, amount: [0.08, 0.85], size: [0, 0.4] },
  worley: { weight: 0.8, amount: [0.08, 0.75], size: [0, 0.4] },
  voronoi: { weight: 0.8, amount: [0.35, 0.85], size: [0, 0.4] },
  curl: { weight: 1.2, amount: [0.08, 0.85], size: [0, 0.4] },
  ridged: { weight: 0.7, amount: [0.08, 0.8], size: [0, 0.4] },
  marble: { weight: 0.6, amount: [0.18, 0.9], size: [0, 0.15] },
  bristle: { weight: 0.4, amount: [0.18, 0.9], size: [0, 0.4] },
};

export type MeshComposition = 'scatter' | 'clusters' | 'line' | 'arc' | 'side';

export const MESH_SHUFFLE = {
  /** Sharpness range (0 = haze, 1 = blobby); haze is rare (D76). */
  sharpness: [0.45, 0.9] as Range,
  sharpnessFlat: [0.1, 0.8] as Range,
  /** Radius as a fraction of the mean point spacing sqrt(frameArea / n): tighter blobs read less soft (D76). */
  radius: [0.3, 0.85] as Range,
  radiusFlat: [0.4, 1.05] as Range,
  /** Probability that one point is made dominant, and its radius factor: a big field with accents, not even blobs (D76). */
  dominant: 0.5,
  dominantScale: 1.7,
  dominantFlat: 0.4,
  dominantScaleFlat: 1.6,
  /** Points are sampled in the frame scaled by this factor, so a few sit just outside. */
  overscan: 1.3,
  overscanFlat: 1.15,
  /** Probability of changing the point count by ±1 (only when colors are shuffled too). */
  countChange: 0.35,
  /** Best-candidate samples per point (Mitchell), drawn per shuffle: fewer = looser, less even layouts. */
  candidates: [3, 6] as Range,
  candidatesFlat: [3, 10] as Range,
  /** How close to (or past) the frame edge a point may sit before it is penalised, in spacings. */
  edgeSlack: 0.55,
  /** No two points closer than this many spacings, even in a loose layout. */
  minGap: 0.3,
  /** Compositions a layout shuffle draws from (D76); scatter alone gave every mesh the same evenly sprinkled field. */
  compositionsFlat: { scatter: 1, clusters: 0, line: 0, arc: 0, side: 0 } as Record<MeshComposition, number>,
  compositions: { scatter: 0.2, clusters: 0.25, line: 0.15, arc: 0.15, side: 0.25 } as Record<MeshComposition, number>,
};

export const RAMP_SHUFFLE = {
  /** Minimum gap between adjacent stop positions. */
  minGap: 0.08,
  /** Ranges of the first and last stop positions. */
  first: [0, 0.12] as Range,
  last: [0.88, 1] as Range,
  /** Noise and cells: scale range per kind. A higher scale is MORE and smaller features (0.6 * 10^scale per image height). */
  scale: { cells: [0.12, 0.42] as Range, noise: [0.05, 0.28] as Range },
  scaleFlat: [0.1, 0.6] as Range,
  /** Noise: share of contour against ridged (D83); the surprise slot keeps an even split. */
  contourShare: 0.65,
};

export const PLANES_SHUFFLE = {
  /** Count range of a shuffled layout. Roughness and blend are kept: they are deliberate choices. */
  count: [0.36, 0.8667] as Range,
  /** Zoom-in for planes: how often a shuffle draws one, and how far (fewer, larger planes). */
  zoomChance: 0.85,
  zoom: [1.7, 2.6] as Range,
  countFlat: [0.4, 1] as Range,
};

export const GRID_SHUFFLE = {
  /** Rows and columns are drawn from this range (inclusive). */
  size: [3, 4] as Range,
  /** Node jitter, as a fraction of the cell size. Edge nodes slide along their edge; corners stay put. */
  jitter: 0.35,
  /** Palette colors dealt over the nodes. */
  colors: 5,
  /** Lines along the bent grid (D62): how often a layout shuffle draws them, and how strong. */
  lines: { chance: 0.6, range: [0.25, 0.7] as Range },
};

export const AURORA_SHUFFLE = {
  count: [0.1, 0.8] as Range,
  glow: [0.2, 0.8] as Range,
  blend: [0.1, 0.6] as Range,
};

/** A shuffled blobs palette has at least this many colors: the background and three inks. */
const BLOBS_MIN_COLORS = 4;

export const BLOBS_SHUFFLE = {
  count: [0.3, 0.75] as Range,
  size: [0.3, 0.7] as Range,
  wobble: [0.3, 0.9] as Range,
  /** The dot size follows the slider squared (D90): below about 0.4 the dots are near a pixel. */
  grain: [0.45, 0.85] as Range,
  /** How often a shuffle turns the stipple off (grain 0, smooth ink). */
  smooth: 0.15,
  /** How often a shuffle gives the blobs a body in their palette color, not black. */
  palette: 0.4,
};

/** Style shuffle: how often each pattern kind comes up, and the finishes' odds and ranges. */
export const STYLE_SHUFFLE = {
  kinds: {
    mesh: 0.12,
    grid: 0.14,
    linear: 0.05,
    radial: 0.03,
    conic: 0.08,
    noise: 0.06,
    cells: 0.22,
    planes: 0.22,
    aurora: 0.08,
  } as Record<BasePattern['kind'], number>,
  kindsFlat: {
    mesh: 0.22,
    grid: 0.14,
    linear: 0.09,
    radial: 0.07,
    conic: 0.07,
    noise: 0.09,
    cells: 0.08,
    planes: 0.22,
    aurora: 0.09,
  } as Record<BasePattern['kind'], number>,
  vignette: { chance: 0.55, range: [0.2, 0.6] as Range },
  vignetteFlat: { chance: 0.3, range: [0.2, 0.6] as Range },
  print: { chance: 0.3, range: [0.1, 0.28] as Range },
  printFlat: { chance: 0.25, range: [0.15, 0.4] as Range },
  /** Not for planes, which are flat already. */
  bands: { chance: 0.4, range: [0.2, 0.7] as Range },
  bandsFlat: { chance: 0.15, range: [0.2, 0.7] as Range },
  /** Subtle. Light from the upper left. */
  relief: { chance: 0.25, range: [0.1, 0.5] as Range, light: [100, 170] as Range },
  reliefFlat: { chance: 0.3, range: [0.1, 0.5] as Range },
  halftone: { chance: 0.12, range: [0.1, 0.35] as Range },
  /** Torn edges with the paper rim hurt more than they help: rare and faint (D76). */
  planesRoughness: { clean: 0.85, range: [0.1, 0.35] as Range },
  planesRoughnessFlat: { clean: 0.25, range: [0.3, 1] as Range },
  /** A little edge softness on most planes: crisp planes read hard (D76). */
  planesBlend: { chance: 0.6, range: [0.1, 0.4] as Range },
  planesBlendFlat: { chance: 0.3, range: [0.2, 0.8] as Range },
};

// Independent streams, so locking one aspect doesn't change what the other produces for the same seed.
const COLOR_STREAM = 0x9e3779b9;
const LAYOUT_STREAM = 0x85ebca6b;
const STYLE_STREAM = 0xc2b2ae35;
const ROTATE_STREAM = 0x27d4eb2f;
const SURPRISE_STREAM = 0x165667b1;

/** Share of shuffles that ignore the tuned tables and use the flat ones (D76). */
export const SURPRISE_CHANCE = 1 / 6;

/** Whether a seed lands in the surprise slot. */
export function isSurpriseSeed(seed: number): boolean {
  return createRng(((seed >>> 0) ^ SURPRISE_STREAM) >>> 0).next() < SURPRISE_CHANCE;
}

/** Shuffled mesh radii stay in this range (composition units). */
const RADIUS_LIMITS: Range = [0.05, 2];

const WARP_WEIGHTS = Object.fromEntries(WARP_SHAPES.map((k) => [k, WARP_SHUFFLE_TABLE[k].weight])) as Record<
  WarpShape,
  number
>;

/**
 * Per-kind profiles (D76, D77): `warp` scales shape weights, `finish` the finishes' chances
 * (missing = 1). The surprise slot skips profiles.
 */
export const KIND_PROFILE: Partial<
  Record<
    BasePattern['kind'],
    {
      warp: Partial<Record<WarpShape, number>>;
      finish?: Partial<Record<FinishChance, number>>;
    }
  >
> = {
  // 60 stratified mesh tiles (D77): grain and vignette +0.74 each, adding up (neither 2.73, both 4.20); voronoi 2.43.
  mesh: { finish: { print: 2, vignette: 1.45 }, warp: { voronoi: 0.5, bristle: 0.7 } },
  // Grain helped everywhere but aurora lighting, vignette and (grid) the vignette hurt; hard-cut shapes read busy.
  grid: { finish: { print: 1.5, vignette: 0.4 }, warp: { ridged: 0.6, marble: 0.6, bristle: 0.7 } },
  linear: { finish: { print: 2, bands: 1.5, relief: 0.7 }, warp: {} },
  radial: {
    finish: { print: 2, relief: 0.5 },
    warp: { ridged: 0.5, marble: 0.5, voronoi: 0.7, rows: 1.5, columns: 1.5 },
  },
  aurora: {
    finish: { print: 1.5, relief: 0.4, vignette: 0.6 },
    warp: { marble: 0.5, ridged: 0.6, voronoi: 0, worley: 0.7, rows: 0, columns: 0 },
  },
  planes: {
    // Pooled over 127 planes tiles: grain 3.5 with vs 2.57 without, lighting 2.35 vs 2.98, vignette 3.0 vs 2.72.
    finish: { print: 2, relief: 0.4, vignette: 1.25 },
    warp: {
      rows: 0,
      columns: 0,
      voronoi: 0,
      worley: 0.4,
      ridged: 0.5,
      curl: 1.5,
      waves: 1.5,
      circular: 1.5,
      oval: 1.5,
      marble: 1.5,
    },
  },
  // Rows and columns forced on every kind (60 tiles, D79): they break the shape of aurora, planes, cells and noise
  // (23 of 26 tiles awkward, even at amount 0.2) and suit conic, radial and linear (0 of 21, mean 4.5).
  // Stratified cells sheet (D80, mean 4.13): grain +0.33 on, lighting -0.34, vignette -0.2, bands -0.21; marble 3.60.
  cells: {
    finish: { print: 1.5, relief: 0.6, vignette: 0.8, bands: 0.7 },
    warp: { rows: 0, columns: 0, voronoi: 0, ridged: 0, worley: 0.5, marble: 0.4, bristle: 0.7 },
  },
  // Stratified noise sheet (D80, 60 tiles, mean 4.10): grain +0.35 on, bands -0.32, lighting +0.13, vignette flat (D82).
  noise: {
    finish: { print: 1.5, bands: 0.7 },
    warp: { rows: 0, columns: 0, ridged: 0, worley: 0.5, marble: 0.6 },
  },
  conic: { warp: { rows: 1.5, columns: 1.5 } },
};

/** Finishes whose chance a kind profile can scale. */
type FinishChance = 'print' | 'relief' | 'vignette' | 'bands';

function kindWarpWeights(kind: BasePattern['kind']): Record<WarpShape, number> {
  const scale = KIND_PROFILE[kind]?.warp;
  if (!scale) return WARP_WEIGHTS;
  return Object.fromEntries(WARP_SHAPES.map((k) => [k, WARP_WEIGHTS[k] * (scale[k] ?? 1)])) as Record<
    WarpShape,
    number
  >;
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
const copyColor = (c: Oklch): Oklch => [c[0], c[1], c[2]];

/**
 * Pure: a new design with fresh colors and/or layout, deterministic for
 * (design, opts, aspect). Keeps the pattern kind and finish. Mesh layouts keep
 * points mostly inside the frame of the given aspect and avoid clumping; when
 * both colors and layout are shuffled, the point count may change by ±1.
 */
export function shuffleDesign(design: Design, opts: ShuffleOptions, aspect = 16 / 9): ShuffleResult {
  const seed = opts.seed >>> 0;
  const colorRng = createRng((seed ^ COLOR_STREAM) >>> 0);
  const surprise = isSurpriseSeed(seed);
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  const pickKind = opts.layout && opts.style;
  const pickFinish = opts.finish ?? pickKind;
  const styleRng = createRng((seed ^ STYLE_STREAM) >>> 0);
  // The kind is drawn even when the pattern is kept, so the finishes come out the same whether or not it is locked (D64).
  const kind =
    pickKind || pickFinish ? pickWeighted(styleRng, surprise ? STYLE_SHUFFLE.kindsFlat : STYLE_SHUFFLE.kinds) : null;
  let transform = design.transform;
  if (pickKind) {
    const rotRng = createRng((seed ^ ROTATE_STREAM) >>> 0);
    const rotate = rotRng.int(360);
    // Planes read busy at zoom 1, so most planes shuffles zoom in (D76); other kinds keep the zoom, except a leftover from planes.
    const zoomRoll = rotRng.next() < PLANES_SHUFFLE.zoomChance;
    const zoomIn = round4(rotRng.range(...PLANES_SHUFFLE.zoom));
    const current = transform?.zoom ?? 1;
    const zoom = kind === 'planes' ? (zoomRoll && !surprise ? zoomIn : 1) : design.base.kind === 'planes' ? 1 : current;
    transform = { ...(transform ?? identityTransform), rotate, zoom };
  }
  const ctx: ShuffleContext = {
    opts,
    aspect: safeAspect,
    extent: frameExtent(safeAspect, transform),
    colorRng,
    layoutRng: createRng((seed ^ LAYOUT_STREAM) >>> 0),
    makePalette: (n) => generatePalette(colorRng, n, { ...opts.palette, flat: surprise }),
    surprise,
  };
  let b = design.base;
  let finish = design.finish;
  if (kind) {
    // The planes style is drawn even when the pattern is kept (D64).
    const planesStyle = kind === 'planes' ? shufflePlanesStyle(styleRng, surprise) : null;
    if (pickKind) {
      b = withKind(b, kind);
      if (b.kind === 'planes' && planesStyle) b = { ...b, ...planesStyle };
    }
    if (pickFinish)
      finish = shuffleFinish(
        styleRng,
        b.kind === 'planes' || b.kind === 'aurora' || b.kind === 'blobs',
        surprise,
        surprise ? undefined : b.kind,
      );
  }
  const shuffled =
    b.kind === 'mesh'
      ? shuffleMesh(b, ctx)
      : b.kind === 'planes'
        ? shufflePlanes(b, ctx)
        : b.kind === 'aurora'
          ? shuffleAurora(b, ctx)
          : b.kind === 'blobs'
            ? shuffleBlobs(b, ctx)
            : b.kind === 'grid'
              ? shuffleGrid(b, ctx)
              : shuffleRamp(b, ctx);
  let base = shuffled.pattern;
  if (base.kind === 'mesh' && opts.layout && transform) base = toPatternSpace(base, transform);
  const levels = opts.levels ?? opts.layout;
  const warp =
    opts.layout || levels
      ? shuffleWarp(ctx.layoutRng, design.warp, { shape: opts.layout, levels }, ctx.surprise ? undefined : base.kind)
      : { ...design.warp };
  const out: Design = { engineVersion: design.engineVersion, base, warp };
  if (transform) out.transform = { ...transform };
  if (finish) out.finish = { ...finish, noise: { ...finish.noise } };
  return { design: out, palette: shuffled.palette };
}

/** Bounding box (half sizes) of the frame as the pattern sees it, so a bounded layout can cover it under any turn or zoom. */
function frameExtent(aspect: number, transform: Transform | undefined): [number, number] {
  const fw = aspect / 2;
  const fh = 0.5;
  if (!transform) return [fw, fh];
  const [c, s] = [
    Math.abs(Math.cos((transform.rotate * Math.PI) / 180)),
    Math.abs(Math.sin((transform.rotate * Math.PI) / 180)),
  ];
  const zoom = clampZoom(transform.zoom);
  // Quarter turns are exact (cos 90° is 6e-17, not 0).
  const snap = (x: number) => (x < 1e-9 ? 0 : x > 1 - 1e-9 ? 1 : x);
  return [(snap(c) * fw + snap(s) * fh) / zoom, (snap(s) * fw + snap(c) * fh) / zoom];
}

function paletteInfo({ rule, mood, key }: GeneratedPalette): PaletteInfo {
  return { rule, mood, key };
}

/**
 * A new warp. The shape and seed are the pattern's (kept unless `parts.shape`); the amount and size are
 * the adjust section's (kept unless `parts.levels`). Everything is drawn either way, so with both set the
 * result is the plain new warp, and a shuffle that keeps some parts rolls the rest from the same stream.
 */
function shuffleWarp(
  rng: Rng,
  current: Warp,
  parts: { shape: boolean; levels: boolean },
  kind?: BasePattern['kind'],
): Warp {
  const drawnShape = pickWeighted(rng, kind ? kindWarpWeights(kind) : WARP_WEIGHTS);
  const shape = parts.shape ? drawnShape : current.shape;
  const t = WARP_SHUFFLE_TABLE[shape];
  const amount = round4(rng.range(t.amount[0], t.amount[1]));
  const size = round4(rng.range(t.size[0], t.size[1]));
  const seed = rng.uint32();
  return {
    shape,
    // A kept amount of 0 under a new shape would show nothing: roll one then.
    amount: parts.levels || (current.amount === 0 && shape !== 'none') ? amount : current.amount,
    size: parts.levels ? size : current.size,
    seed: parts.shape ? seed : current.seed,
  };
}

/** Points for the non-scatter compositions: clusters, a line, an arc, or a mass on one side (D76). */
function composePoints(
  rng: Rng,
  n: number,
  aspect: number,
  composition: Exclude<MeshComposition, 'scatter'>,
  overscan: number,
): [number, number][] {
  const fw = aspect / 2;
  const hw = fw * overscan;
  const hh = 0.5 * overscan;
  const spacing = Math.sqrt(aspect / n);
  const pts: [number, number][] = [];
  const bell = () => rng.range(-1, 1) + rng.range(-1, 1);
  const inBox = (x: number, y: number): [number, number] => [clamp(x, -hw, hw), clamp(y, -hh, hh)];
  // A free spot: retry a few times so two points never stack.
  const place = (make: () => [number, number]) => {
    let c = make();
    for (
      let k = 0;
      k < 24 && pts.some((p) => Math.hypot(c[0] - p[0], c[1] - p[1]) < MESH_SHUFFLE.minGap * spacing);
      k++
    )
      c = make();
    pts.push(c);
  };
  if (composition === 'clusters') {
    const k = 2 + rng.int(2);
    const centres: [number, number][] = Array.from({ length: k }, () => [
      rng.range(-0.8, 0.8) * fw,
      rng.range(-0.7, 0.7) * 0.5,
    ]);
    const spread = spacing * rng.range(0.5, 0.9);
    for (let i = 0; i < n; i++) {
      const [cx, cy] = centres[i % k];
      place(() => inBox(cx + bell() * spread, cy + bell() * spread * 0.8));
    }
  } else if (composition === 'side') {
    // A mass hugging one side or corner, one point left out in the open field.
    const ang = rng.range(0, 2 * Math.PI);
    const cx = Math.cos(ang) * fw * 0.75;
    const cy = Math.sin(ang) * 0.5 * 0.75;
    const spread = spacing * rng.range(0.6, 1);
    for (let i = 0; i < n; i++) {
      if (i === n - 1 && n > 3) place(() => inBox(-cx * rng.range(0.5, 1.1), -cy * rng.range(0.5, 1.1)));
      else place(() => inBox(cx + bell() * spread, cy + bell() * spread * 0.8));
    }
  } else {
    // A line, or an arc (the same line bent), running across the frame at a random angle.
    const ang = rng.range(0, Math.PI);
    const [dx, dy] = [Math.cos(ang), Math.sin(ang)];
    const half = Math.min(fw / Math.max(Math.abs(dx), 1e-3), 0.5 / Math.max(Math.abs(dy), 1e-3)) * 0.95;
    const centre: [number, number] = [rng.range(-0.25, 0.25) * fw, rng.range(-0.25, 0.25) * 0.5];
    const bend = composition === 'arc' ? rng.range(0.25, 0.6) * (rng.next() < 0.5 ? -1 : 1) : 0;
    const jitter = spacing * rng.range(0.15, 0.4);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1 + rng.range(-0.5, 0.5) / n;
      const off = bend * half * t * t - bend * half * 0.35;
      place(() =>
        inBox(
          centre[0] + dx * half * t - dy * off + bell() * jitter,
          centre[1] + dy * half * t + dx * off + bell() * jitter,
        ),
      );
    }
  }
  return pts;
}

/** Best-candidate (Mitchell) sampling over the overscanned frame: even, not grid-like. */
function layoutPoints(rng: Rng, n: number, aspect: number, candidates: number, overscan: number): [number, number][] {
  const fw = aspect / 2;
  const hw = fw * overscan;
  const hh = 0.5 * overscan;
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
      // Looser layouts (fewer candidates) still never stack two points: a candidate that close loses to any other.
      const tooClose = d < MESH_SHUFFLE.minGap * spacing;
      d = Math.min(d, MESH_SHUFFLE.edgeSlack * spacing + 2 * edge);
      if (tooClose) d -= 10;
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
    const M = MESH_SHUFFLE;
    const [minK, maxK] = ctx.surprise ? M.candidatesFlat : M.candidates;
    const candidates = minK + layoutRng.int(maxK - minK + 1);
    const dominant = layoutRng.next() < (ctx.surprise ? M.dominantFlat : M.dominant) ? layoutRng.int(n) : -1;
    const domScale = ctx.surprise ? M.dominantScaleFlat : M.dominantScale;
    const radiusRange = ctx.surprise ? M.radiusFlat : M.radius;
    const composition = pickWeighted(layoutRng, ctx.surprise ? MESH_SHUFFLE.compositionsFlat : M.compositions);
    const overscan = ctx.surprise ? M.overscanFlat : M.overscan;
    const placed =
      composition === 'scatter'
        ? layoutPoints(layoutRng, n, aspect, candidates, overscan)
        : composePoints(layoutRng, n, aspect, composition, overscan);
    geo = placed.map(([x, y], i) => {
      const scale = i === dominant ? domScale : 1;
      const radius = spacing * scale * layoutRng.range(...radiusRange);
      return { x: round4(x), y: round4(y), radius: round4(clamp(radius, ...RADIUS_LIMITS)) };
    });
    sharpness = round4(layoutRng.range(...(ctx.surprise ? MESH_SHUFFLE.sharpnessFlat : MESH_SHUFFLE.sharpness)));
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
  if (base.kind === 'planes' || base.kind === 'aurora' || base.kind === 'blobs') return base.colors.map(copyColor);
  if (base.kind === 'grid') return base.nodes.map((n) => copyColor(n.color));
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
  if (kind === 'planes') return { kind, colors: colors.slice(0, n), count: 0.7333, roughness: 0.5, blend: 0, seed: 0 };
  if (kind === 'aurora')
    return { kind, colors: colors.slice(0, n), count: 0.5, glow: 0.5, blend: AURORA_BLEND, seed: 0 };
  if (kind === 'blobs')
    return {
      kind,
      colors: colors.slice(0, n),
      count: 0.5,
      size: 0.5,
      wobble: 0.65,
      grain: 0.25,
      base: 'black',
      seed: 0,
    };
  if (kind === 'grid') {
    const nodes = Array.from({ length: 9 }, (_, i) => ({ x: 0, y: 0, color: copyColor(colors[i % colors.length]) }));
    return { kind, rows: 3, cols: 3, nodes, rest: [0.89, 0.5] };
  }
  if (
    base.kind !== 'mesh' &&
    base.kind !== 'planes' &&
    base.kind !== 'aurora' &&
    base.kind !== 'blobs' &&
    base.kind !== 'grid'
  ) {
    return { ...base, kind };
  }
  const ramp = n === 1 ? [colors[0], colors[0]] : colors.slice(0, n);
  const stops = ramp.map((color, i) => ({ position: i / (ramp.length - 1), color }));
  return { kind, angle: 0, stops };
}

function shufflePlanesStyle(rng: Rng, surprise: boolean): Pick<PlanesPattern, 'roughness' | 'blend'> {
  const { planesRoughness, planesRoughnessFlat, planesBlend, planesBlendFlat } = STYLE_SHUFFLE;
  const b = surprise ? planesBlendFlat : planesBlend;
  const r = surprise ? planesRoughnessFlat : planesRoughness;
  return {
    roughness: rng.next() < r.clean ? 0 : round4(rng.range(...r.range)),
    blend: rng.next() < b.chance ? round4(rng.range(...b.range)) : 0,
  };
}

function shuffleFinish(rng: Rng, flat: boolean, surprise: boolean, kind?: BasePattern['kind']): Finish {
  const s = STYLE_SHUFFLE;
  const scale = (kind && KIND_PROFILE[kind]?.finish) || {};
  const maybe = (f: { chance: number; range: Range }, mult = 1) =>
    rng.next() < Math.min(0.9, f.chance * mult) ? round4(rng.range(...f.range)) : 0;
  const vignette = maybe(surprise ? s.vignetteFlat : s.vignette, scale.vignette);
  const print = maybe(surprise ? s.printFlat : s.print, scale.print);
  const bands = maybe(surprise ? s.bandsFlat : s.bands, scale.bands);
  const bandEdge = round4(rng.next());
  // Drawn after the others, so shuffles from before relief and halftone existed come out the same.
  const relief = maybe(surprise ? { ...s.relief, ...s.reliefFlat } : s.relief, scale.relief);
  const reliefStyle = rng.next() < 0.5 ? 'satin' : 'glass';
  const reliefLight = Math.round(rng.range(...s.relief.light));
  const halftone = maybe(s.halftone);
  // Noise (D63) is one texture: when both rolls hit, a coin picks the winner.
  const pickHalftone = halftone > 0 && (print === 0 || rng.next() < 0.5);
  return {
    vignette,
    noise: pickHalftone ? { type: 'halftone', amount: halftone } : { type: 'lithograph', amount: print },
    bands: flat ? 0 : bands,
    bandEdge,
    bandStyle: noFinish.bandStyle,
    relief,
    reliefStyle: relief > 0 ? reliefStyle : noFinish.reliefStyle,
    reliefLight: relief > 0 ? reliefLight : noFinish.reliefLight,
  };
}

/** Planes: a new layout is a new seed (and count); new colors are a palette of the same size. */
function shufflePlanes(
  base: PlanesPattern,
  ctx: ShuffleContext,
): { pattern: PlanesPattern; palette: PaletteInfo | null } {
  const { opts, layoutRng } = ctx;
  const count = opts.layout
    ? round4(layoutRng.range(...(ctx.surprise ? PLANES_SHUFFLE.countFlat : PLANES_SHUFFLE.count)))
    : base.count;
  const seed = opts.layout ? layoutRng.uint32() : base.seed;
  const n = Math.min(base.colors.length, MAX_STOPS);
  const palette = opts.colors ? ctx.makePalette(n) : null;
  const colors = palette ? palette.colors : base.colors.slice(0, n).map(copyColor);
  return {
    pattern: {
      kind: 'planes',
      colors,
      count,
      roughness: base.roughness,
      blend: base.blend,
      seed,
      // Hand edits belong to the layout they were made on (D88).
      ...(base.edits && !opts.layout ? { edits: base.edits } : {}),
    },
    palette: palette && paletteInfo(palette),
  };
}

/** Even grid over the frame of the given aspect (or over `extent`, half width and height), nodes jittered (edges along their edge, corners fixed). */
export function gridLayout(
  rng: Rng | null,
  rows: number,
  cols: number,
  aspect: number,
  extent: [number, number] = [aspect / 2, 0.5],
): GridMesh['nodes'] {
  const [hw, hh] = extent;
  const nodes: GridMesh['nodes'] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let x = -hw + (2 * hw * c) / (cols - 1);
      let y = -hh + (2 * hh * r) / (rows - 1);
      if (rng) {
        const jx = (rng.range(-1, 1) * GRID_SHUFFLE.jitter * 2 * hw) / (cols - 1);
        const jy = (rng.range(-1, 1) * GRID_SHUFFLE.jitter * 2 * hh) / (rows - 1);
        if (c > 0 && c < cols - 1) x += jx;
        if (r > 0 && r < rows - 1) y += jy;
      }
      nodes.push({ x: round4(x), y: round4(y), color: [0.5, 0, 0] });
    }
  }
  return nodes;
}

/** Palette colors dealt over grid nodes, each unlike its left and lower neighbors where possible. */
function dealGridColors(rng: Rng, palette: Oklch[], rows: number, cols: number): Oklch[] {
  const out: Oklch[] = [];
  for (let i = 0; i < rows * cols; i++) {
    const neighbors = [i % cols > 0 ? out[i - 1] : null, i >= cols ? out[i - cols] : null].filter(
      (c): c is Oklch => c !== null,
    );
    const start = rng.int(palette.length);
    let best = palette[start];
    let bestScore = -Infinity;
    for (let k = 0; k < palette.length; k++) {
      const c = palette[(start + k) % palette.length];
      const score = neighbors.length ? Math.min(...neighbors.map((n) => oklchDistance(n, c))) : 0;
      if (score > bestScore + 1e-9) {
        best = c;
        bestScore = score;
      }
    }
    out.push(copyColor(best));
  }
  return out;
}

/** Grid: a new layout is a new size and jittered nodes over the frame; new colors are a small palette dealt over the nodes. */
function shuffleGrid(base: GridMesh, ctx: ShuffleContext): { pattern: GridMesh; palette: PaletteInfo | null } {
  const { opts, layoutRng, colorRng, extent } = ctx;
  const size = () =>
    clamp(GRID_SHUFFLE.size[0] + layoutRng.int(GRID_SHUFFLE.size[1] - GRID_SHUFFLE.size[0] + 1), MIN_GRID, MAX_GRID);
  const rows = opts.layout ? size() : base.rows;
  const cols = opts.layout ? size() : base.cols;
  const geo = opts.layout ? gridLayout(layoutRng, rows, cols, 0, extent) : base.nodes;
  const rest: [number, number] = opts.layout ? [round4(extent[0]), round4(extent[1])] : base.rest;
  const palette = opts.colors ? ctx.makePalette(Math.min(GRID_SHUFFLE.colors, rows * cols)) : null;
  let colors: Oklch[];
  if (palette) colors = dealGridColors(colorRng, palette.colors, rows, cols);
  else if (geo === base.nodes) colors = base.nodes.map((n) => copyColor(n.color));
  else colors = dealGridColors(colorRng, baseColors(base), rows, cols);
  const nodes = geo.map((n, i) => ({ x: n.x, y: n.y, color: colors[i] }));
  // Drawn last, so the other layout values match earlier shuffles.
  const lines = opts.layout
    ? layoutRng.next() < GRID_SHUFFLE.lines.chance
      ? round4(layoutRng.range(...GRID_SHUFFLE.lines.range))
      : 0
    : (base.lines ?? 0);
  return { pattern: { kind: 'grid', rows, cols, nodes, rest, lines }, palette: palette && paletteInfo(palette) };
}

/** Aurora: a new layout is a new seed, ribbon count, glow and blend. */
function shuffleAurora(
  base: AuroraPattern,
  ctx: ShuffleContext,
): { pattern: AuroraPattern; palette: PaletteInfo | null } {
  const { opts, layoutRng } = ctx;
  const count = opts.layout ? round4(layoutRng.range(...AURORA_SHUFFLE.count)) : base.count;
  const glow = opts.layout ? round4(layoutRng.range(...AURORA_SHUFFLE.glow)) : base.glow;
  const seed = opts.layout ? layoutRng.uint32() : base.seed;
  // Drawn after the seed, so the other layout values match earlier shuffles.
  const blend = opts.layout ? round4(layoutRng.range(...AURORA_SHUFFLE.blend)) : base.blend;
  const n = Math.min(base.colors.length, MAX_STOPS);
  const palette = opts.colors ? ctx.makePalette(n) : null;
  const colors = palette ? palette.colors : base.colors.slice(0, n).map(copyColor);
  return { pattern: { kind: 'aurora', colors, count, glow, blend, seed }, palette: palette && paletteInfo(palette) };
}

/** Blobs: a new layout is a new seed, blob count, size, wobble and grain. */
function shuffleBlobs(base: BlobsPattern, ctx: ShuffleContext): { pattern: BlobsPattern; palette: PaletteInfo | null } {
  const { opts, layoutRng } = ctx;
  const count = opts.layout ? round4(layoutRng.range(...BLOBS_SHUFFLE.count)) : base.count;
  const size = opts.layout ? round4(layoutRng.range(...BLOBS_SHUFFLE.size)) : base.size;
  const wobble = opts.layout ? round4(layoutRng.range(...BLOBS_SHUFFLE.wobble)) : base.wobble;
  const grainRoll = opts.layout ? round4(layoutRng.range(...BLOBS_SHUFFLE.grain)) : base.grain;
  const grain = opts.layout && layoutRng.next() < BLOBS_SHUFFLE.smooth ? 0 : grainRoll;
  const seed = opts.layout ? layoutRng.uint32() : base.seed;
  // Drawn after the seed, so the other layout values match the shuffles from before the base existed.
  const body = opts.layout ? (layoutRng.next() < BLOBS_SHUFFLE.palette ? 'palette' : 'black') : (base.base ?? 'black');
  // A background and at least three inks: fewer reads as one blob color.
  const n = Math.min(Math.max(base.colors.length, BLOBS_MIN_COLORS), MAX_STOPS);
  const palette = opts.colors ? ctx.makePalette(n) : null;
  const colors = palette ? palette.colors : base.colors.slice(0, MAX_STOPS).map(copyColor);
  return {
    pattern: {
      kind: 'blobs',
      colors,
      count,
      size,
      wobble,
      grain,
      base: body,
      seed,
      // Hand edits belong to the layout they were made on (D88).
      ...(base.edits && !opts.layout ? { edits: base.edits } : {}),
    },
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

  const out: ColorStop[] = stops.map((_, i) => ({ position: positions[i], color: colors[i] }));
  const pattern: RampGradient = { ...base, angle, stops: out };
  if (opts.layout && (base.kind === 'noise' || base.kind === 'cells')) {
    pattern.scale = round4(layoutRng.range(...(ctx.surprise ? RAMP_SHUFFLE.scaleFlat : RAMP_SHUFFLE.scale[base.kind])));
    pattern.seed = layoutRng.uint32();
    if (base.kind === 'noise')
      pattern.noiseStyle = layoutRng.next() < (ctx.surprise ? 0.5 : RAMP_SHUFFLE.contourShare) ? 'contour' : 'ridged';
  }
  return { pattern, palette: palette && paletteInfo(palette) };
}
