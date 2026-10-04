// Designs shared by the engine tests.
import type { Oklch } from '../../../src/color/types';
import {
  type BlendMode,
  defaultMesh,
  type Design,
  type Grain,
  noGrain,
  noWarp,
  type Transform,
  type Warp,
  WARP_SHAPES,
  type WarpShape,
} from '../../../src/design/design';

export type StopSpec = [position: number, color: Oklch, blend?: BlendMode];

export function linear(angle: number, stops: StopSpec[]): Design {
  return {
    engineVersion: 1,
    warp: noWarp,
    grain: noGrain,
    base: {
      kind: 'linear',
      angle,
      stops: stops.map(([position, color, blend = 'oklab']) => ({ position, color, blend })),
    },
  };
}

export const threeStops = (angle: number) =>
  linear(angle, [
    [0, [0.3, 0.12, 280], 'oklab'],
    [0.4, [0.62, 0.2, 350], 'oklch-short'],
    [1, [0.86, 0.13, 77]],
  ]);

// Mid-tone gradient whose channels stay away from 0 and 255, so the dither is never clipped.
export const midTones = linear(20, [
  [0, [0.5, 0.08, 250]],
  [0.5, [0.62, 0.09, 150], 'oklab-chroma'],
  [1, [0.72, 0.08, 40]],
]);

export function mesh(sharpness: number, points: [x: number, y: number, color: Oklch, radius: number][]): Design {
  return {
    engineVersion: 1,
    warp: noWarp,
    grain: noGrain,
    base: { kind: 'mesh', sharpness, points: points.map(([x, y, color, radius]) => ({ x, y, color, radius })) },
  };
}

export const meshDefault: Design = { engineVersion: 1, warp: noWarp, grain: noGrain, base: defaultMesh };

// 16 points (MAX_MESH_POINTS) with vivid, partly out-of-gamut colors and varied radii.
export const mesh16 = mesh(
  0.6,
  Array.from({ length: 16 }, (_, i) => [
    ((i * 0.618) % 1) * 1.9 - 0.95,
    ((i * 0.381 + 0.13) % 1) * 1.1 - 0.55,
    [0.35 + ((i * 0.29) % 0.55), 0.12 + (i % 4) * 0.07, (i * 67) % 360],
    0.12 + (i % 5) * 0.08,
  ]),
);

// sRGB primaries and secondaries: their Oklab blends leave the sRGB gamut.
export const primaries = mesh(0.2, [
  [-0.6, 0.25, [0.628, 0.2577, 29.23], 0.35],
  [0.0, 0.3, [0.8664, 0.2948, 142.5], 0.35],
  [0.6, 0.25, [0.452, 0.3132, 264.05], 0.35],
  [-0.4, -0.3, [0.9054, 0.1546, 194.77], 0.3],
  [0.4, -0.3, [0.7017, 0.3225, 328.36], 0.3],
]);

// Every point far outside the frame, with extreme radii.
export const farAway = (sharpness: number) =>
  mesh(sharpness, [
    [-3, 2, [0.55, 0.12, 270], 0.3],
    [4, 0.2, [0.7, 0.15, 10], 2],
    [0.5, -6, [0.8, 0.13, 70], 0.05],
    [-1e3, -1e3, [0.65, 0.1, 190], 5],
    [1e6, 1e6, [0.9, 0.05, 90], 1e-3],
    [-1e6, 3e5, [0.6, 0.2, 140], 1e3],
  ]);

// Degenerate inputs inside the frame: tiny/huge radii, coincident points.
export const extreme = mesh(1, [
  [0, 0, [0.6, 0.2, 30], 1e-6],
  [0, 0, [0.7, 0.1, 200], 1e-6],
  [0.3, 0.1, [0.75, 0.15, 120], 1e5],
  [-0.5, -0.2, [0.5, 0.25, 300], 1e-3],
  [2e7, -2e7, [0.4, 0.1, 60], 0.5],
]);

export const SHAPES = WARP_SHAPES.filter((s) => s !== 'none');
/** Intentionally stepped shapes: compared off their step edges only. */
export const STEPPED: readonly WarpShape[] = ['rows', 'columns', 'voronoi'];

export const warp = (shape: WarpShape, amount = 0.5, size = 0.5, seed = 7): Warp => ({ shape, amount, size, seed });
export const withLook = (d: Design, w: Warp, grain: Grain = noGrain): Design => ({ ...d, warp: w, grain });
export const bases: [string, Design][] = [
  ['linear', threeStops(30)],
  ['mesh', mesh16],
];

export const turn = (d: Design, t: Partial<Transform>): Design => ({
  ...d,
  transform: { rotate: 0, zoom: 1, flipX: false, flipY: false, ...t },
});

export const gray = (l: number): Design => mesh(0.5, [[0, 0, [l, 0, 0], 0.5]]);
