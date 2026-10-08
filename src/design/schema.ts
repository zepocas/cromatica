// The saved form of a design: a versioned envelope around a Design with every
// field present. Older saves are migrated forward one version at a time, then
// validated against the current schema.
import { z } from 'zod';
import {
  BAND_STYLES,
  identityTransform,
  MAX_GRID,
  MAX_MESH_POINTS,
  MAX_STOPS,
  MIN_GRID,
  MIN_ZOOM,
  MAX_ZOOM,
  noFinish,
  RELIEF_STYLES,
  WARP_SHAPES,
  type Design,
} from './design';

export const SCHEMA_VERSION = 4;
/** Aurora blend that reproduces auroras saved before blend existed. */
export const LEGACY_AURORA_BLEND = 0.6;

const unit = z.number().min(0).max(1);
const seed = z.number().int().min(0).max(0xffffffff);
const oklch = z.tuple([z.number().min(0).max(1), z.number().min(0), z.number()]);

const rampGradient = z.object({
  kind: z.enum(['linear', 'radial', 'conic', 'noise', 'cells']),
  angle: z.number(),
  stops: z
    .array(
      z.object({
        position: unit,
        color: oklch,
        blend: z.enum(['oklab', 'oklab-chroma', 'oklch-short', 'oklch-long']),
      }),
    )
    .min(1)
    .max(MAX_STOPS),
  scale: unit,
  seed,
  noiseStyle: z.enum(['contour', 'ridged']),
});

const pointMesh = z.object({
  kind: z.literal('mesh'),
  points: z
    .array(z.object({ x: z.number(), y: z.number(), color: oklch, radius: z.number().positive() }))
    .min(1)
    .max(MAX_MESH_POINTS),
  sharpness: unit,
});

const paletteColors = z.array(oklch).min(1).max(MAX_STOPS);

const planes = z.object({
  kind: z.literal('planes'),
  colors: paletteColors,
  count: unit,
  roughness: unit,
  blend: unit,
  seed,
});

const aurora = z.object({
  kind: z.literal('aurora'),
  colors: paletteColors,
  count: unit,
  glow: unit,
  blend: unit,
  seed,
});

const gridSide = z.number().int().min(MIN_GRID).max(MAX_GRID);
const grid = z
  .object({
    kind: z.literal('grid'),
    rows: gridSide,
    cols: gridSide,
    nodes: z.array(z.object({ x: z.number(), y: z.number(), color: oklch })),
    rest: z.tuple([z.number().positive(), z.number().positive()]),
    lines: unit.optional(),
  })
  .refine((g) => g.nodes.length === g.rows * g.cols, { message: 'grid needs rows × cols nodes', path: ['nodes'] });

const designSchema = z.object({
  engineVersion: z.literal(1),
  base: z.union([rampGradient, pointMesh, planes, aurora, grid]),
  warp: z.object({ shape: z.enum(WARP_SHAPES), amount: unit, size: unit, seed }),
  grain: z.object({ amount: unit, size: unit }),
  transform: z.object({
    rotate: z.number().min(0).lt(360),
    zoom: z.number().min(MIN_ZOOM).max(MAX_ZOOM),
    flipX: z.boolean(),
    flipY: z.boolean(),
  }),
  finish: z.object({
    vignette: unit,
    bands: unit,
    bandEdge: unit,
    bandStyle: z.enum(BAND_STYLES).default('weights'),
    print: unit,
    relief: unit,
    reliefStyle: z.enum(RELIEF_STYLES),
    reliefLight: z.number().min(0).lt(360),
    halftone: unit,
  }),
});

const savedSchema = z.object({ version: z.literal(SCHEMA_VERSION), design: designSchema });

/** A design with every optional field filled in, as the current schema stores it. */
export type SavedDesign = z.infer<typeof designSchema>;

type Json = Record<string, unknown>;
const isObject = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);

/** The defaults that missing optional fields of a Design stand for. */
function withDefaults(design: Json): Json {
  const base = isObject(design.base) ? design.base : {};
  const ramp = 'stops' in base ? { scale: 0.35, seed: 1, noiseStyle: 'contour', ...base } : base;
  return { transform: identityTransform, finish: noFinish, ...design, base: ramp };
}

/** migrations[v] turns a version-v save into a version v + 1 save. */
const migrations: Record<number, (save: Json) => Json> = {
  // Version 1 is a bare Design as kept in memory before M6.
  1: (design) => ({ version: 2, design: withDefaults(design) }),
  2: (save) => {
    const design = isObject(save.design) ? save.design : {};
    const base = isObject(design.base) ? design.base : {};
    const aurora = base.kind === 'aurora' ? { blend: LEGACY_AURORA_BLEND, ...base } : base;
    return { ...save, version: 3, design: { ...design, base: aurora } };
  },
  3: (save) => {
    const design = isObject(save.design) ? save.design : {};
    const finish = isObject(design.finish) ? design.finish : {};
    return { ...save, version: 4, design: { ...design, finish: { ...noFinish, ...finish } } };
  },
};

function versionOf(save: Json): number {
  if (typeof save.version === 'number') return save.version;
  return 'engineVersion' in save && 'base' in save ? 1 : NaN;
}

export class DesignLoadError extends Error {}

/** A saved design (parsed JSON) of any known version, migrated and validated. */
export function loadDesign(saved: unknown): SavedDesign {
  if (!isObject(saved)) throw new DesignLoadError('not a saved design');
  let save = saved;
  let version = versionOf(save);
  if (!Number.isInteger(version) || version < 1 || version > SCHEMA_VERSION) {
    throw new DesignLoadError(`unknown schema version ${String(save.version)}`);
  }
  for (; version < SCHEMA_VERSION; version++) save = migrations[version](save);
  const result = savedSchema.safeParse(save);
  if (!result.success) throw new DesignLoadError(z.prettifyError(result.error));
  return result.data.design;
}

/** The current-version save of a design, ready for JSON.stringify. */
export function saveDesign(design: Design): { version: number; design: SavedDesign } {
  return savedSchema.parse({ version: SCHEMA_VERSION, design: withDefaults({ ...design }) });
}
