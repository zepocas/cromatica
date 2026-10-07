// Neighbour sampling (D46): the pattern read as a height map. The shader
// (shaders/color/neighbours.glsl) does the same in float32.
import { linearSrgbToOklab } from '../color/oklab';
import type { Rgb } from '../color/types';

/**
 * Distance to each neighbour, composition units (image height = 1). In image
 * units so the relief looks the same at every output size: ~3 px at 1080p.
 */
export const NEIGHBOUR_STEP = 0.003;

export const NEIGHBOUR_SHADER_CONSTANTS = { NEIGHBOURS: 1, NEIGHBOUR_STEP: NEIGHBOUR_STEP.toFixed(4) };

/** Height of a linear sRGB color: its Oklab lightness. */
export function heightOf(rgb: Rgb): number {
  return linearSrgbToOklab(rgb)[0];
}

/** Height slope (dL/du, dL/dv) of the pattern at (u, v), by central differences. */
export function heightSlope(colorAt: (u: number, v: number) => Rgb, u: number, v: number): [number, number] {
  const e = NEIGHBOUR_STEP;
  const dx = heightOf(colorAt(u + e, v)) - heightOf(colorAt(u - e, v));
  const dy = heightOf(colorAt(u, v + e)) - heightOf(colorAt(u, v - e));
  return [dx / (2 * e), dy / (2 * e)];
}
