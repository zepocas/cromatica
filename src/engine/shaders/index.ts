import vertMain from './fullscreen.vert.glsl?raw';
import fragMain from './main.frag.glsl?raw';
import coords from './common/coords.glsl?raw';
import linear from './gradient/linear.glsl?raw';
import mesh from './gradient/mesh.glsl?raw';
import oklab from './color/oklab.glsl?raw';
import ramp from './color/ramp.glsl?raw';
import srgb from './color/srgb.glsl?raw';
import dither from './color/dither.glsl?raw';

/** Compile-time switches for a program variant; values become #defines. */
export type Defines = Record<string, string | number | boolean>;

const HEADER = '#version 300 es\nprecision highp float;\nprecision highp int;\n';

// Chunks are concatenated in dependency order ahead of main().
// Base-pattern chunks are compiled in only under their BASE_* define.
const FRAGMENT_CHUNKS = [coords, linear, mesh, ramp, oklab, srgb, dither, fragMain];

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
