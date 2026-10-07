import vertMain from './fullscreen.vert.glsl?raw';
import fragMain from './main.frag.glsl?raw';
import coords from './common/coords.glsl?raw';
import hash from './common/hash.glsl?raw';
import rampShape from './gradient/ramp-shape.glsl?raw';
import mesh from './gradient/mesh.glsl?raw';
import planes from './gradient/planes.glsl?raw';
import aurora from './gradient/aurora.glsl?raw';
import grid from './gradient/grid.glsl?raw';
import pattern from './gradient/pattern.glsl?raw';
import oklab from './color/oklab.glsl?raw';
import ramp from './color/ramp.glsl?raw';
import srgb from './color/srgb.glsl?raw';
import dither from './color/dither.glsl?raw';
import grain from './color/grain.glsl?raw';
import finish from './color/finish.glsl?raw';
import print from './color/print.glsl?raw';
import neighbours from './color/neighbours.glsl?raw';
import relief from './color/relief.glsl?raw';
import halftone from './color/halftone.glsl?raw';
import warpNoise from './warp/noise.glsl?raw';
import warpDomain from './warp/domain.glsl?raw';
import warpFbm from './warp/fbm.glsl?raw';
import warpSimplex from './warp/simplex.glsl?raw';
import warpWaves from './warp/waves.glsl?raw';
import warpBands from './warp/bands.glsl?raw';
import warpCircular from './warp/circular.glsl?raw';
import warpOval from './warp/oval.glsl?raw';
import warpWorley from './warp/worley.glsl?raw';
import warpVoronoi from './warp/voronoi.glsl?raw';
import warpCurl from './warp/curl.glsl?raw';
import warpRidged from './warp/ridged.glsl?raw';
import warpMarble from './warp/marble.glsl?raw';
import warpBristle from './warp/bristle.glsl?raw';
import warp from './warp/warp.glsl?raw';

/** Compile-time switches for a program variant; values become #defines. */
export type Defines = Record<string, string | number | boolean>;

const HEADER = '#version 300 es\nprecision highp float;\nprecision highp int;\n';

// Chunks are concatenated in dependency order ahead of main().
// Base-pattern chunks are compiled in only under their BASE_* define, warp
// chunks under WARP_ANY + WARP_<SHAPE> (no warp define = identity).
const WARP_CHUNKS = [
  warpNoise,
  warpDomain,
  warpFbm,
  warpSimplex,
  warpWaves,
  warpBands,
  warpCircular,
  warpOval,
  warpWorley,
  warpVoronoi,
  warpCurl,
  warpRidged,
  warpMarble,
  warpBristle,
  warp,
];
const FRAGMENT_CHUNKS = [
  coords,
  hash,
  ...WARP_CHUNKS,
  // Before the base patterns: the mesh bands its weights with bandLevel.
  finish,
  rampShape,
  mesh,
  planes,
  aurora,
  grid,
  ramp,
  oklab,
  pattern,
  neighbours,
  relief,
  halftone,
  srgb,
  print,
  grain,
  dither,
  fragMain,
];

/** Stable cache key for a variant. */
export function variantKey(defines: Defines): string {
  return Object.keys(defines)
    .sort()
    .map((k) => `${k}=${defines[k]}`)
    .join(';');
}

function defineLines(defines: Defines): string {
  return Object.keys(defines)
    .sort()
    .map((k) => {
      const v = defines[k];
      return `#define ${k} ${typeof v === 'boolean' ? (v ? 1 : 0) : v}\n`;
    })
    .join('');
}

export function buildShaderSources(defines: Defines): { vertex: string; fragment: string } {
  return {
    vertex: HEADER + vertMain,
    fragment: HEADER + defineLines(defines) + FRAGMENT_CHUNKS.join('\n'),
  };
}
