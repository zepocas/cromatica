// How many Newton steps the grid's pull-back needs (#98): shuffled grids and grids bent as far as the
// editor allows, sampled inside the rest frame, around its edges and well outside it.
import { describe, expect, it } from 'vitest';
import { defaultDesign, type GridMesh } from '../../src/design/design';
import { createRng } from '../../src/design/random';
import { shuffleDesign } from '../../src/design/shuffle';
import { forwardMap, GRID_STEPS, prepareGrid, pullBack, restPoint, type PreparedGrid } from '../../src/engine/grid';

/** One output pixel at 2160p, in pattern units (frame height 1). */
const PX = 1 / 2160;
const TOL = 1e-3 * PX;
const MAX_STEPS = 16;

function shuffledGrids(count: number): GridMesh[] {
  const grids: GridMesh[] = [];
  for (let seed = 1; grids.length < count && seed < 20000; seed++) {
    const { design } = shuffleDesign(defaultDesign, { colors: true, layout: true, style: true, seed });
    if (design.base.kind === 'grid') grids.push(design.base);
  }
  return grids;
}

/**
 * A grid dragged by hand: each interior node is pulled toward a random spot up to a cell away and held
 * inside its neighbours with the editor's 8% margin (the rule in `moveNode`, editor.svelte.ts).
 */
function editorGrid(rows: number, cols: number, seed: number): GridMesh {
  const rest: [number, number] = [16 / 9 / 2, 0.5];
  const g = { rows, cols, rest };
  const nodes = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [x, y] = restPoint(g, r, c);
      nodes.push({ x, y, color: [0.6, 0.1, 30] as [number, number, number] });
    }
  }
  const rng = createRng(seed);
  const gapX = (2 * rest[0]) / (cols - 1);
  const gapY = (2 * rest[1]) / (rows - 1);
  const margin = 0.08;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const n = nodes[i];
      if (c > 0 && c < cols - 1) {
        const x = n.x + rng.range(-1, 1) * gapX;
        n.x = clamp(x, nodes[i - 1].x + margin * gapX, nodes[i + 1].x - margin * gapX);
      }
      if (r > 0 && r < rows - 1) {
        const y = n.y + rng.range(-1, 1) * gapY;
        n.y = clamp(y, nodes[i - cols].y + margin * gapY, nodes[i + cols].y - margin * gapY);
      }
    }
  }
  return { kind: 'grid', rows, cols, nodes, rest };
}

/** Smallest Jacobian determinant of the forward map over the rest frame (negative = folded). */
function minDet(mesh: GridMesh): number {
  const g = prepareGrid(mesh);
  const h = 1e-5;
  let min = Infinity;
  for (let i = 0; i <= 100; i++) {
    for (let j = 0; j <= 60; j++) {
      const x = -g.hw + (2 * g.hw * i) / 100;
      const y = -g.hh + (2 * g.hh * j) / 60;
      const [ax, ay] = forwardMap(g, x + h, y);
      const [bx, by] = forwardMap(g, x - h, y);
      const [cx, cy] = forwardMap(g, x, y + h);
      const [dx, dy] = forwardMap(g, x, y - h);
      min = Math.min(min, ((ax - bx) * (cy - dy) - (cx - dx) * (ay - by)) / (4 * h * h));
    }
  }
  return min;
}

/** The same grid with every node moved back toward its rest spot by `t` (0 = flat, 1 = unchanged). */
function scaled(mesh: GridMesh, t: number): GridMesh {
  const nodes = mesh.nodes.map((n, i) => {
    const [rx, ry] = restPoint(mesh, Math.floor(i / mesh.cols), i % mesh.cols);
    return { ...n, x: rx + t * (n.x - rx), y: ry + t * (n.y - ry) };
  });
  return { ...mesh, nodes };
}

/** The grid bent as far toward `mesh` as it goes while its determinant stays above `floor` (just short of a fold). */
function nearFold(mesh: GridMesh, floor: number): GridMesh {
  if (minDet(mesh) >= floor) return mesh;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 20; k++) {
    const mid = (lo + hi) / 2;
    if (minDet(scaled(mesh, mid)) >= floor) lo = mid;
    else hi = mid;
  }
  return scaled(mesh, lo);
}

/** Sample points: a lattice over the rest frame widened by half a unit, plus far points. */
function samples(g: PreparedGrid): [number, number][] {
  const pts: [number, number][] = [];
  const wx = g.hw + 0.5;
  const wy = g.hh + 0.5;
  for (let i = 0; i <= 40; i++) {
    for (let j = 0; j <= 24; j++) pts.push([-wx + (2 * wx * i) / 40, -wy + (2 * wy * j) / 24]);
  }
  for (const [x, y] of [
    [4, 0],
    [-4, 2.5],
    [0, -3],
    [3.5, 2],
  ] as const) {
    pts.push([x, y]);
  }
  return pts;
}

const residual = (g: PreparedGrid, x: number, y: number, steps: number) => {
  const [qx, qy] = pullBack(g, x, y, steps);
  const [fx, fy] = forwardMap(g, qx, qy);
  return Math.hypot(fx - x, fy - y);
};

/** Per grid set: the steps each point needs to land within TOL (MAX_STEPS + 1 if it never does). */
function stepsNeeded(grids: GridMesh[]): number[] {
  const needed: number[] = [];
  for (const mesh of grids) {
    const g = prepareGrid(mesh);
    for (const [x, y] of samples(g)) {
      let n = 0;
      while (n <= MAX_STEPS && residual(g, x, y, n) > TOL) n++;
      needed.push(n);
    }
  }
  return needed;
}

/** Largest residual |F(q) − p| after `steps`, in pixels at 2160p. */
function worstResidual(grids: GridMesh[], steps: number): number {
  let worst = 0;
  for (const mesh of grids) {
    const g = prepareGrid(mesh);
    for (const [x, y] of samples(g)) worst = Math.max(worst, residual(g, x, y, steps) / PX);
  }
  return worst;
}

function histogram(needed: number[]): string {
  const counts = new Map<number, number>();
  for (const n of needed) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => a[0] - b[0])
    .map(([n, k]) => `${n > MAX_STEPS ? 'never' : n}: ${k}`)
    .join(', ');
}

describe('grid pull-back convergence', () => {
  const shuffled = shuffledGrids(60);
  const edited = [3, 4, 5].flatMap((rows) =>
    [3, 4, 5].flatMap((cols) => [1, 2, 3, 4].map((s) => editorGrid(rows, cols, s * 97 + rows * 10 + cols))),
  );

  const report = (name: string, grids: GridMesh[]) => {
    const worst = worstResidual(grids, GRID_STEPS);
    console.log(
      `${name} (${grids.length} grids), steps to ${TOL / PX} px: ${histogram(stepsNeeded(grids))}; ` +
        `worst after ${GRID_STEPS}: ${worst.toExponential(1)} px`,
    );
    return worst;
  };

  it('shuffled grids converge within GRID_STEPS', () => {
    expect(report('shuffled', shuffled)).toBeLessThan(TOL / PX);
  });

  it('grids bent to the editor limits can fold', () => {
    const folded = edited.filter((m) => minDet(m) < 0).length;
    console.log(`editor limits: ${folded} of ${edited.length} grids fold`);
    expect(folded).toBeGreaterThan(0);
  });

  for (const floor of [0.3, 0.1]) {
    it(`grids bent until their determinant reaches ${floor} land within a hundredth of a pixel`, () => {
      expect(
        report(
          `near a fold, det ≥ ${floor}`,
          edited.map((m) => nearFold(m, floor)),
        ),
      ).toBeLessThan(0.01);
    });
  }
});
