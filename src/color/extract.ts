import type { Rng } from '../design/shuffle.types';
import { linearSrgbToOklab, srgbDecode } from './oklab';
import type { Oklab } from './types';

/*
 * Palette from image (M4 step 6). Two stages:
 *
 * 1. clusterImage: k-means++ in Oklab over a downscaled image, many more
 *    clusters than the palette needs. Each cluster keeps its area share and
 *    its peak: where in the image it is most concentrated. (The centroid is
 *    no use: a color spread over the whole image averages to the middle.)
 * 2. pickPalette: greedy selection of up to `max` clusters. The first pick is
 *    the largest cluster; each next pick maximizes
 *
 *      score = weight^(1 - bias) · minDist^bias
 *
 *    where minDist is the ΔE_OK to the nearest color already picked.
 *    bias 0 = dominant (area order), bias 1 = distinct (farthest point).
 *    Candidates closer than minDeltaE to a picked color are never taken, so a
 *    near-monochrome image yields fewer colors instead of muddy duplicates.
 */

export interface ColorCluster {
  color: Oklab;
  /** Share of the image's opaque pixels, in [0, 1]. */
  weight: number;
  /** Peak position in image space, x and y in [0, 1], y down. */
  x: number;
  y: number;
}

export interface ClusterOptions {
  k?: number;
  iterations?: number;
  /** k-means runs from different starts; the best fit is kept. */
  restarts?: number;
}

const SRGB_TO_LINEAR = Float64Array.from({ length: 256 }, (_, i) => srgbDecode(i / 255));

/** RGBA8 (sRGB-encoded) → clusters sorted by weight, largest first. */
export function clusterImage(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  rng: Rng,
  { k = 16, iterations = 24, restarts = 4 }: ClusterOptions = {},
): ColorCluster[] {
  const n0 = width * height;
  const lab = new Float64Array(n0 * 3);
  const cell = new Int32Array(n0);
  let n = 0;
  for (let i = 0; i < n0; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    const c = linearSrgbToOklab([
      SRGB_TO_LINEAR[rgba[i * 4]],
      SRGB_TO_LINEAR[rgba[i * 4 + 1]],
      SRGB_TO_LINEAR[rgba[i * 4 + 2]],
    ]);
    lab.set(c, n * 3);
    cell[n] = Math.floor(((i % width) * GRID) / width) + GRID * Math.floor((Math.floor(i / width) * GRID) / height);
    n++;
  }
  if (n === 0) return [];
  k = Math.min(k, n);

  // Best of a few restarts (lowest squared error): on busy images a single
  // k-means++ start decides which small areas get a cluster of their own.
  let best: KMeans | null = null;
  for (let r = 0; r < restarts; r++) {
    const run = kmeans(lab, n, k, rng, iterations);
    if (!best || run.error < best.error) best = run;
  }
  const { centers, assign, counts } = best!;

  const hist = new Float64Array(k * GRID * GRID);
  for (let p = 0; p < n; p++) hist[assign[p] * GRID * GRID + cell[p]]++;
  const clusters: ColorCluster[] = [];
  for (let c = 0; c < k; c++) {
    if (counts[c] === 0) continue;
    const [x, y] = peak(hist.subarray(c * GRID * GRID, (c + 1) * GRID * GRID));
    clusters.push({
      color: [centers[c * 3], centers[c * 3 + 1], centers[c * 3 + 2]],
      weight: counts[c] / n,
      x,
      y,
    });
  }
  return clusters.sort((a, b) => b.weight - a.weight);
}

interface KMeans {
  centers: Float64Array;
  assign: Int32Array;
  counts: Float64Array;
  /** Sum of squared distances to the assigned centers. */
  error: number;
}

function kmeans(lab: Float64Array, n: number, k: number, rng: Rng, iterations: number): KMeans {
  const centers = seedCenters(lab, n, k, rng);
  const assign = new Int32Array(n);
  const sums = new Float64Array(k * 3);
  const counts = new Float64Array(k);
  for (let it = 0; it < iterations; it++) {
    let changed = 0;
    for (let p = 0; p < n; p++) {
      const c = nearest(lab, p, centers, k);
      if (c !== assign[p] || it === 0) changed++;
      assign[p] = c;
    }
    sums.fill(0);
    counts.fill(0);
    for (let p = 0; p < n; p++) {
      const c = assign[p];
      counts[c]++;
      for (let d = 0; d < 3; d++) sums[c * 3 + d] += lab[p * 3 + d];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      for (let d = 0; d < 3; d++) centers[c * 3 + d] = sums[c * 3 + d] / counts[c];
    }
    if (changed === 0) break;
  }
  let error = 0;
  for (let p = 0; p < n; p++) error += dist2(lab, p, centers, assign[p]);
  return { centers, assign, counts, error };
}

/** Cells per side of the grid that locates each cluster's peak. */
const GRID = 12;

/** Densest cell of a GRID² histogram after a 3×3 box blur, as its center in [0, 1]². */
function peak(hist: Float64Array): [number, number] {
  let best = 0;
  let bestSum = -1;
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < GRID && y >= 0 && y < GRID) sum += hist[y * GRID + x];
        }
      }
      // Center cell counts double so ties go to the actual mass, not its neighbor.
      sum += hist[cy * GRID + cx];
      if (sum > bestSum) {
        bestSum = sum;
        best = cy * GRID + cx;
      }
    }
  }
  return [((best % GRID) + 0.5) / GRID, (Math.floor(best / GRID) + 0.5) / GRID];
}

/** k-means++: each next center is drawn with probability ∝ squared distance. */
function seedCenters(lab: Float64Array, n: number, k: number, rng: Rng): Float64Array {
  const centers = new Float64Array(k * 3);
  const dist = new Float64Array(n).fill(Infinity);
  let pick = rng.int(n);
  for (let c = 0; c < k; c++) {
    for (let d = 0; d < 3; d++) centers[c * 3 + d] = lab[pick * 3 + d];
    let total = 0;
    for (let p = 0; p < n; p++) {
      const d2 = dist2(lab, p, centers, c);
      if (d2 < dist[p]) dist[p] = d2;
      total += dist[p];
    }
    if (total === 0) return centers.subarray(0, (c + 1) * 3);
    let r = rng.next() * total;
    pick = n - 1;
    for (let p = 0; p < n; p++) {
      r -= dist[p];
      if (r <= 0) {
        pick = p;
        break;
      }
    }
  }
  return centers;
}

function dist2(lab: Float64Array, p: number, centers: Float64Array, c: number): number {
  const dl = lab[p * 3] - centers[c * 3];
  const da = lab[p * 3 + 1] - centers[c * 3 + 1];
  const db = lab[p * 3 + 2] - centers[c * 3 + 2];
  return dl * dl + da * da + db * db;
}

function nearest(lab: Float64Array, p: number, centers: Float64Array, k: number): number {
  let best = 0;
  let bestD = Infinity;
  const count = Math.min(k, centers.length / 3);
  for (let c = 0; c < count; c++) {
    const d = dist2(lab, p, centers, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export interface PickOptions {
  /** Most colors to return. */
  max?: number;
  /** 0 = dominant, 1 = distinct. The default leans distinct: on photos it keeps the accents the eye
   *  picks out, while the area term keeps the pick stable when small clusters shift. */
  bias?: number;
  /** Candidates closer than this ΔE_OK to a picked color are skipped. */
  minDeltaE?: number;
}

const labDist = (a: Oklab, b: Oklab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Clusters sorted by weight (as clusterImage returns them) → palette, in pick order. */
export function pickPalette(
  clusters: readonly ColorCluster[],
  { max = 6, bias = 0.75, minDeltaE = 0.08 }: PickOptions = {},
): ColorCluster[] {
  if (clusters.length === 0) return [];
  const picked: ColorCluster[] = [clusters[0]];
  const minDist = clusters.map((c) => labDist(c.color, clusters[0].color));
  while (picked.length < max) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < clusters.length; i++) {
      if (minDist[i] < minDeltaE) continue;
      const score = Math.pow(clusters[i].weight, 1 - bias) * Math.pow(minDist[i], bias);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) break;
    const chosen = clusters[best];
    picked.push(chosen);
    for (let i = 0; i < clusters.length; i++) {
      minDist[i] = Math.min(minDist[i], labDist(clusters[i].color, chosen.color));
    }
  }
  return picked;
}

export interface ImageLayoutOptions {
  /** Width / height of the source image. */
  imageAspect: number;
  /** Width / height of the frame. */
  frameAspect: number;
  /** How strongly area scales a point's radius: 0 = equal radii. */
  areaPower?: number;
}

/**
 * Mesh geometry that puts each color at its peak in the image. The image
 * covers the frame (cropped, centered), in composition units: frame height 1,
 * origin at the center, +y up. Radii start from the shuffle's spacing and grow
 * with area share, so a color covering most of the image fills most of the frame.
 */
export function imageLayout(
  palette: readonly ColorCluster[],
  { imageAspect, frameAspect, areaPower = 0.5 }: ImageLayoutOptions,
): { x: number; y: number; radius: number }[] {
  const n = palette.length;
  const scale = Math.max(1, frameAspect / imageAspect);
  const base = 0.65 * Math.sqrt(frameAspect / n);
  return palette.map((c) => ({
    x: (c.x - 0.5) * imageAspect * scale,
    y: (0.5 - c.y) * scale,
    radius: base * Math.min(3, Math.max(0.5, Math.pow(c.weight * n, areaPower))),
  }));
}
