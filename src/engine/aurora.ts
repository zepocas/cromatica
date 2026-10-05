// Aurora: glowing ribbons that flow across the frame over a dark sky, with a
// crisp lower edge, a long upward fade and vertical curtain rays. Prepared on
// the CPU and passed to shaders/gradient/aurora.glsl as uniforms;
// evaluateAurora is the same per-pixel math in doubles, for tests.
import { gamutMapToLinearSrgb } from '../color/gamut';
import type { Rgb } from '../color/types';
import { type AuroraPattern, MAX_STOPS } from '../design/design';
import { createRng } from '../design/random';
import { clamp01 } from '../math';
import { fbm, hashKey } from './noise';

export const MAX_RIBBONS = 6;

/** Constants the shader shares, as #defines. */
export const AURORA_SHADER_CONSTANTS = {
  MAX_RIBBONS,
  FLOW_FREQ: '1.2',
  FLOW_AMP: '0.18',
  FLOW_OCTAVES: 3,
  RAY_FREQ: '14.0',
  RAY_STRETCH: '0.8',
  RAY_OCTAVES: 2,
  RAY_DEPTH: '0.45',
  MASK_FREQ: '0.9',
  MASK_FROM: '-0.25',
  MASK_TO: '0.35',
  MASK_KEY_OFFSET: '0x61c88647u',
  RIBBON_KEY_STEP: '0x27d4eb2fu',
  RAY_KEY_OFFSET: '0x165667b1u',
};
const RIBBON_COUNT: [few: number, many: number] = [2, MAX_RIBBONS];
/** Ribbon centers are spread over this vertical range, composition units. */
const BAND = 0.32;
/** Flow of the center line: fBm frequency along x, its amplitude and octaves. */
export const FLOW_FREQ = 1.2;
export const FLOW_AMP = 0.18;
export const FLOW_OCTAVES = 3;
/** Upward fade length at glow 0 and 1; the lower edge is this fraction of it. */
const GLOW_WIDTH: [narrow: number, wide: number] = [0.025, 0.13];
export const LOWER_EDGE = 0.25;
/** Curtain rays: frequency across and along them, octaves, and how deep they cut the glow. */
export const RAY_FREQ = 14;
export const RAY_STRETCH = 0.8;
export const RAY_OCTAVES = 2;
export const RAY_DEPTH = 0.45;
/** Curtains fade in and out along their length: mask noise frequency and its threshold range. */
export const MASK_FREQ = 0.9;
export const MASK_EDGE: [from: number, to: number] = [-0.25, 0.35];
/** The sky is the darkest palette color, dimmed by this factor (linear RGB). */
const SKY_DIM = 0.35;
const AURORA_SALT = 0x91;
export const RIBBON_KEY_STEP = 0x27d4eb2f;
/** Key offset of the ray noise from a ribbon's flow noise. */
export const RAY_KEY_OFFSET = 0x165667b1;
export const MASK_KEY_OFFSET = 0x61c88647;

export interface PreparedAurora {
  count: number;
  /** Linear sRGB. */
  sky: Rgb;
  colors: Float64Array;
  /** Per ribbon: center height, tilt (dy/dx) and strength. */
  lines: Float64Array;
  /** Flow-noise key of ribbon 0. */
  key: number;
  /** Upward fade and lower edge widths. */
  up: number;
  down: number;
}

/** Ribbons slider [0, 1] → number of ribbons. */
export function ribbonCount(count: number): number {
  const c = clamp01(Number.isFinite(count) ? count : 0.5);
  return Math.round(RIBBON_COUNT[0] + (RIBBON_COUNT[1] - RIBBON_COUNT[0]) * c);
}

export function prepareAurora(aurora: AuroraPattern): PreparedAurora {
  const k = aurora.colors.length;
  if (k < 1 || k > MAX_STOPS) throw new RangeError(`Aurora needs 1 to ${MAX_STOPS} colors, got ${k}.`);
  const seed = aurora.seed >>> 0;
  const rng = createRng(seed);
  const n = ribbonCount(aurora.count);
  // The darkest color is the sky; the others take turns as ribbons.
  const order = aurora.colors.map((_, i) => i).sort((a, b) => aurora.colors[a][0] - aurora.colors[b][0]);
  const skyIndex = order[0];
  const ribbonColors = k > 1 ? order.slice(1) : order;
  const sky = gamutMapToLinearSrgb(aurora.colors[skyIndex]).map((c) => c * SKY_DIM) as Rgb;
  const colors = new Float64Array(n * 3);
  const lines = new Float64Array(n * 3);
  const start = rng.int(ribbonColors.length);
  for (let i = 0; i < n; i++) {
    colors.set(gamutMapToLinearSrgb(aurora.colors[ribbonColors[(start + i) % ribbonColors.length]]), i * 3);
    // Evenly spread heights, jittered, so ribbons rarely sit on top of each other.
    const y = -BAND + ((i + 0.2 + 0.6 * rng.next()) / n) * 2 * BAND;
    lines.set([y, rng.range(-0.15, 0.15), rng.range(0.6, 1)], i * 3);
  }
  const glow = clamp01(Number.isFinite(aurora.glow) ? aurora.glow : 0.5);
  const up = GLOW_WIDTH[0] + (GLOW_WIDTH[1] - GLOW_WIDTH[0]) * glow;
  return { count: n, sky, colors, lines, key: hashKey(seed, AURORA_SALT), up, down: up * LOWER_EDGE };
}

/** Glow of ribbon i at (x, y), in [0, 1]. */
function ribbonGlow(p: PreparedAurora, i: number, x: number, y: number): number {
  const key = (p.key + Math.imul(i, RIBBON_KEY_STEP)) >>> 0;
  const [base, tilt, strength] = p.lines.subarray(i * 3, i * 3 + 3);
  const center = base + tilt * x + FLOW_AMP * fbm(x * FLOW_FREQ, 0, key, FLOW_OCTAVES);
  const d = y - center;
  // Crisp below the line, a long fade above it.
  const profile = d < 0 ? Math.exp(-((d / p.down) ** 2)) : Math.exp(-d / p.up);
  const rays =
    1 - RAY_DEPTH * (0.5 + 0.5 * fbm(x * RAY_FREQ, y * RAY_STRETCH, (key + RAY_KEY_OFFSET) >>> 0, RAY_OCTAVES));
  const m = fbm(x * MASK_FREQ, 0, (key + MASK_KEY_OFFSET) >>> 0, 2);
  const mask = smoothstep(MASK_EDGE[0], MASK_EDGE[1], m);
  return clamp01(strength * profile * rays * mask);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Linear sRGB of the aurora at pattern-space point (x, y). */
export function evaluateAurora(p: PreparedAurora, x: number, y: number): Rgb {
  const rgb: Rgb = [...p.sky];
  for (let i = 0; i < p.count; i++) {
    const a = ribbonGlow(p, i, x, y);
    // Screen blend: overlaps brighten without passing 1.
    for (let c = 0; c < 3; c++) rgb[c] = 1 - (1 - rgb[c]) * (1 - p.colors[i * 3 + c] * a);
  }
  return rgb;
}
