// The design: everything that defines an image, independent of resolution
// (D4). A base pattern (linear gradient or color-point mesh), a warp, film
// grain and a whole-image transform. Versioned by engineVersion; the full
// saved-design schema comes with M6.
import type { Oklch } from '../color/types';

/**
 * How the segment from a stop to the NEXT stop is interpolated (D5).
 * - 'oklab': straight line in Oklab (default).
 * - 'oklab-chroma': chroma-preserving Oklab — lerp L and C, rotate hue along
 *   the shorter arc, with hue progress weighted by chroma so it equals plain
 *   'oklab' when an end is gray and stays continuous as chroma approaches 0.
 * - 'oklch-short' / 'oklch-long': hue path around the shorter / longer arc.
 */
export type BlendMode = 'oklab' | 'oklab-chroma' | 'oklch-short' | 'oklch-long';

export interface ColorStop {
  /** Position along the gradient, in [0, 1]. */
  position: number;
  color: Oklch;
  /** Blend mode of the segment to the next stop. Ignored on the last stop. */
  blend: BlendMode;
}

/** How a ramp gradient maps the frame to the ramp (src/engine/ramp-shape.ts). */
export type RampShape = 'linear' | 'radial' | 'conic';

/** Stops along a ramp, laid over the frame as a linear, radial or conic gradient. */
export interface RampGradient {
  kind: RampShape;
  /**
   * Degrees, counter-clockwise. Linear: the direction (0 = left→right, 90 =
   * bottom→top). Conic: where the sweep starts. Radial: unused.
   */
  angle: number;
  /** Sorted by position. At least 2 stops in the editor (the renderer accepts 1), at most MAX_STOPS. */
  stops: ColorStop[];
}

/**
 * A colored point of the mesh gradient. Position is in composition
 * coordinates (image height = 1, origin at the center, +y up; see
 * src/engine/types.ts), so a 16:9 frame spans x in [-0.889, 0.889] and
 * y in [-0.5, 0.5]. Points may lie outside the frame.
 */
export interface MeshPoint {
  x: number;
  y: number;
  color: Oklch;
  /** Influence radius in composition units (image height = 1), > 0. */
  radius: number;
}

/**
 * Color-point mesh: every pixel blends all point colors in Oklab with
 * smooth distance-based weights. The weight function (D20) is documented in
 * src/color/mesh.ts; it is smooth everywhere, finite far from all points,
 * and never produces hard seams.
 */
export interface PointMesh {
  kind: 'mesh';
  /** 1..MAX_MESH_POINTS points. */
  points: MeshPoint[];
  /** 0 = soft haze, 1 = blobby, distinct shapes. */
  sharpness: number;
}

export type BasePattern = RampGradient | PointMesh;

/**
 * Coordinate distortion applied before the base pattern (D23). Experimental
 * catalogue — shapes that don't earn their place will be pruned (D22).
 */
export type WarpShape =
  | 'none'
  | 'domain' // recursive domain-warped fBm (IQ-style)
  | 'fbm'
  | 'simplex'
  | 'waves'
  | 'rows' // stepped horizontal bands
  | 'columns' // stepped vertical bands
  | 'circular' // radial ripples around the center
  | 'oval' // elliptical swirl/pinch around the center
  | 'worley'
  | 'voronoi'
  | 'curl' // stateless curl-noise flow, integrated in-shader
  | 'ridged' // ridged fBm: veined, folded-satin creases
  | 'marble' // noise-turbulent sine bands
  | 'bristle' // dry-brush streaks along a stroke direction
  | 'smudge'; // one-way smear along a stroke direction

export const WARP_SHAPES: readonly WarpShape[] = [
  'none',
  'domain',
  'fbm',
  'simplex',
  'waves',
  'rows',
  'columns',
  'circular',
  'oval',
  'worley',
  'voronoi',
  'curl',
  'ridged',
  'marble',
  'bristle',
  'smudge',
];

export interface Warp {
  shape: WarpShape;
  /** Strength in [0, 1]; 0 = no distortion. */
  amount: number;
  /** Feature scale in [0, 1]; 0 = large, slow features, 1 = small, busy ones. */
  size: number;
  /** uint32 seed. Mixed into hashes, never used as a coordinate offset (D2). */
  seed: number;
}

/**
 * Film grain (finish stage, D7). Defined per OUTPUT pixel (D4 exception),
 * applied after the sRGB transfer and before dither; strongest in midtones.
 */
export interface Grain {
  /** [0, 1]; 0 = off. */
  amount: number;
  /** [0, 1]; 0 = finest (≈1 px), 1 = coarse (≈3 px). */
  size: number;
}

/**
 * Finishing effects (M4.5, D33), after the base pattern. Vignette is defined
 * on the frame (composition coords, before transform and warp), so it stays
 * put while the image turns. Bands steps ramp gradients along their ramp and
 * meshes along each point's influence.
 */
export interface Finish {
  /** Darkening toward the frame corners, [0, 1]; 0 = off. */
  vignette: number;
  /** The image in flat steps, [0, 1] (more = fewer, wider steps); 0 = off. */
  bands: number;
  /** Softness of the band edges, [0, 1]: 0 = crisp lines, 1 = soft terraces. */
  bandEdge: number;
}

/**
 * Whole-image transform (D24), applied to composition coords before the
 * warp, so the warp turns, scales and mirrors with the pattern. Grain and
 * dither stay on the output pixel grid. Pattern coords are
 *   q = S · R(-rotate) · p / zoom,   S = diag(flipX ? -1 : 1, flipY ? -1 : 1)
 * (src/engine/transform.ts). Flipping in pattern space means a flip button
 * that mirrors the image as seen on screen must also negate `rotate`.
 */
export interface Transform {
  /** Counter-clockwise rotation of the image, degrees in [0, 360). */
  rotate: number;
  /** Magnification: 1 = none, 2 = features twice as large. In [MIN_ZOOM, MAX_ZOOM]. */
  zoom: number;
  flipX: boolean;
  flipY: boolean;
}

export interface Design {
  engineVersion: 1;
  base: BasePattern;
  warp: Warp;
  grain: Grain;
  /** Missing (designs saved before transforms existed) = identity. */
  transform?: Transform;
  /** Missing = no finish. */
  finish?: Finish;
}

export const defaultWarp: Warp = { shape: 'domain', amount: 0.3, size: 0.35, seed: 1 };
export const noWarp: Warp = { shape: 'none', amount: 0, size: 0.5, seed: 1 };
export const defaultGrain: Grain = { amount: 0.35, size: 0 };
export const noGrain: Grain = { amount: 0, size: 0 };
export const noFinish: Finish = { vignette: 0, bands: 0, bandEdge: 0 };
export const identityTransform: Transform = { rotate: 0, zoom: 1, flipX: false, flipY: false };
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

export const MAX_STOPS = 8;
export const MAX_MESH_POINTS = 16;

export const defaultDesign: Design = {
  engineVersion: 1,
  warp: noWarp,
  grain: noGrain,
  base: {
    kind: 'linear',
    angle: 30,
    stops: [
      { position: 0, color: [0.2264, 0.1093, 280.42], blend: 'oklab' },
      { position: 0.5, color: [0.6031, 0.2141, 352.9], blend: 'oklab' },
      { position: 1, color: [0.8452, 0.1383, 76.58], blend: 'oklab' },
    ],
  },
};

export const defaultMesh: PointMesh = {
  kind: 'mesh',
  sharpness: 0.35,
  points: [
    { x: -0.62, y: 0.28, color: [0.2941, 0.1292, 272.93], radius: 0.45 },
    { x: 0.1, y: 0.32, color: [0.5881, 0.201, 5.25], radius: 0.4 },
    { x: 0.7, y: 0.18, color: [0.7851, 0.154, 60.69], radius: 0.4 },
    { x: -0.25, y: -0.3, color: [0.6505, 0.1092, 191.68], radius: 0.4 },
    { x: 0.55, y: -0.34, color: [0.9304, 0.0522, 89.04], radius: 0.35 },
  ],
};
