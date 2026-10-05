import { describe, expect, it } from 'vitest';
import type { Oklch } from '../../src/color/types';
import type { PlanesPattern } from '../../src/design/design';
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
  it('maps the count slider to 4..24 planes', () => {
    expect(planeCount(0)).toBe(4);
    expect(planeCount(1)).toBe(MAX_PLANES);
    expect(planeCount(NaN)).toBe(14);
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

  it('rejects an empty palette', () => {
    expect(() => preparePlanes(planes({ colors: [] }), frame)).toThrow(RangeError);
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
