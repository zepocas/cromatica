// The shader (shaders/color/neighbours.glsl) does the same in float32.
import { linearSrgbToOklab } from '../color/oklab';
import type { Rgb } from '../color/types';

/** Distance to each neighbour, composition units; image units so relief looks the same at every output size (~3 px at 1080p). */
export const NEIGHBOUR_STEP = 0.003;

export const NEIGHBOUR_SHADER_CONSTANTS = { NEIGHBOURS: 1, NEIGHBOUR_STEP: NEIGHBOUR_STEP.toFixed(4) };

/** Height of a linear sRGB color: its Oklab lightness. */
export function heightOf(rgb: Rgb): number {
  return linearSrgbToOklab(rgb)[0];
}

/**
 * Height slope (dL/du, dL/dv). By default by one-sided differences from the centre: three reads, and the centre read
 * is the one the lighting colours too, but it is the slope half a step up and right. `precise` takes central
 * differences, a step each way, centred on the pixel: four reads plus the centre (D108).
 */
export function heightSlope(
  colorAt: (u: number, v: number) => Rgb,
  u: number,
  v: number,
  precise = false,
): [number, number] {
  const e = NEIGHBOUR_STEP;
  if (precise) {
    const dx = heightOf(colorAt(u + e, v)) - heightOf(colorAt(u - e, v));
    const dy = heightOf(colorAt(u, v + e)) - heightOf(colorAt(u, v - e));
    return [dx / (2 * e), dy / (2 * e)];
  }
  const h = heightOf(colorAt(u, v));
  return [(heightOf(colorAt(u + e, v)) - h) / e, (heightOf(colorAt(u, v + e)) - h) / e];
}
