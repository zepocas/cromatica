/**
 * Marching squares: the zero level of a field sampled on a (cols + 1) × (rows + 1) grid, row-major,
 * as SVG path segments (`M x y L x y` each, so loops need no chaining). `at(i, j)` is where grid
 * point (i, j) is drawn; a crossing sits along its cell edge where the field's linear interpolation
 * reaches zero.
 */
export function contourPath(
  field: ArrayLike<number>,
  cols: number,
  rows: number,
  at: (i: number, j: number) => [number, number],
): string {
  const stride = cols + 1;
  const out: string[] = [];
  const num = (x: number) => (Math.round(x * 1e4) / 1e4).toString();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      // Corners counter-clockwise from (i, j); edge e runs from corner e to corner e + 1.
      const corner = [
        [i, j],
        [i + 1, j],
        [i + 1, j + 1],
        [i, j + 1],
      ];
      const f = corner.map(([x, y]) => field[y * stride + x]);
      const inside = f.map((v) => v < 0);
      const index = (inside[0] ? 1 : 0) | (inside[1] ? 2 : 0) | (inside[2] ? 4 : 0) | (inside[3] ? 8 : 0);
      if (index === 0 || index === 15) continue;
      const crossing = (e: number): [number, number] => {
        const a = at(corner[e][0], corner[e][1]);
        const b = at(corner[(e + 1) % 4][0], corner[(e + 1) % 4][1]);
        const fa = f[e];
        const fb = f[(e + 1) % 4];
        const t = fa === fb ? 0.5 : fa / (fa - fb);
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      };
      for (const [e0, e1] of SEGMENTS[index]) {
        const [x0, y0] = crossing(e0);
        const [x1, y1] = crossing(e1);
        out.push(`M${num(x0)} ${num(y0)}L${num(x1)} ${num(y1)}`);
      }
    }
  }
  return out.join('');
}

/** Per corner-inside bit pattern (corner 0 = 1, 1 = 2, 2 = 4, 3 = 8), the edge pairs the contour joins. */
const SEGMENTS: [number, number][][] = [
  [],
  [[3, 0]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [
    [3, 0],
    [1, 2],
  ],
  [[0, 2]],
  [[2, 3]],
  [[2, 3]],
  [[0, 2]],
  [
    [0, 1],
    [2, 3],
  ],
  [[1, 2]],
  [[1, 3]],
  [[0, 1]],
  [[3, 0]],
  [],
];
