// Linked palette edits (M4 "Remix"): move every color together so the
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

const clampL = (l: number) => Math.min(1 - L_EPS, Math.max(L_EPS, l));
const logit = (l: number) => Math.log(clampL(l) / (1 - clampL(l)));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function applyShift(c: Oklch, s: PaletteShift, chromaAdd: number): Oklch {
  const l = sigmoid(logit(c[0]) + s.lightness);
  const h = normalizeDegrees(c[2] + s.hue);
  const scaled = c[1] >= GRAY_CHROMA ? c[1] * s.chroma : c[1] + chromaAdd;
  return [l, Math.max(0, Math.min(scaled, maxChroma(l, h))), h];
}

/** Apply one shift to every color, keeping colors inside sRGB. */
export function shiftPalette(colors: readonly Oklch[], shift: PaletteShift): Oklch[] {
  return colors.map((c) => applyShift(c, shift, 0));
}

/**
 * Color `index` is being changed to `next`: return the whole palette moved by
 * the same shift. `next` itself is kept exactly as given.
 */
export function relinkPalette(colors: readonly Oklch[], index: number, next: Oklch): Oklch[] {
  const prev = colors[index];
  if (!prev) return colors.slice();
  const shift: PaletteShift = {
    // A gray has no hue to speak of: don't swing the others when its hue changes.
    hue: prev[1] < GRAY_CHROMA && next[1] < GRAY_CHROMA ? 0 : shortestTurn(prev[2], next[2]),
    lightness: logit(next[0]) - logit(prev[0]),
    chroma: prev[1] >= GRAY_CHROMA ? next[1] / prev[1] : 1,
  };
  const chromaAdd = prev[1] < GRAY_CHROMA ? next[1] - prev[1] : 0;
  return colors.map((c, i) => (i === index ? ([next[0], next[1], next[2]] as Oklch) : applyShift(c, shift, chromaAdd)));
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
