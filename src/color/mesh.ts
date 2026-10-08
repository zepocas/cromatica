import { MAX_MESH_POINTS, type PointMesh } from '../design/design';
import { clipRgb, gamutMapSrgb, JND, oklabDistance, rgbInGamut } from './gamut';
import { linearSrgbToOklab, oklabToLinearSrgb, oklchToOklab } from './oklab';
import type { Oklab, Rgb } from './types';

/*
 * Mesh weight function (D20). For pixel p and point i with center c_i and
 * radius r_i:
 *
 *   w_i(p) = (1 + |p - c_i|² / r_i²)^(-k),   k = 1.5 · 12^s · (1 + 4·s⁶)
 *   color(p) = Σ w_i · lab_i / Σ w_i                     (blended in Oklab)
 *
 * A normalized rational-quadratic (Student-t / Cauchy-family) kernel. It is
 * C∞, and its heavy tails keep far-field blends soft: the log weight ratio of
 * two points tends to a constant (2k·log(r_i / r_j)) far away, so seams widen
 * with distance instead of sharpening. A Gaussian's ratio grows with d², which
 * gives hard Voronoi-like seams and lets tiny points swallow the frame when
 * the others are far; softened Shepard IDW shows bullseyes around points at
 * low sharpness. k scales every log ratio, so sharpness goes from haze (k=1.5)
 * through distinct blobs (k≈18 at 0.9) to near-hard edges (k=90), and r_i sets each point's reach relative to its
 * neighbors.
 *
 * Evaluated in the log domain: e_i = -k · log(1 + d² / r²), normalized by the
 * largest e_i, so the largest weight is exactly 1 and the sum never
 * underflows, however far every point is.
 */

/** Input ranges after sanitizing; keeps d² / r² well inside float32 range. */
const MAX_COORD = 1e6;
const MIN_RADIUS = 1e-4;
const MAX_RADIUS = 1e4;
/** Chroma-scale bisection steps of the gamut clip (resolution 2^-16). */
export const GAMUT_CLIP_STEPS = 16;

/** Clamp, with non-finite input replaced by `fallback`: mesh inputs come from saved designs and drags. */
const sanitize = (x: number, lo: number, hi: number, fallback: number) =>
  Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : fallback;

/** Sharpness in [0, 1] → kernel exponent k. */
export function meshExponent(sharpness: number): number {
  const s = sanitize(sharpness, 0, 1, 0);
  // The extra factor only lifts the top of the range (×5 at 1, ×1.06 at 0.5),
  // so the far end gives near-hard edges.
  return 1.5 * Math.pow(12, s) * (1 + 4 * Math.pow(s, 6));
}

/**
 * The mesh as the shader sees it: sanitized positions, 1 / r², gamut-mapped
 * Oklab colors and the exponent. Shared by the renderer and the CPU reference.
 */
export interface PreparedMesh {
  count: number;
  exponent: number;
  /** x, y, 1 / r² per point. */
  geometry: Float64Array;
  /** Oklab L, a, b per point, gamut-mapped into sRGB. */
  colors: Float64Array;
}

export function prepareMesh(mesh: PointMesh): PreparedMesh {
  const count = mesh.points.length;
  if (count < 1 || count > MAX_MESH_POINTS) {
    throw new RangeError(`A mesh needs 1 to ${MAX_MESH_POINTS} points, got ${count}.`);
  }
  const geometry = new Float64Array(count * 3);
  const colors = new Float64Array(count * 3);
  mesh.points.forEach((p, i) => {
    const r = sanitize(p.radius, MIN_RADIUS, MAX_RADIUS, 1);
    geometry[i * 3] = sanitize(p.x, -MAX_COORD, MAX_COORD, 0);
    geometry[i * 3 + 1] = sanitize(p.y, -MAX_COORD, MAX_COORD, 0);
    geometry[i * 3 + 2] = 1 / (r * r);
    colors.set(oklchToOklab(gamutMapSrgb(p.color)), i * 3);
  });
  return { count, exponent: meshExponent(mesh.sharpness), geometry, colors };
}

/**
 * Finish bands on a mesh (D33, D60). `level` bands a weight relative to the
 * strongest, `stepLightness` bands an Oklab lightness; both are src/engine/finish.ts.
 */
export interface MeshBanding {
  style: 'weights' | 'facets' | 'layers';
  /** Band steps; below 2 = off. */
  steps: number;
  level: (relative: number) => number;
  stepLightness: (l: number) => number;
}

function preparedWeights(
  m: PreparedMesh,
  x: number,
  y: number,
  out: number[],
  band?: (relative: number) => number,
): number[] {
  let max = -Infinity;
  for (let i = 0; i < m.count; i++) {
    const dx = x - m.geometry[i * 3];
    const dy = y - m.geometry[i * 3 + 1];
    const e = -m.exponent * Math.log(1 + (dx * dx + dy * dy) * m.geometry[i * 3 + 2]);
    out[i] = e;
    if (e > max) max = e;
  }
  let sum = 0;
  for (let i = 0; i < m.count; i++) {
    // Relative weight: the strongest is exactly 1, and band(1) = 1, so sum >= 1.
    out[i] = band ? band(Math.exp(out[i] - max)) : Math.exp(out[i] - max);
    sum += out[i];
  }
  for (let i = 0; i < m.count; i++) out[i] /= sum;
  return out;
}

/** Returns a fast evaluator of the blended Oklab color at composition (x, y), optionally in bands. */
export function createMeshEvaluator(mesh: PointMesh, banding?: MeshBanding): (x: number, y: number) => Oklab {
  const m = prepareMesh(mesh);
  const w: number[] = new Array(m.count);
  const on = banding !== undefined && banding.steps >= 2;
  const weightBands = on && banding.style === 'weights' ? banding.level : undefined;
  const color = (i: number, k: number) => m.colors[i * 3 + k];
  return (x, y) => {
    if (on && banding.style === 'facets') {
      // The two strongest points; their share in steps, so each band is a flat mix.
      const e = preparedWeights(m, x, y, w); // normalized weights, same order as relative ones
      let i1 = 0;
      for (let i = 0; i < m.count; i++) if (e[i] >= e[i1]) i1 = i;
      let i2 = -1;
      for (let i = 0; i < m.count; i++) if (i !== i1 && (i2 < 0 || e[i] > e[i2])) i2 = i;
      if (i2 < 0) return [color(i1, 0), color(i1, 1), color(i1, 2)];
      const w2 = e[i2] / e[i1];
      const t = 0.5 * banding.level((2 * w2) / (1 + w2));
      return [0, 1, 2].map((k) => color(i1, k) + (color(i2, k) - color(i1, k)) * t) as Oklab;
    }
    preparedWeights(m, x, y, w, weightBands);
    const lab: Oklab = [0, 0, 0];
    for (let i = 0; i < m.count; i++) {
      for (let k = 0; k < 3; k++) lab[k] += w[i] * m.colors[i * 3 + k];
    }
    if (on && banding.style === 'layers') lab[0] = banding.stepLightness(lab[0]);
    return lab;
  };
}

/** Normalized weights (sum 1) of each point at composition (x, y). */
export function meshWeights(mesh: PointMesh, x: number, y: number): number[] {
  const m = prepareMesh(mesh);
  return preparedWeights(m, x, y, new Array(m.count));
}

/**
 * Blended Oklab color of the mesh at composition (x, y), before the gamut
 * clip (it can lie slightly outside sRGB). Same math as the shader, in doubles.
 */
export function evaluateMesh(mesh: PointMesh, x: number, y: number): Oklab {
  return createMeshEvaluator(mesh)(x, y);
}

const inUnitCube = (c: Rgb) => rgbInGamut(c, 0);

/**
 * The shader's gamut clip, in doubles. CSS Color 4 gamut mapping (as in
 * gamutMapToLinearSrgb, so meshes and ramps map alike) with a fixed number of
 * chroma-scale bisection steps at constant L and hue: accept the channel clip
 * when it is within ΔE_OK 0.02, else find the most chroma whose clip is.
 * Returns LINEAR sRGB in [0, 1].
 */
export function meshGamutClip(lab: Oklab): Rgb {
  const l = lab[0];
  if (l >= 1) return [1, 1, 1];
  if (l <= 0) return [0, 0, 0];
  const rgb = oklabToLinearSrgb(lab);
  if (inUnitCube(rgb)) return rgb;
  const clipped = clipRgb(rgb);
  if (oklabDistance(linearSrgbToOklab(clipped), lab) < JND) return clipped;
  let lo = 0;
  let hi = 1;
  let loInGamut = true;
  for (let i = 0; i < GAMUT_CLIP_STEPS; i++) {
    const k = 0.5 * (lo + hi);
    const cur: Oklab = [l, lab[1] * k, lab[2] * k];
    const c = oklabToLinearSrgb(cur);
    if (loInGamut && inUnitCube(c)) {
      lo = k;
    } else if (oklabDistance(linearSrgbToOklab(clipRgb(c)), cur) < JND) {
      loInGamut = false;
      lo = k;
    } else {
      hi = k;
    }
  }
  return clipRgb(oklabToLinearSrgb([l, lab[1] * lo, lab[2] * lo]));
}
