// Proportion (M4 step 9, D29): Itten's contrast of extension, the 60-30-10
// rule. One calm color dominates, the most vivid one is a small accent, and
// the rest support. On the mesh, area comes from point radii: they are fitted
// until each point's measured share of the frame matches its role.
import { meshAreaShares } from '../color/mesh';
import type { Oklch } from '../color/types';
import { clamp } from '../math';
import type { PointMesh } from './design';

export type Proportion = 'even' | '60-30-10';

/** Shares of the frame: the dominant color, the accent, and all the others together. */
const DOMINANT_SHARE = 0.6;
const ACCENT_SHARE = 0.1;
const SUPPORT_SHARE = 0.3;
/** Two colors: dominant and the other. */
const PAIR_SHARE = 0.7;
/** Radius updates of the fit; each moves radii by the square root of how far each share is off. */
const FIT_STEPS = 16;
/** Sample grid over the frame, per unit of height. */
const SAMPLES_PER_UNIT = 28;

/**
 * How loud a color reads: chroma, plus a little for lightness (a light color
 * of the same chroma stands out more). The lowest is the calmest.
 */
const vividness = ([l, c]: Oklch) => c + 0.1 * l;

/**
 * Target share of the frame for each color: the calmest dominates (60%), the
 * most vivid is the accent (10%), the others split the remaining 30%.
 */
export function proportionTargets(colors: readonly Oklch[]): number[] {
  const n = colors.length;
  if (n === 1) return [1];
  const order = colors.map((_, i) => i).sort((a, b) => vividness(colors[a]) - vividness(colors[b]));
  const dominant = order[0];
  const accent = order[n - 1];
  if (n === 2) return colors.map((_, i) => (i === dominant ? PAIR_SHARE : 1 - PAIR_SHARE));
  return colors.map((_, i) =>
    i === dominant ? DOMINANT_SHARE : i === accent ? ACCENT_SHARE : SUPPORT_SHARE / (n - 2),
  );
}

/** Sample positions over a frame of the given aspect (height 1, centered), in composition coords. */
export function frameSamples(aspect: number): [number, number][] {
  const rows = SAMPLES_PER_UNIT;
  const cols = Math.max(1, Math.round(SAMPLES_PER_UNIT * aspect));
  const out: [number, number][] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) out.push([((i + 0.5) / cols - 0.5) * aspect, (j + 0.5) / rows - 0.5]);
  }
  return out;
}

/**
 * Radii that give each point its target share of the samples, by repeated
 * multiplicative updates; radii stay within `limits`. Positions, colors and
 * sharpness are untouched, so points keep their place and only their reach changes.
 */
export function fitRadii(
  mesh: PointMesh,
  targets: readonly number[],
  samples: readonly (readonly [number, number])[],
  limits: [min: number, max: number],
): number[] {
  let radii = mesh.points.map((p) => p.radius);
  for (let step = 0; step < FIT_STEPS; step++) {
    const shares = meshAreaShares(
      { ...mesh, points: mesh.points.map((p, i) => ({ ...p, radius: radii[i] })) },
      samples,
    );
    radii = radii.map((r, i) => clamp(r * Math.sqrt(targets[i] / Math.max(shares[i], 1e-4)), ...limits));
  }
  return radii;
}
