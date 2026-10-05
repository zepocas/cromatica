// Grid mesh (D43): colored nodes on a bendable grid. The forward map takes a
// point q of the rest grid to F(q) = q + D(q), D being the node offsets
// interpolated with Catmull-Rom; a pixel p is pulled back by Newton steps on
// F(q) = p, and its color is the nodes' colors interpolated at q (Catmull-Rom,
// in Oklab). Exact where the grid doesn't fold; smooth and finite where it
// does. Prepared on the CPU for shaders/gradient/grid.glsl; evaluateGrid is
// the same math in doubles, for tests and the editor.
import { gamutMapSrgb } from '../color/gamut';
import { oklchToOklab } from '../color/oklab';
import type { Oklab } from '../color/types';
import { type GridMesh, MAX_GRID, MIN_GRID } from '../design/design';

export const MAX_GRID_NODES = MAX_GRID * MAX_GRID;
/** Newton steps of the pull-back, the Jacobian determinant below which a plain step is taken, and the step cap. */
export const GRID_STEPS = 8;
export const GRID_MIN_DET = 1e-3;
export const GRID_MAX_STEP = 0.25;

export interface PreparedGrid {
  rows: number;
  cols: number;
  /** Rest half extents. */
  hw: number;
  hh: number;
  /** Per node: offset from its rest spot (x, y). */
  offsets: Float64Array;
  /** Per node: Oklab, gamut-mapped. */
  colors: Float64Array;
}

const clampInt = (i: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, i));

export function restPoint(
  g: { rows: number; cols: number; rest: [number, number] },
  r: number,
  c: number,
): [number, number] {
  const [hw, hh] = g.rest;
  return [-hw + (2 * hw * c) / (g.cols - 1), -hh + (2 * hh * r) / (g.rows - 1)];
}

export function prepareGrid(g: GridMesh): PreparedGrid {
  const { rows, cols } = g;
  if (rows < MIN_GRID || rows > MAX_GRID || cols < MIN_GRID || cols > MAX_GRID || g.nodes.length !== rows * cols) {
    throw new RangeError(`A grid needs ${MIN_GRID}..${MAX_GRID} rows and columns and one node each.`);
  }
  const offsets = new Float64Array(rows * cols * 2);
  const colors = new Float64Array(rows * cols * 3);
  g.nodes.forEach((n, i) => {
    const [rx, ry] = restPoint(g, Math.floor(i / cols), i % cols);
    offsets.set([n.x - rx, n.y - ry], i * 2);
    colors.set(oklchToOklab(gamutMapSrgb(n.color)), i * 3);
  });
  return { rows, cols, hw: g.rest[0], hh: g.rest[1], offsets, colors };
}

/** Catmull-Rom weights and their derivatives at f in [0, 1], for nodes i-1..i+2. */
function weights(f: number, w: number[], d: number[]): void {
  const f2 = f * f;
  const f3 = f2 * f;
  w[0] = 0.5 * (-f3 + 2 * f2 - f);
  w[1] = 0.5 * (3 * f3 - 5 * f2 + 2);
  w[2] = 0.5 * (-3 * f3 + 4 * f2 + f);
  w[3] = 0.5 * (f3 - f2);
  d[0] = 0.5 * (-3 * f2 + 4 * f - 1);
  d[1] = 0.5 * (9 * f2 - 10 * f);
  d[2] = 0.5 * (-9 * f2 + 8 * f + 1);
  d[3] = 0.5 * (3 * f2 - 2 * f);
}

/** Grid parameter along one axis: cell index, fraction, and d(param)/d(coord) (0 where clamped). */
function axis(q: number, half: number, n: number): [cell: number, f: number, scale: number] {
  const k = n - 1;
  const raw = ((q + half) / (2 * half)) * k;
  const s = Math.min(k, Math.max(0, raw));
  const cell = Math.min(k - 1, Math.floor(s));
  return [cell, s - cell, raw === s ? k / (2 * half) : 0];
}

const wx = [0, 0, 0, 0];
const dx = [0, 0, 0, 0];
const wy = [0, 0, 0, 0];
const dy = [0, 0, 0, 0];

/** Offset D(q) and its Jacobian [dDx/dx, dDx/dy, dDy/dx, dDy/dy]. */
function offsetAt(g: PreparedGrid, qx: number, qy: number, out: number[]): void {
  const [cx, fx, sx] = axis(qx, g.hw, g.cols);
  const [cy, fy, sy] = axis(qy, g.hh, g.rows);
  weights(fx, wx, dx);
  weights(fy, wy, dy);
  out.fill(0);
  for (let b = 0; b < 4; b++) {
    const r = clampInt(cy - 1 + b, 0, g.rows - 1);
    for (let a = 0; a < 4; a++) {
      const i = (r * g.cols + clampInt(cx - 1 + a, 0, g.cols - 1)) * 2;
      const ox = g.offsets[i];
      const oy = g.offsets[i + 1];
      const w = wx[a] * wy[b];
      const wdx = dx[a] * wy[b] * sx;
      const wdy = wx[a] * dy[b] * sy;
      out[0] += w * ox;
      out[1] += w * oy;
      out[2] += wdx * ox;
      out[3] += wdy * ox;
      out[4] += wdx * oy;
      out[5] += wdy * oy;
    }
  }
}

/** Rest-grid point q with F(q) = (x, y), by Newton steps. */
export function pullBack(g: PreparedGrid, x: number, y: number): [number, number] {
  const o = [0, 0, 0, 0, 0, 0];
  let qx = x;
  let qy = y;
  for (let k = 0; k < GRID_STEPS; k++) {
    offsetAt(g, qx, qy, o);
    const ex = qx + o[0] - x;
    const ey = qy + o[1] - y;
    const a = 1 + o[2];
    const b = o[3];
    const c = o[4];
    const d = 1 + o[5];
    const det = a * d - b * c;
    let sx = ex;
    let sy = ey;
    if (Math.abs(det) > GRID_MIN_DET) {
      sx = (d * ex - b * ey) / det;
      sy = (a * ey - c * ex) / det;
    }
    const len = Math.hypot(sx, sy);
    if (len > GRID_MAX_STEP) {
      sx *= GRID_MAX_STEP / len;
      sy *= GRID_MAX_STEP / len;
    }
    qx -= sx;
    qy -= sy;
  }
  return [qx, qy];
}

/** Oklab color at rest-grid point q (may lie slightly outside sRGB). */
export function colorAtRest(g: PreparedGrid, qx: number, qy: number): Oklab {
  const [cx, fx] = axis(qx, g.hw, g.cols);
  const [cy, fy] = axis(qy, g.hh, g.rows);
  weights(fx, wx, dx);
  weights(fy, wy, dy);
  const lab: Oklab = [0, 0, 0];
  for (let b = 0; b < 4; b++) {
    const r = clampInt(cy - 1 + b, 0, g.rows - 1);
    for (let a = 0; a < 4; a++) {
      const i = (r * g.cols + clampInt(cx - 1 + a, 0, g.cols - 1)) * 3;
      const w = wx[a] * wy[b];
      for (let k = 0; k < 3; k++) lab[k] += w * g.colors[i + k];
    }
  }
  return lab;
}

/** Oklab color of the grid at pattern-space point (x, y). */
export function evaluateGrid(g: PreparedGrid, x: number, y: number): Oklab {
  return colorAtRest(g, ...pullBack(g, x, y));
}

/** Where rest-grid point q lands: F(q). For drawing the grid lines. */
export function forwardMap(g: PreparedGrid, qx: number, qy: number): [number, number] {
  const o = [0, 0, 0, 0, 0, 0];
  offsetAt(g, qx, qy, o);
  return [qx + o[0], qy + o[1]];
}
