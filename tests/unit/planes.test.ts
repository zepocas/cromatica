import { describe, expect, it } from 'vitest';
import type { Oklch } from '../../src/color/types';
import type { PlaneEdits, PlanesPattern } from '../../src/design/design';
import { evaluatePlanes, MAX_PLANES, planeCount, preparePlanes, tearNoise } from '../../src/engine/planes';

const colors: Oklch[] = [
  [0.4, 0.08, 40],
  [0.7, 0.1, 80],
  [0.9, 0.03, 90],
  [0.3, 0.05, 250],
];
const frame = { width: 1600, height: 900 };
const planes = (over: Partial<PlanesPattern> = {}): PlanesPattern => ({
  kind: 'planes',
  colors,
  count: 0.5,
  roughness: 0.5,
  blend: 0,
  seed: 42,
  ...over,
});

describe('planes layout', () => {
  it('maps the count slider to 1..16 planes', () => {
    expect(planeCount(0)).toBe(1);
    expect(planeCount(1)).toBe(MAX_PLANES);
    expect(planeCount(NaN)).toBe(9);
    expect(preparePlanes(planes({ count: 1 }), frame).count).toBe(MAX_PLANES);
  });

  it('is deterministic per seed and differs across seeds', () => {
    const a = preparePlanes(planes(), frame);
    expect(preparePlanes(planes(), frame)).toEqual(a);
    expect(preparePlanes(planes({ seed: 43 }), frame).corners).not.toEqual(a.corners);
  });

  it('makes convex, counter-clockwise quads with unit inward normals', () => {
    for (let seed = 0; seed < 50; seed++) {
      const p = preparePlanes(planes({ seed, count: 1 }), frame);
      for (let i = 0; i < p.count; i++) {
        const cx = p.bounds[i * 3];
        const cy = p.bounds[i * 3 + 1];
        for (let e = 0; e < 4; e++) {
          const [nx, ny, c] = p.edges.subarray(i * 12 + e * 3, i * 12 + e * 3 + 3);
          expect(Math.hypot(nx, ny)).toBeCloseTo(1, 12);
          // The center is inside every edge.
          expect(nx * cx + ny * cy - c).toBeGreaterThan(0);
        }
      }
    }
  });

  it('never gives a plane the color of the one below it', () => {
    for (let seed = 0; seed < 50; seed++) {
      const p = preparePlanes(planes({ seed, count: 1 }), frame);
      let below = p.backgroundIndex;
      for (const index of p.colorIndex) {
        expect(index).not.toBe(below);
        expect(index).toBeLessThan(colors.length);
        below = index;
      }
    }
  });

  it('works with a single color', () => {
    const p = preparePlanes(planes({ colors: [colors[0]] }), frame);
    expect(new Set([p.backgroundIndex, ...p.colorIndex])).toEqual(new Set([0]));
  });

  it('works with a single plane', () => {
    const p = preparePlanes(planes({ count: 0 }), frame);
    expect(p.count).toBe(1);
    const rgb = evaluatePlanes(p, p.bounds[0], p.bounds[1]);
    rgb.forEach((c, k) => expect(c).toBeCloseTo(p.colors[k], 12));
    expect(evaluatePlanes(p, 50, 50)).toEqual(p.background);
  });

  it('rejects an empty palette', () => {
    expect(() => preparePlanes(planes({ colors: [] }), frame)).toThrow(RangeError);
  });
});

describe('planes edits', () => {
  const base = preparePlanes(planes({ count: 0.5 }), frame);
  const n = base.count;
  const edited = (edits: PlaneEdits) => preparePlanes(planes({ count: 0.5, edits }), frame);

  it('leaves the layout alone for no edits, an identity order and zero shifts', () => {
    const identity = edited({
      order: Array.from({ length: n }, (_, i) => i),
      shifts: Array.from({ length: n }, () => [0, 0]),
    });
    expect(identity.edges).toEqual(base.edges);
    expect(identity.corners).toEqual(base.corners);
    expect(identity.ids).toEqual(base.ids);
    expect(base.ids).toEqual(Array.from({ length: n }, (_, i) => i));
    expect(base.shifts.every((s) => s === 0)).toBe(true);
  });

  it('moves one plane and nothing else', () => {
    const shifts: [number, number][] = Array.from({ length: n }, () => [0, 0]);
    shifts[3] = [0.2, -0.1];
    const p = edited({ order: [], shifts });
    for (let i = 0; i < n; i++) {
      const same = i !== 3;
      expect(p.corners.subarray(i * 8, i * 8 + 8).every((c, k) => c === base.corners[i * 8 + k])).toBe(same);
    }
    expect(p.corners[3 * 8]).toBeCloseTo(base.corners[3 * 8] + 0.2, 12);
    expect(p.corners[3 * 8 + 1]).toBeCloseTo(base.corners[3 * 8 + 1] - 0.1, 12);
    expect(p.bounds[3 * 3]).toBeCloseTo(base.bounds[3 * 3] + 0.2, 12);
    expect(p.colors).toEqual(base.colors);
    // The edge planes still put the center inside by the same margin.
    for (let e = 0; e < 4; e++) {
      const [nx, ny, c] = p.edges.subarray(3 * 12 + e * 3, 3 * 12 + e * 3 + 3);
      const inside = nx * p.bounds[3 * 3] + ny * p.bounds[3 * 3 + 1] - c;
      const [bx, by, bc] = base.edges.subarray(3 * 12 + e * 3, 3 * 12 + e * 3 + 3);
      expect(inside).toBeCloseTo(bx * base.bounds[3 * 3] + by * base.bounds[3 * 3 + 1] - bc, 12);
    }
  });

  it('reorders the stack and the colors, ids and torn edges go with the planes', () => {
    const order = Array.from({ length: n }, (_, i) => n - 1 - i);
    const p = edited({ order, shifts: [] });
    expect(p.ids).toEqual(order);
    expect(p.colorIndex).toEqual(order.map((id) => base.colorIndex[id]));
    for (let slot = 0; slot < n; slot++) {
      const id = order[slot];
      expect(Array.from(p.corners.subarray(slot * 8, slot * 8 + 8))).toEqual(
        Array.from(base.corners.subarray(id * 8, id * 8 + 8)),
      );
    }
  });

  it('survives an order with duplicates, out-of-range and non-integer entries', () => {
    const p = edited({ order: [5, 5, 99, -1, 2.5, 0], shifts: [] });
    expect(p.ids.slice(0, 2)).toEqual([5, 0]);
    expect([...p.ids].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
  });

  it('treats a bad shift as no shift', () => {
    const p = edited({ order: [], shifts: [[NaN, Infinity]] });
    expect(p.corners).toEqual(base.corners);
  });

  it('moving every plane by one vector moves the whole picture, torn edges included', () => {
    const rough = preparePlanes(planes({ count: 0.5, roughness: 1 }), frame);
    const s: [number, number] = [0.31, -0.17];
    const moved = preparePlanes(
      planes({ count: 0.5, roughness: 1, edits: { order: [], shifts: Array.from({ length: n }, () => s) } }),
      frame,
    );
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      // Walk along the first plane's edges, where the tear noise acts.
      const x = -1 + (i % 20) * 0.1;
      const y = -0.5 + Math.floor(i / 20) * 0.05;
      const a = evaluatePlanes(rough, x, y);
      const b = evaluatePlanes(moved, x + s[0], y + s[1]);
      for (let c = 0; c < 3; c++) expect(b[c]).toBeCloseTo(a[c], 9);
      if (a.some((v, c) => v !== rough.background[c])) checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('planes evaluation', () => {
  it('blend widens the edges and fades the paper rim', () => {
    const crisp = preparePlanes(planes(), frame);
    const soft = preparePlanes(planes({ blend: 1 }), frame);
    expect(soft.soft).toBeGreaterThan(10 * crisp.soft);
    expect(soft.rim).toBe(0);
    expect(soft.corners).toEqual(crisp.corners);
  });

  it('shows the background far away from every plane', () => {
    const p = preparePlanes(planes(), frame);
    expect(evaluatePlanes(p, 50, 50)).toEqual(p.background);
  });

  it('shows the top plane flat at its center', () => {
    const p = preparePlanes(planes({ roughness: 0 }), frame);
    const top = p.count - 1;
    const rgb = evaluatePlanes(p, p.bounds[top * 3], p.bounds[top * 3 + 1]);
    expect(rgb).toEqual(Array.from(p.colors.subarray(top * 3, top * 3 + 3)));
  });

  it('roughness 0 means clean edges and no rim', () => {
    const p = preparePlanes(planes({ roughness: 0 }), frame);
    expect(p.tear).toBe(0);
    expect(p.rim).toBe(0);
  });

  it('tear noise stays within [-1, 1] and is continuous', () => {
    let prev = tearNoise(0, 0.1, 7);
    for (let i = 1; i <= 2000; i++) {
      const n = tearNoise(i * 1e-4, 0.1, 7);
      expect(Math.abs(n)).toBeLessThanOrEqual(1);
      expect(Math.abs(n - prev)).toBeLessThan(0.1);
      prev = n;
    }
  });
});
