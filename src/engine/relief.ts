// Relief (D46): the pattern lit as a height map. Shading is measured against a
// flat surface, so where the pattern doesn't change the image is untouched.
// The shader (shaders/color/relief.glsl) does the same in float32.
import type { Rgb } from '../color/types';
import type { Finish } from '../design/design';
import { clamp01 } from '../math';
import { heightSlope } from './neighbours';

/** Height-to-tilt factor at relief 1; the slider is squared so it starts gently. */
const RELIEF_DEPTH = 3;
/**
 * Tilt (slope × depth) is eased toward this so steep, detailed patterns don't
 * crumple while smooth ones still get depth.
 */
const MAX_TILT = 1;
/** Light elevation above the image plane. */
const LIGHT_ELEVATION_DEG = 40;
/** Satin: diffuse shading per unit of tilt toward the light; sheen exponents and weights. */
const SATIN_SHADE = 0.9;
const SATIN_SHEEN: readonly (readonly [exponent: number, weight: number])[] = [
  [24, 0.3],
  [6, 0.1],
];
/** How much of the sheen takes the pattern's color rather than white. */
const SATIN_TINT = 0.6;
/** Glass: how far the surface tilt shifts the pattern underneath, composition units. */
const GLASS_REFRACT = 0.05;
const GLASS_SHADE = 0.35;
const GLASS_RIM = 0.2;
const GLASS_GLINT: readonly [exponent: number, weight: number] = [160, 0.45];
/** How much of the glass rims and glints take the pattern's color rather than white. */
const GLASS_TINT = 0.5;

type Vec3 = [number, number, number];

export interface PreparedRelief {
  /** Height-to-tilt factor; 0 = off. */
  depth: number;
  glass: boolean;
  /** Unit vector toward the light, composition axes (u right, v up, z out of the image). */
  light: Vec3;
  /** Half vector between the light and the viewer (straight above). */
  half: Vec3;
}

export function prepareRelief(finish: Finish | undefined): PreparedRelief {
  const strength = clamp01(finish?.relief ?? 0);
  const azimuth = ((finish?.reliefLight ?? 135) * Math.PI) / 180;
  const elevation = (LIGHT_ELEVATION_DEG * Math.PI) / 180;
  const light: Vec3 = [
    Math.cos(elevation) * Math.cos(azimuth),
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
  ];
  const h = Math.hypot(light[0], light[1], light[2] + 1);
  return {
    depth: RELIEF_DEPTH * strength * strength,
    glass: finish?.reliefStyle === 'glass',
    light,
    half: [light[0] / h, light[1] / h, (light[2] + 1) / h],
  };
}

export const RELIEF_SHADER_CONSTANTS = {
  SATIN_SHADE: SATIN_SHADE.toFixed(4),
  SATIN_SHEEN_EXP: `vec2(${SATIN_SHEEN.map(([e]) => e.toFixed(1)).join(', ')})`,
  SATIN_SHEEN_WEIGHT: `vec2(${SATIN_SHEEN.map(([, w]) => w.toFixed(4)).join(', ')})`,
  SATIN_TINT: SATIN_TINT.toFixed(4),
  MAX_TILT: MAX_TILT.toFixed(4),
  GLASS_REFRACT: GLASS_REFRACT.toFixed(4),
  GLASS_SHADE: GLASS_SHADE.toFixed(4),
  GLASS_RIM: GLASS_RIM.toFixed(4),
  GLASS_GLINT_EXP: GLASS_GLINT[0].toFixed(1),
  GLASS_GLINT_WEIGHT: GLASS_GLINT[1].toFixed(4),
  GLASS_TINT: GLASS_TINT.toFixed(4),
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Highlight brighter than the same light gives a flat surface; 0 on flat ground. */
const extraHighlight = (nh: number, flat: number, exponent: number) =>
  Math.max(0, Math.max(nh, 0) ** exponent - flat ** exponent);

/** `rgb` (linear, the pattern at (u, v)) with relief applied. */
export function applyRelief(
  r: PreparedRelief,
  colorAt: (u: number, v: number) => Rgb,
  u: number,
  v: number,
  rgb: Rgb,
): Rgb {
  const [sx, sy] = heightSlope(colorAt, u, v);
  const ease = 1 / Math.sqrt(1 + (Math.hypot(sx, sy) * r.depth) ** 2 / MAX_TILT ** 2);
  const nx = -sx * r.depth * ease;
  const ny = -sy * r.depth * ease;
  const len = Math.hypot(nx, ny, 1);
  const n: Vec3 = [nx / len, ny / len, 1 / len];
  const tilt = dot(n, r.light) - r.light[2];
  const nh = dot(n, r.half);
  if (!r.glass) {
    let sheen = 0;
    for (const [e, w] of SATIN_SHEEN) sheen += w * extraHighlight(nh, r.half[2], e);
    const shade = 1 + SATIN_SHADE * tilt;
    return rgb.map((c) => c * shade + sheen * (1 - SATIN_TINT + SATIN_TINT * c)) as Rgb;
  }
  const under = colorAt(u + n[0] * GLASS_REFRACT, v + n[1] * GLASS_REFRACT);
  const rim = GLASS_RIM * (1 - n[2]) ** 2;
  const glint = GLASS_GLINT[1] * extraHighlight(nh, r.half[2], GLASS_GLINT[0]);
  const shade = 1 + GLASS_SHADE * tilt;
  return under.map((c) => c * shade + (rim + glint) * (1 - GLASS_TINT + GLASS_TINT * c)) as Rgb;
}
