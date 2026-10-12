// Linked palette edits and remix: move every color together so the
// relationships between them survive. Each part of the shift is a group
// operation, so dragging a slider away and back restores the palette (except
// where a color hit the sRGB gamut edge and had its chroma capped):
// - hue: rotate all hues by the same angle (keeps the harmony's hue gaps);
// - lightness: shift logit(L) by the same amount (keeps the order, never
//   clips, and compresses gently toward black and white);
// - chroma: scale by the same ratio (keeps relative intensity).
import type { Rng } from '../design/random';
import { normalizeDegrees, shortestTurn } from '../math';
import { maxChroma } from './gamut';
import type { Oklch } from './types';

export interface PaletteShift {
  /** Hue rotation, degrees. */
  hue: number;
  /** Added to logit(L). */
  lightness: number;
  /** Chroma multiplier, > 0. */
  chroma: number;
}

const L_EPS = 1e-3;
/**
 * Below this chroma a color counts as gray: its chroma changes additively,
 * not by ratio (a ratio of almost nothing swings wildly), and its hue doesn't steer the others.
 */
const GRAY_CHROMA = 0.02;

/**
 * Near-neutral anchors (cream, near-black): very light or dark and nearly gray.
 * Their chroma is left alone, so a louder palette doesn't tint them.
 */
const ANCHOR = { chroma: 0.045, light: 0.9, dark: 0.28 } as const;
const isAnchor = ([l, c]: Oklch) => c < ANCHOR.chroma && (l >= ANCHOR.light || l <= ANCHOR.dark);

const clampL = (l: number) => Math.min(1 - L_EPS, Math.max(L_EPS, l));
const logit = (l: number) => Math.log(clampL(l) / (1 - clampL(l)));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function applyShift(c: Oklch, s: PaletteShift, chromaAdd: number): Oklch {
  const l = sigmoid(logit(c[0]) + s.lightness);
  const h = normalizeDegrees(c[2] + s.hue);
  const scaled = isAnchor(c) ? c[1] : c[1] >= GRAY_CHROMA ? c[1] * s.chroma : c[1] + chromaAdd;
  return [l, Math.max(0, Math.min(scaled, maxChroma(l, h))), h];
}

/** Apply one shift to every color, keeping colors inside sRGB. */
export function shiftPalette(colors: readonly Oklch[], shift: PaletteShift): Oklch[] {
  return colors.map((c) => applyShift(c, shift, 0));
}

/** Global grade: a hue turn, brightness, contrast and saturation (D74). */
export interface Grade {
  /** Hue rotation, degrees. */
  hue: number;
  /** Brightness, -1..1; shifts logit(L) by up to ±BRIGHTNESS_LOGIT. */
  brightness: number;
  /** Contrast, -1..1; scales logit(L) around the palette's mean by 3^contrast. */
  contrast: number;
  /** Saturation, -1..1; scales chroma: -1 is gray, 0 unchanged, 1 triples it (capped to the gamut). */
  saturation: number;
}

export const BRIGHTNESS_LOGIT = 1.5;
const CONTRAST_BASE = 3;

export const NO_GRADE: Grade = { hue: 0, brightness: 0, contrast: 0, saturation: 0 };
export const isNoGrade = (g: Grade) => g.hue === 0 && g.brightness === 0 && g.contrast === 0 && g.saturation === 0;

/**
 * Grade the palette: contrast stretches each color's logit(L) around the
 * palette's mean (the order never changes), brightness then shifts all of
 * them, saturation scales chroma (capped to the gamut), the hue turns.
 */
export function gradePalette(colors: readonly Oklch[], g: Grade): Oklch[] {
  if (colors.length === 0) return [];
  const pivot = colors.reduce((sum, c) => sum + logit(c[0]), 0) / colors.length;
  const k = CONTRAST_BASE ** g.contrast;
  const chroma = g.saturation < 0 ? 1 + g.saturation : 1 + 2 * g.saturation;
  return colors.map((c) => {
    const lightness = (k - 1) * (logit(c[0]) - pivot) + g.brightness * BRIGHTNESS_LOGIT;
    return applyShift(c, { hue: g.hue, lightness, chroma }, 0);
  });
}

/**
 * Color `index` is being changed to `next`: return the whole palette moved by
 * the same shift. `next` itself is kept exactly as given. With `oneHue`
 * (monochrome), every color that isn't gray takes `next`'s hue exactly.
 */
export function relinkPalette(colors: readonly Oklch[], index: number, next: Oklch, oneHue = false): Oklch[] {
  const prev = colors[index];
  if (!prev) return colors.slice();
  const shift: PaletteShift = {
    // A gray has no hue to speak of: don't swing the others when its hue changes.
    hue: prev[1] < GRAY_CHROMA && next[1] < GRAY_CHROMA ? 0 : shortestTurn(prev[2], next[2]),
    lightness: logit(next[0]) - logit(prev[0]),
    chroma: prev[1] >= GRAY_CHROMA ? next[1] / prev[1] : 1,
  };
  const chromaAdd = prev[1] < GRAY_CHROMA ? next[1] - prev[1] : 0;
  return colors.map((c, i) => {
    if (i === index) return [next[0], next[1], next[2]] as Oklch;
    const [l, chroma, h] = applyShift(c, shift, chromaAdd);
    if (!oneHue || next[1] < GRAY_CHROMA || chroma < GRAY_CHROMA) return [l, chroma, h] as Oklch;
    return [l, Math.min(chroma, maxChroma(l, next[2])), next[2]] as Oklch;
  });
}

/** A random linked shift: a new take on the palette with the same relationships. */
export function remixShift(rng: Rng): PaletteShift {
  const sign = rng.next() < 0.5 ? -1 : 1;
  return {
    hue: sign * rng.range(25, 180),
    lightness: rng.range(-0.5, 0.5),
    chroma: Math.exp(rng.range(-0.35, 0.35)),
  };
}
