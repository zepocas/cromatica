import { describe, expect, it } from 'vitest';
import type { GridMesh } from '../../src/design/design';
import { GRID_LINE_WIDTH, evaluateGrid, lineCoverage, prepareGrid, pullBack, restPoint } from '../../src/engine/grid';

const colors = [
  [0.3, 0.1, 280],
  [0.7, 0.1, 40],
] as const;

/** An undistorted rows × cols grid over a 16:9 frame (nodes at their rest spots). */
function flat(rows: number, cols: number, lines: number): GridMesh {
  const rest: [number, number] = [8 / 9, 0.5];
  const nodes = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [x, y] = restPoint({ rows, cols, rest }, r, c);
      nodes.push({ x, y, color: [...colors[(r + c) % 2]] as [number, number, number] });
    }
  }
  return { kind: 'grid', rows, cols, nodes, rest, lines };
}

describe('grid lines', () => {
  const pixel = 1 / 1080;

  it('cover a grid line fully and leave the middle of a cell alone', () => {
    const g = prepareGrid(flat(3, 3, 1));
    expect(lineCoverage(g, 0, 0, pixel)).toBe(1);
    expect(lineCoverage(g, 0.4, 0.25, pixel)).toBe(0);
  });

  it('are as wide as the setting says, in composition units, whatever the pixel size', () => {
    for (const lines of [0, 0.5, 1]) {
      const g = prepareGrid(flat(3, 3, lines || 0.001));
      const full = GRID_LINE_WIDTH[0] + (GRID_LINE_WIDTH[1] - GRID_LINE_WIDTH[0]) * (lines || 0.001);
      for (const px of [1 / 1080, 1 / 2160]) {
        // Sweep across the horizontal line at y = 0.
        let width = 0;
        const steps = 2000;
        for (let i = 0; i < steps; i++) {
          const y = -0.02 + (0.04 * i) / steps;
          if (lineCoverage(g, 0.1, y, px) > 0.5) width += 0.04 / steps;
        }
        expect(width).toBeCloseTo(full, 3);
      }
    }
  });

  it('follow the grid when it bends', () => {
    const base = flat(3, 3, 1);
    const bent: GridMesh = {
      ...base,
      nodes: base.nodes.map((n, i) => (i === 4 ? { ...n, x: n.x + 0.2, y: n.y + 0.1 } : n)),
    };
    const g = prepareGrid(bent);
    // The middle node is a crossing of two lines, so a pixel there is on a line.
    const [qx, qy] = pullBack(g, 0.2, 0.1);
    expect(Math.hypot(qx, qy)).toBeLessThan(1e-6);
    expect(lineCoverage(g, qx, qy, pixel)).toBe(1);
  });

  it('are off at 0 or missing, and ignored without a pixel size', () => {
    const off = prepareGrid(flat(3, 3, 0));
    const missing = prepareGrid({ ...flat(3, 3, 0), lines: undefined });
    const on = prepareGrid(flat(3, 3, 1));
    expect(evaluateGrid(off, 0, 0, pixel)).toEqual(evaluateGrid(missing, 0, 0, pixel));
    expect(evaluateGrid(on, 0, 0)).toEqual(evaluateGrid(off, 0, 0));
    expect(evaluateGrid(on, 0, 0, pixel)).not.toEqual(evaluateGrid(off, 0, 0, pixel));
  });
});
