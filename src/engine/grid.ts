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
/** Grid lines (D62): opacity reaches 1 at lines 0.5; width in composition units (frame height 1) from min to max. */
export const GRID_LINE_OPACITY_AT = 0.5;
export const GRID_LINE_WIDTH: [min: number, max: number] = [0.002, 0.008];
/** How far a line pushes the lightness at full opacity, and the lightness around which it flips from darkening to lightening. */
export const GRID_LINE_PUSH = 0.32;
export const GRID_LINE_PIVOT = 0.58;
export const GRID_LINE_PIVOT_SLOPE = 4;
/** How much of the warp's displacement the lines follow (the colors follow all of it): 1 = same as the colors, 0 = lines ignore the warp. */
export const GRID_LINE_WARP = 0.5;
/** Newton steps of the pull-back, the Jacobian determinant below which a plain step is taken, and the step cap. */
export const GRID_STEPS = 8;
export const GRID_MIN_DET = 1e-3;
export const GRID_MAX_STEP = 0.25;

function glslFloat(x: number): string {
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

/** The line constants as the shader's #defines. */
export const GRID_LINE_SHADER_CONSTANTS = {
  GRID_LINE_OPACITY_AT: glslFloat(GRID_LINE_OPACITY_AT),
  GRID_LINE_WIDTH_MIN: glslFloat(GRID_LINE_WIDTH[0]),
  GRID_LINE_WIDTH_MAX: glslFloat(GRID_LINE_WIDTH[1]),
  GRID_LINE_PUSH: glslFloat(GRID_LINE_PUSH),
  GRID_LINE_PIVOT: glslFloat(GRID_LINE_PIVOT),
  GRID_LINE_PIVOT_SLOPE: glslFloat(GRID_LINE_PIVOT_SLOPE),
  GRID_LINE_WARP: glslFloat(GRID_LINE_WARP),
};

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
  /** Line amount, [0, 1]; 0 = none. */
  lines: number;
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
  return { rows, cols, hw: g.rest[0], hh: g.rest[1], offsets, colors, lines: Math.min(1, Math.max(0, g.lines ?? 0)) };
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

/**
 * Coverage [0, 1] of the grid lines at rest-grid point q (the pull-back of the
 * pixel at pattern-space (x, y)). The distance to the nearest grid line is in
 * pattern units: the line's distance in grid parameters divided by the pixel
 * gradient of that parameter, from the inverse Jacobian. `pixel` is one output
 * pixel in the same units, for the edge's antialiasing.
 */
export function lineCoverage(g: PreparedGrid, qx: number, qy: number, pixel: number): number {
  if (g.lines <= 0) return 0;
  const o = [0, 0, 0, 0, 0, 0];
  offsetAt(g, qx, qy, o);
  const a = 1 + o[2];
  const b = o[3];
  const c = o[4];
  const d = 1 + o[5];
  const det = a * d - b * c;
  if (Math.abs(det) < GRID_MIN_DET) return 0;
  const kx = g.cols - 1;
  const ky = g.rows - 1;
  const gx = ((qx + g.hw) / (2 * g.hw)) * kx;
  const gy = ((qy + g.hh) / (2 * g.hh)) * ky;
  // Grid parameter gradients per pattern unit: rows of the inverse Jacobian, scaled.
  const gradX = ((kx / (2 * g.hw)) * Math.hypot(d, b)) / Math.abs(det);
  const gradY = ((ky / (2 * g.hh)) * Math.hypot(c, a)) / Math.abs(det);
  const near = (v: number, k: number) => Math.abs(v - Math.min(k, Math.max(0, Math.round(v))));
  const dist = Math.min(near(gx, kx) / gradX, near(gy, ky) / gradY);
  const half = 0.5 * (GRID_LINE_WIDTH[0] + (GRID_LINE_WIDTH[1] - GRID_LINE_WIDTH[0]) * g.lines);
  const t = Math.min(1, Math.max(0, (dist - (half - pixel)) / (2 * pixel)));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Oklab color of the grid at pattern-space point (x, y). `pixel` (one output pixel in pattern units) is only
 * used for lines, which are drawn at `lineAt` (default: the same point; with a warp, a point part-way back
 * toward the unwarped one, so the lines bend less than the colors).
 */
export function evaluateGrid(
  g: PreparedGrid,
  x: number,
  y: number,
  pixel = 0,
  lineAt: [number, number] = [x, y],
): Oklab {
  const [qx, qy] = pullBack(g, x, y);
  const lab = colorAtRest(g, qx, qy);
  if (g.lines > 0 && pixel > 0) {
    const [lx, ly] = lineAt[0] === x && lineAt[1] === y ? [qx, qy] : pullBack(g, lineAt[0], lineAt[1]);
    const line = lineCoverage(g, lx, ly, pixel);
    const dir = Math.min(1, Math.max(-1, (GRID_LINE_PIVOT - lab[0]) * GRID_LINE_PIVOT_SLOPE));
    const opacity = Math.min(1, g.lines / GRID_LINE_OPACITY_AT);
    lab[0] += GRID_LINE_PUSH * opacity * line * dir;
  }
  return lab;
}

/** Where rest-grid point q lands: F(q). For drawing the grid lines. */
export function forwardMap(g: PreparedGrid, qx: number, qy: number): [number, number] {
  const o = [0, 0, 0, 0, 0, 0];
  offsetAt(g, qx, qy, o);
  return [qx + o[0], qy + o[1]];
}
