import { describe, expect, it } from 'vitest';
import { inSrgbGamut } from '../../src/color/gamut';
import {
  defaultDesign,
  defaultMesh,
  defaultWarp,
  type Design,
  type RampGradient,
  MAX_MESH_POINTS,
  type PointMesh,
  WARP_SHAPES,
} from '../../src/design/design';
import { RAMP_SHUFFLE, MESH_SHUFFLE, shuffleDesign, WARP_SHUFFLE_TABLE } from '../../src/design/shuffle';
import { applyMat2, inverseTransformMatrix, transformMatrix } from '../../src/engine/transform';

/** Just the design of a shuffle. */
const shuffled = (...args: Parameters<typeof shuffleDesign>) => shuffleDesign(...args).design;

const meshDesign: Design = {
  engineVersion: 1,
  base: defaultMesh,
  warp: defaultWarp,
  grain: { amount: 0.4, size: 0.3 },
};
const linearDesign: Design = { ...defaultDesign, grain: { amount: 0.2, size: 0.1 } };
const all = (seed: number) => ({ colors: true, layout: true, seed });

const mesh = (d: Design) => d.base as PointMesh;
const linear = (d: Design) => d.base as RampGradient;

describe('shuffleDesign', () => {
  it('does not mutate its input', () => {
    for (const d of [meshDesign, linearDesign]) {
      const before = structuredClone(d);
      for (let s = 0; s < 20; s++) shuffled(d, all(s));
      expect(d).toEqual(before);
    }
  });

  it('returns no references into the input', () => {
    const out = shuffled(meshDesign, { colors: false, layout: false, seed: 1 });
    expect(out).toEqual(meshDesign);
    expect(out.base).not.toBe(meshDesign.base);
    expect(mesh(out).points[0].color).not.toBe(defaultMesh.points[0].color);
    expect(out.grain).not.toBe(meshDesign.grain);
  });

  it('is deterministic for (design, opts, aspect)', () => {
    for (const d of [meshDesign, linearDesign]) {
      for (const aspect of [16 / 9, 9 / 19.5, 1]) {
        expect(shuffled(d, all(99), aspect)).toEqual(shuffled(d, all(99), aspect));
      }
      expect(shuffled(d, all(1))).not.toEqual(shuffled(d, all(2)));
    }
  });

  it('keeps the transform and lays mesh points out on screen, not in pattern space', () => {
    const transform = { rotate: 90, zoom: 2, flipX: true, flipY: false };
    const turned: Design = { ...meshDesign, transform };
    for (let s = 0; s < 10; s++) {
      const plain = mesh(shuffled(meshDesign, all(s), 16 / 9));
      const out = shuffled(turned, all(s), 16 / 9);
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

  it('turns the image (whatever the pattern) on a style shuffle, keeping zoom and flips, and lays mesh points out in view', () => {
    const transform = { rotate: 0, zoom: 2, flipX: true, flipY: false };
    const styled = (s: number) => ({ ...all(s), style: true });
    const turned = new Set<number>();
    for (let s = 0; s < 40; s++) {
      const out = shuffled({ ...meshDesign, transform }, styled(s), 16 / 9);
      expect(out.transform).toMatchObject({ zoom: 2, flipX: true, flipY: false });
      turned.add(out.transform!.rotate);
      expect(out.transform!.rotate).toBeGreaterThanOrEqual(0);
      expect(out.transform!.rotate).toBeLessThan(360);
    }
    expect(turned.size).toBeGreaterThan(5);
    // Same seed, same turn; and plain layout shuffles leave the rotation alone.
    expect(shuffled(meshDesign, styled(7))).toEqual(shuffled(meshDesign, styled(7)));
    expect(shuffled({ ...meshDesign, transform }, all(3)).transform).toEqual(transform);
  });

  it('lays a grid out over the turned frame, so every screen corner falls inside it', () => {
    const aspect = 16 / 9;
    let grids = 0;
    for (let s = 0; s < 80; s++) {
      const out = shuffled(meshDesign, { ...all(s), style: true }, aspect);
      if (out.base.kind !== 'grid') continue;
      grids++;
      const [hw, hh] = out.base.rest;
      for (const [x, y] of [
        [aspect / 2, 0.5],
        [-aspect / 2, 0.5],
        [aspect / 2, -0.5],
        [-aspect / 2, -0.5],
      ]) {
        const [qx, qy] = applyMat2(transformMatrix(out.transform), x, y);
        expect(Math.abs(qx)).toBeLessThanOrEqual(hw + 1e-3);
        expect(Math.abs(qy)).toBeLessThanOrEqual(hh + 1e-3);
      }
    }
    expect(grids).toBeGreaterThan(3);
  });

  it('keeps base kind and grain', () => {
    for (let s = 0; s < 20; s++) {
      expect(shuffled(meshDesign, all(s)).base.kind).toBe('mesh');
      expect(shuffled(linearDesign, all(s)).base.kind).toBe('linear');
      expect(shuffled(meshDesign, all(s)).grain).toEqual(meshDesign.grain);
    }
  });

  it('colors lock (colors=false) keeps every color exactly', () => {
    for (let s = 0; s < 30; s++) {
      const m = mesh(shuffled(meshDesign, { colors: false, layout: true, seed: s }));
      expect(m.points.map((p) => p.color)).toEqual(defaultMesh.points.map((p) => p.color));
      const l = linear(shuffled(linearDesign, { colors: false, layout: true, seed: s }));
      expect(l.stops.map((p) => [p.color, p.blend])).toEqual(linear(linearDesign).stops.map((p) => [p.color, p.blend]));
    }
  });

  it('layout lock (layout=false) keeps geometry and warp exactly', () => {
    for (let s = 0; s < 30; s++) {
      const md = shuffled(meshDesign, { colors: true, layout: false, seed: s });
      const m = mesh(md);
      expect(m.sharpness).toBe(defaultMesh.sharpness);
      expect(m.points.map(({ x, y, radius }) => [x, y, radius])).toEqual(
        defaultMesh.points.map(({ x, y, radius }) => [x, y, radius]),
      );
      expect(md.warp).toEqual(meshDesign.warp);
      expect(m.points.map((p) => p.color)).not.toEqual(defaultMesh.points.map((p) => p.color));

      const ld = shuffled(linearDesign, { colors: true, layout: false, seed: s });
      expect(linear(ld).angle).toBe(linear(linearDesign).angle);
      expect(linear(ld).stops.map((p) => p.position)).toEqual(linear(linearDesign).stops.map((p) => p.position));
      expect(ld.warp).toEqual(linearDesign.warp);
    }
  });

  it('draws colors and layout from independent streams', () => {
    for (let s = 0; s < 10; s++) {
      const full = shuffled(linearDesign, all(s));
      const colorOnly = shuffled(linearDesign, { colors: true, layout: false, seed: s });
      const layoutOnly = shuffled(linearDesign, { colors: false, layout: true, seed: s });
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
        const d = shuffled(meshDesign, all(s), aspect);
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
      expect(mesh(shuffled(big, all(s))).points.length).toBeLessThanOrEqual(MAX_MESH_POINTS);
      expect(mesh(shuffled(one, all(s))).points.length).toBeGreaterThanOrEqual(1);
      expect(mesh(shuffled(one, all(s))).points.length).toBeLessThanOrEqual(2);
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
      const l = linear(shuffled(five, all(s)));
      expect(l.stops).toHaveLength(5);
      expect(l.angle).toBeGreaterThanOrEqual(0);
      expect(l.angle).toBeLessThan(360);
      for (let i = 1; i < 5; i++) {
        expect(l.stops[i].position - l.stops[i - 1].position).toBeGreaterThanOrEqual(RAMP_SHUFFLE.minGap - 1e-9);
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
      const w = shuffled(linearDesign, all(s)).warp;
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

describe('style shuffle (pattern kind and finishes)', () => {
  const style = (seed: number, colors = true) => ({ colors, layout: true, style: true, seed });
  const colorsOf = (d: Design) => {
    const b = d.base;
    if (b.kind === 'mesh') return b.points.map((p) => p.color);
    if (b.kind === 'planes' || b.kind === 'aurora') return b.colors;
    if (b.kind === 'grid') return b.nodes.map((n) => n.color);
    return b.stops.map((s) => s.color);
  };

  it('picks every pattern kind, and finishes on and off', () => {
    const kinds = new Set<string>();
    let printed = 0;
    let banded = 0;
    for (let s = 0; s < 200; s++) {
      const d = shuffled(meshDesign, style(s));
      kinds.add(d.base.kind);
      if (d.finish!.print > 0) printed++;
      expect(d.finish!.print).toBeLessThanOrEqual(0.4);
      if (d.finish!.bands > 0) banded++;
      if (d.base.kind === 'planes' || d.base.kind === 'aurora') expect(d.finish!.bands).toBe(0);
    }
    expect(kinds).toEqual(new Set(['mesh', 'grid', 'linear', 'radial', 'conic', 'noise', 'cells', 'planes', 'aurora']));
    expect(printed).toBeGreaterThan(20);
    expect(printed).toBeLessThan(100);
    expect(banded).toBeGreaterThan(5);
  });

  it('sometimes adds subtle relief and halftone', () => {
    let relief = 0;
    let halftone = 0;
    const surfaces = new Set<string>();
    for (let s = 0; s < 400; s++) {
      const f = shuffled(meshDesign, style(s)).finish!;
      if (f.relief > 0) {
        relief++;
        surfaces.add(f.reliefStyle);
        expect(f.relief).toBeLessThanOrEqual(0.5);
        expect(f.reliefLight).toBeGreaterThanOrEqual(100);
        expect(f.reliefLight).toBeLessThanOrEqual(170);
      }
      if (f.halftone > 0) halftone++;
      expect(f.halftone).toBeLessThanOrEqual(0.35);
    }
    expect(relief).toBeGreaterThan(30);
    expect(relief).toBeLessThan(100);
    expect(surfaces).toEqual(new Set(['satin', 'glass']));
    expect(halftone).toBeGreaterThan(20);
    expect(halftone).toBeLessThan(80);
  });

  it('keeps the colors across a kind change when colors are locked', () => {
    for (let s = 0; s < 50; s++) {
      for (const d of [meshDesign, linearDesign]) {
        const out = shuffled(d, style(s, false));
        const before = colorsOf(d);
        const after = colorsOf(out);
        if (out.base.kind === 'grid') {
          // The grid deals the colors over its nodes: every node takes one of them.
          const old = new Set(before.map((c) => c.join(',')));
          for (const c of after) expect(old.has(c.join(','))).toBe(true);
        } else {
          // Ramps hold at most MAX_STOPS colors; a single color is doubled into two stops.
          expect(after.slice(0, Math.min(before.length, 8))).toEqual(before.slice(0, 8));
        }
      }
    }
  });

  it('is off without layout, and keeps the kind then', () => {
    for (let s = 0; s < 20; s++) {
      const d = shuffled(meshDesign, { colors: true, layout: false, style: true, seed: s });
      expect(d.base.kind).toBe('mesh');
      expect(d.finish).toEqual(meshDesign.finish);
    }
  });
});
