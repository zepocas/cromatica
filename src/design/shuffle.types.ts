import type { Design, Oklch } from './design';

/**
 * Seeded PRNG. Implemented in src/design/random.ts:
 *   export function createRng(seed: number): Rng   // sfc32 or similar, uint32 seed
 *   export function randomSeed(): number           // fresh uint32 (crypto.getRandomValues)
 * Same seed → same sequence on every platform (pure integer math).
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [0, n). */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
  /** Fresh uint32, e.g. to seed a warp. */
  uint32(): number;
}

export type HarmonyRule =
  | 'monochrome'
  | 'analogous'
  | 'complementary'
  | 'split-complementary'
  | 'triadic'
  | 'tetradic';

export type PaletteMood = 'natural' | 'vivid' | 'any';
/** Value key: where the palette sits on the lightness scale. */
export type ValueKey = 'high' | 'full' | 'low';

export interface PaletteOptions {
  /** Random when omitted. */
  rule?: HarmonyRule;
  /** Default 'any' (weighted toward 'natural', the photogradient-like look). */
  mood?: PaletteMood;
  /** Hue (degrees) the rule is built around; random when omitted. */
  baseHue?: number;
  /** Default 'full' (the whole lightness range); 'any' picks one, leaning full. */
  key?: ValueKey | 'any';
}

/** A generated palette and the rule and mood it was actually built with. */
export interface Harmony {
  colors: Oklch[];
  rule: HarmonyRule;
  mood: Exclude<PaletteMood, 'any'>;
  key: ValueKey;
}

/**
 * Implemented in src/color/harmony.ts:
 *   export function generatePalette(rng: Rng, count: number, opts?: PaletteOptions): Oklch[]
 * Colors are in sRGB gamut (or gamut-mapped), with a spread of lightness
 * (no palette that is all dark or all light unless the rule is monochrome),
 * chroma expressed relative to the max in-gamut chroma at (L, h), and no two
 * colors closer than a minimum ΔE_OK.
 */
export type GeneratePalette = (rng: Rng, count: number, opts?: PaletteOptions) => Oklch[];

export interface ShuffleOptions {
  /** Replace stop/point colors with a new palette. */
  colors: boolean;
  /** Steers the new palette when `colors` is set. */
  palette?: PaletteOptions;
  /** Re-randomize layout: mesh points + radii (or gradient angle + stop positions), mesh sharpness, warp shape/amount/size/seed. */
  layout: boolean;
  seed: number;
}

/**
 * Implemented in src/design/shuffle.ts:
 *   export function shuffleDesign(design: Design, opts: ShuffleOptions): Design
 * Pure: returns a new design, never mutates. Keeps base.kind and grain.
 * Same (design, opts) → same result. Mesh layouts keep points mostly inside
 * the frame of the given aspect and avoid clumping; warp amount stays in a
 * tasteful range per shape; 'none' is picked rarely. When both colors and
 * layout are shuffled, the mesh point count may change by ±1.
 *   export function shuffleDesign(design, opts, aspect?: number)  // aspect default 16/9
 */
export type ShuffleDesign = (design: Design, opts: ShuffleOptions, aspect?: number) => Design;
export type { Oklch };
