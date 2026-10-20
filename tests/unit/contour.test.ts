import { describe, expect, it } from 'vitest';
import { contourPath } from '../../src/ui/state/contour';

/** Field of a circle of radius r (negative inside) on a (cols + 1) × (rows + 1) grid over [-1, 1]². */
const circle = (cols: number, rows: number, r: number) => {
  const field = new Float32Array((cols + 1) * (rows + 1));
  const at = (i: number, j: number): [number, number] => [(i / cols) * 2 - 1, (j / rows) * 2 - 1];
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) field[j * (cols + 1) + i] = Math.hypot(...at(i, j)) - r;
  return { field, at };
};
const points = (path: string) => [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

describe('contourPath', () => {
  it('traces a circle: every point on the edge, and all the way round', () => {
    const { field, at } = circle(40, 40, 0.6);
    const p = points(contourPath(field, 40, 40, at));
    expect(p.length).toBeGreaterThan(100);
    for (const [x, y] of p) expect(Math.hypot(x, y)).toBeCloseTo(0.6, 1);
    const angles = new Set(p.map(([x, y]) => Math.round(Math.atan2(y, x) / (Math.PI / 8))));
    expect(angles.size).toBeGreaterThanOrEqual(16);
  });

  it('draws nothing when the field is all inside or all outside', () => {
    const { field, at } = circle(10, 10, 5);
    expect(contourPath(field, 10, 10, at)).toBe('');
    const outside = circle(10, 10, -1);
    expect(contourPath(outside.field, 10, 10, outside.at)).toBe('');
  });

  it('keeps two separate islands apart', () => {
    const cols = 40;
    const at = (i: number, j: number): [number, number] => [i, j];
    const field = new Float32Array((cols + 1) * (cols + 1));
    for (let j = 0; j <= cols; j++) {
      for (let i = 0; i <= cols; i++) {
        field[j * (cols + 1) + i] = Math.min(Math.hypot(i - 10, j - 20), Math.hypot(i - 30, j - 20)) - 5;
      }
    }
    const p = points(contourPath(field, cols, cols, at));
    expect(p.some(([x]) => x < 16)).toBe(true);
    expect(p.some(([x]) => x > 24)).toBe(true);
    expect(p.every(([x]) => x < 16 || x > 24)).toBe(true);
  });
});
