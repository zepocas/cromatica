// Where new mesh points and gradient stops go. Pure functions of the current
// layout, in screen (composition) coordinates for points.

/** Grid cells per side searched for the emptiest spot. */
const EMPTY_SPOT_GRID = 12;
/** Fraction of the frame the emptiest-spot search covers, so new points stay off the very edge. */
const EMPTY_SPOT_INSET = 0.85;

/**
 * The spot inside a frame of the given aspect (height 1, centered) farthest
 * from every point, by a coarse grid search.
 */
export function emptiestSpot(points: readonly [number, number][], aspect: number): [number, number] {
  const n = EMPTY_SPOT_GRID;
  let best: [number, number] = [0, 0];
  let bestDistance = -1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = (((i + 0.5) / n) * 2 - 1) * (aspect / 2) * EMPTY_SPOT_INSET;
      const y = (((j + 0.5) / n) * 2 - 1) * 0.5 * EMPTY_SPOT_INSET;
      let d = Infinity;
      for (const [px, py] of points) d = Math.min(d, Math.hypot(x - px, y - py));
      if (d > bestDistance) {
        bestDistance = d;
        best = [x, y];
      }
    }
  }
  return best;
}

/** Middle of the widest gap between stop positions (the ends 0 and 1 count as edges). */
export function widestGapCenter(positions: readonly number[]): number {
  const edges = [0, ...[...positions].sort((a, b) => a - b), 1];
  let center = 0.5;
  let widest = -1;
  for (let k = 0; k + 1 < edges.length; k++) {
    const gap = edges[k + 1] - edges[k];
    if (gap > widest) {
      widest = gap;
      center = (edges[k] + edges[k + 1]) / 2;
    }
  }
  return center;
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
