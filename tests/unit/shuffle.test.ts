import { describe, expect, it } from 'vitest';
import { inSrgbGamut } from '../../src/color/oklab';
import {
  defaultDesign,
  defaultMesh,
  defaultWarp,
  MAX_MESH_POINTS,
  WARP_SHAPES,
  type Design,
  type LinearGradient,
  type PointMesh,
} from '../../src/design/design';
import { LINEAR_SHUFFLE, MESH_SHUFFLE, shuffleDesign, WARP_SHUFFLE_TABLE } from '../../src/design/shuffle';
import { applyMat2, inverseTransformMatrix } from '../../src/engine/transform';

const meshDesign: Design = {
  engineVersion: 1,
  base: defaultMesh,
  warp: defaultWarp,
  grain: { amount: 0.4, size: 0.3 },
};
const linearDesign: Design = { ...defaultDesign, grain: { amount: 0.2, size: 0.1 } };
const all = (seed: number) => ({ colors: true, layout: true, seed });

const mesh = (d: Design) => d.base as PointMesh;
const linear = (d: Design) => d.base as LinearGradient;

describe('shuffleDesign', () => {
  it('does not mutate its input', () => {
    for (const d of [meshDesign, linearDesign]) {
      const before = structuredClone(d);
      for (let s = 0; s < 20; s++) shuffleDesign(d, all(s));
      expect(d).toEqual(before);
    }
  });

  it('returns no references into the input', () => {
    const out = shuffleDesign(meshDesign, { colors: false, layout: false, seed: 1 });
    expect(out).toEqual(meshDesign);
    expect(out.base).not.toBe(meshDesign.base);
    expect(mesh(out).points[0].color).not.toBe(defaultMesh.points[0].color);
    expect(out.grain).not.toBe(meshDesign.grain);
  });

  it('is deterministic for (design, opts, aspect)', () => {
    for (const d of [meshDesign, linearDesign]) {
      for (const aspect of [16 / 9, 9 / 19.5, 1]) {
        expect(shuffleDesign(d, all(99), aspect)).toEqual(shuffleDesign(d, all(99), aspect));
      }
      expect(shuffleDesign(d, all(1))).not.toEqual(shuffleDesign(d, all(2)));
    }
  });

  it('keeps the transform and lays mesh points out on screen, not in pattern space', () => {
    const transform = { rotate: 90, zoom: 2, flipX: true, flipY: false };
    const turned: Design = { ...meshDesign, transform };
    for (let s = 0; s < 10; s++) {
      const plain = mesh(shuffleDesign(meshDesign, all(s), 16 / 9));
      const out = shuffleDesign(turned, all(s), 16 / 9);
      expect(out.transform).toEqual(transform);
      expect(out.transform).not.toBe(transform);
      // Mapped back to the screen, the points are where an untransformed shuffle puts them.
      mesh(out).points.forEach((p, i) => {
        const [x, y] = applyMat2(inverseTransformMatrix(transform), p.x, p.y);
        expect(x).toBeCloseTo(plain.points[i].x, 3);
        expect(y).toBeCloseTo(plain.points[i].y, 3);
        expect(p.radius * 2).toBeCloseTo(plain.points[i].radius, 3);
      });
    }
  });

  it('keeps base kind and grain', () => {
    for (let s = 0; s < 20; s++) {
      expect(shuffleDesign(meshDesign, all(s)).base.kind).toBe('mesh');
      expect(shuffleDesign(linearDesign, all(s)).base.kind).toBe('linear');
      expect(shuffleDesign(meshDesign, all(s)).grain).toEqual(meshDesign.grain);
    }
  });

  it('colors lock (colors=false) keeps every color exactly', () => {
    for (let s = 0; s < 30; s++) {
      const m = mesh(shuffleDesign(meshDesign, { colors: false, layout: true, seed: s }));
      expect(m.points.map((p) => p.color)).toEqual(defaultMesh.points.map((p) => p.color));
      const l = linear(shuffleDesign(linearDesign, { colors: false, layout: true, seed: s }));
      expect(l.stops.map((p) => [p.color, p.blend])).toEqual(linear(linearDesign).stops.map((p) => [p.color, p.blend]));
    }
  });

  it('layout lock (layout=false) keeps geometry and warp exactly', () => {
    for (let s = 0; s < 30; s++) {
      const md = shuffleDesign(meshDesign, { colors: true, layout: false, seed: s });
      const m = mesh(md);
      expect(m.sharpness).toBe(defaultMesh.sharpness);
      expect(m.points.map(({ x, y, radius }) => [x, y, radius])).toEqual(
        defaultMesh.points.map(({ x, y, radius }) => [x, y, radius]),
      );
      expect(md.warp).toEqual(meshDesign.warp);
      expect(m.points.map((p) => p.color)).not.toEqual(defaultMesh.points.map((p) => p.color));

      const ld = shuffleDesign(linearDesign, { colors: true, layout: false, seed: s });
      expect(linear(ld).angle).toBe(linear(linearDesign).angle);
      expect(linear(ld).stops.map((p) => p.position)).toEqual(linear(linearDesign).stops.map((p) => p.position));
      expect(ld.warp).toEqual(linearDesign.warp);
    }
  });

  it('draws colors and layout from independent streams', () => {
    for (let s = 0; s < 10; s++) {
      const full = shuffleDesign(linearDesign, all(s));
      const colorOnly = shuffleDesign(linearDesign, { colors: true, layout: false, seed: s });
      const layoutOnly = shuffleDesign(linearDesign, { colors: false, layout: true, seed: s });
      expect(linear(full).stops.map((p) => p.color)).toEqual(linear(colorOnly).stops.map((p) => p.color));
      expect(full.warp).toEqual(layoutOnly.warp);
      expect(linear(full).angle).toBe(linear(layoutOnly).angle);
    }
  });

  it('keeps mesh points mostly inside the frame, unclumped, with valid radii and counts', () => {
    for (const aspect of [16 / 9, 21 / 9, 1, 4 / 3, 9 / 19.5]) {
      const hw = aspect / 2;
      let inside = 0;
      let total = 0;
      for (let s = 0; s < 60; s++) {
        const d = shuffleDesign(meshDesign, all(s), aspect);
        const m = mesh(d);
        const n = m.points.length;
        expect(n).toBeGreaterThanOrEqual(defaultMesh.points.length - 1);
        expect(n).toBeLessThanOrEqual(defaultMesh.points.length + 1);
        expect(m.sharpness).toBeGreaterThanOrEqual(0);
        expect(m.sharpness).toBeLessThanOrEqual(1);
        const spacing = Math.sqrt(aspect / n);
        for (const p of m.points) {
          total++;
          if (Math.abs(p.x) <= hw && Math.abs(p.y) <= 0.5) inside++;
          expect(Math.abs(p.x)).toBeLessThanOrEqual(hw * MESH_SHUFFLE.overscan + 1e-4);
          expect(Math.abs(p.y)).toBeLessThanOrEqual(0.5 * MESH_SHUFFLE.overscan + 1e-4);
          expect(p.radius).toBeGreaterThan(0);
          expect(inSrgbGamut(p.color)).toBe(true);
        }
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            const a = m.points[i];
            const b = m.points[j];
            expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(spacing * 0.2);
          }
        }
      }
      expect(inside / total).toBeGreaterThan(0.8);
      expect(inside / total).toBeLessThan(1);
    }
  });

  it('respects the mesh point limits', () => {
    const big: Design = {
      ...meshDesign,
      base: {
        ...defaultMesh,
        points: Array.from({ length: MAX_MESH_POINTS }, (_, i) => ({ ...defaultMesh.points[i % 5], x: i / 10 })),
      },
    };
    const one: Design = { ...meshDesign, base: { ...defaultMesh, points: [defaultMesh.points[0]] } };
    for (let s = 0; s < 40; s++) {
      expect(mesh(shuffleDesign(big, all(s))).points.length).toBeLessThanOrEqual(MAX_MESH_POINTS);
      expect(mesh(shuffleDesign(one, all(s))).points.length).toBeGreaterThanOrEqual(1);
      expect(mesh(shuffleDesign(one, all(s))).points.length).toBeLessThanOrEqual(2);
    }
  });

  it('spreads linear stops with a minimum gap and a lightness ramp', () => {
    const five: Design = {
      ...linearDesign,
      base: {
        kind: 'linear',
        angle: 0,
        stops: [0, 0.25, 0.5, 0.75, 1].map((position) => ({ position, color: [0.5, 0.1, 30], blend: 'oklab' })),
      },
    };
    for (let s = 0; s < 50; s++) {
      const l = linear(shuffleDesign(five, all(s)));
      expect(l.stops).toHaveLength(5);
      expect(l.angle).toBeGreaterThanOrEqual(0);
      expect(l.angle).toBeLessThan(360);
      for (let i = 1; i < 5; i++) {
        expect(l.stops[i].position - l.stops[i - 1].position).toBeGreaterThanOrEqual(LINEAR_SHUFFLE.minGap - 1e-9);
      }
      expect(l.stops[0].position).toBeGreaterThanOrEqual(0);
      expect(l.stops[4].position).toBeLessThanOrEqual(1);
      const ls = l.stops.map((p) => p.color[0]);
      const asc = ls.every((x, i) => i === 0 || x >= ls[i - 1]);
      const desc = ls.every((x, i) => i === 0 || x <= ls[i - 1]);
      expect(asc || desc).toBe(true);
    }
  });

  it('produces valid warps, rarely none, within the per-shape ranges', () => {
    const counts = new Map<string, number>();
    const n = 2000;
    for (let s = 0; s < n; s++) {
      const w = shuffleDesign(linearDesign, all(s)).warp;
      expect(WARP_SHAPES).toContain(w.shape);
      const t = WARP_SHUFFLE_TABLE[w.shape];
      expect(w.amount).toBeGreaterThanOrEqual(t.amount[0] - 1e-4);
      expect(w.amount).toBeLessThanOrEqual(t.amount[1] + 1e-4);
      expect(w.size).toBeGreaterThanOrEqual(0);
      expect(w.size).toBeLessThanOrEqual(1);
      expect(w.seed >>> 0).toBe(w.seed);
      counts.set(w.shape, (counts.get(w.shape) ?? 0) + 1);
    }
    expect(counts.size).toBe(WARP_SHAPES.length);
    const none = (counts.get('none') ?? 0) / n;
    expect(none).toBeGreaterThan(0.02);
    expect(none).toBeLessThan(0.09);
  });
});
