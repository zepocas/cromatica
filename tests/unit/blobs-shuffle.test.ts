import { describe, expect, it } from 'vitest';
import { type Design, MAX_BLOBS, noWarp } from '../../src/design/design';
import { BLOBS_SHUFFLE, isSurpriseSeed, shuffleDesign, STYLE_SHUFFLE } from '../../src/design/shuffle';

const blobs: Design = {
  engineVersion: 1,
  warp: noWarp,
  base: {
    kind: 'blobs',
    colors: [
      [0.95, 0.02, 90],
      [0.8, 0.17, 85],
      [0.6, 0.2, 30],
    ],
    count: 0.5,
    size: 0.5,
    wobble: 0.6,
    grain: 0.5,
    seed: 1,
  },
};
const mesh: Design = {
  engineVersion: 1,
  warp: noWarp,
  base: { kind: 'mesh', sharpness: 0.4, points: [{ x: 0, y: 0, radius: 0.4, color: [0.7, 0.1, 200] }] },
};
const style = (seed: number) => ({ colors: true, layout: true, style: true, seed });
/** A shuffle that keeps the pattern kind and deals a new layout. */
const layout = (seed: number) => ({ colors: true, layout: true, style: false, seed });

describe('blobs in the shuffle', () => {
  it('comes up a good share of the time, between mesh and planes', () => {
    let n = 0;
    const total = 600;
    for (let s = 0; s < total; s++) if (shuffleDesign(mesh, style(s)).design.base.kind === 'blobs') n++;
    expect(n / total).toBeGreaterThan(0.08);
    expect(n / total).toBeLessThan(0.25);
    expect(STYLE_SHUFFLE.kinds.blobs).toBeGreaterThan(STYLE_SHUFFLE.kinds.mesh);
  });

  it('deals a layout inside the ranges, with at least a background and three inks', () => {
    let smooth = 0;
    const total = 300;
    for (let s = 0; s < total; s++) {
      const { design } = shuffleDesign(blobs, layout(s));
      const b = design.base;
      if (b.kind !== 'blobs') throw new Error('kept kind changed');
      expect(b.colors.length).toBeGreaterThanOrEqual(4);
      expect(b.count).toBeGreaterThanOrEqual(BLOBS_SHUFFLE.count[0]);
      expect(b.count).toBeLessThanOrEqual(BLOBS_SHUFFLE.count[1]);
      expect(b.size).toBeGreaterThanOrEqual(BLOBS_SHUFFLE.size[0]);
      expect(b.size).toBeLessThanOrEqual(BLOBS_SHUFFLE.size[1]);
      if (b.grain === 0) smooth++;
      else {
        expect(b.grain).toBeGreaterThanOrEqual(BLOBS_SHUFFLE.grain[0]);
        expect(b.grain).toBeLessThanOrEqual(BLOBS_SHUFFLE.grain[1]);
      }
      // The count never asks for more blobs than a layout holds.
      expect(Math.round(1 + (MAX_BLOBS - 1) * b.count)).toBeLessThanOrEqual(MAX_BLOBS);
    }
    // Some shuffles turn the stipple off, most do not.
    expect(smooth / total).toBeGreaterThan(0.05);
    expect(smooth / total).toBeLessThan(0.3);
  });

  it('never warps blobs with a hard cut (but a surprise seed ignores every kind profile)', () => {
    for (let s = 0; s < 400; s++) {
      if (isSurpriseSeed(s)) continue;
      const { design } = shuffleDesign(blobs, style(s));
      if (design.base.kind === 'blobs') {
        expect(['rows', 'columns', 'voronoi']).not.toContain(design.warp.shape);
      }
    }
  });

  it('gives some shuffles a palette body and most a black one, and keeps the base when only the colors change', () => {
    let palette = 0;
    const total = 400;
    for (let s = 0; s < total; s++) {
      const b = shuffleDesign(blobs, layout(s)).design.base;
      if (b.kind === 'blobs' && b.base === 'palette') palette++;
    }
    expect(palette / total).toBeGreaterThan(0.25);
    expect(palette / total).toBeLessThan(0.55);
    const paletteBlobs: Design = {
      ...blobs,
      base: { ...(blobs.base as Extract<Design['base'], { kind: 'blobs' }>), base: 'palette' },
    };
    for (let s = 0; s < 20; s++) {
      const b = shuffleDesign(paletteBlobs, { colors: true, layout: false, style: false, seed: s }).design.base;
      expect(b.kind === 'blobs' && b.base).toBe('palette');
    }
  });

  it('never deals the liquid or simplex warps to blobs, and keeps fbm faint and coarse', () => {
    let fbm = 0;
    for (let s = 0; s < 600; s++) {
      if (isSurpriseSeed(s)) continue;
      const { design } = shuffleDesign(blobs, {
        colors: false,
        layout: true,
        style: false,
        finish: true,
        levels: true,
        seed: s,
      });
      expect(['domain', 'simplex']).not.toContain(design.warp.shape);
      if (design.warp.shape === 'fbm') {
        fbm++;
        expect(design.warp.amount).toBeLessThanOrEqual(0.15);
        expect(design.warp.size).toBeGreaterThanOrEqual(0.4);
      }
    }
    // The cap is exercised: fbm still comes up.
    expect(fbm).toBeGreaterThan(5);
  });

  it('keeps hand edits when only the colors are shuffled, and drops them with a new layout', () => {
    const edited: Design = {
      ...blobs,
      base: {
        ...(blobs.base as Extract<Design['base'], { kind: 'blobs' }>),
        edits: { order: [], shifts: [[0.1, 0]], scales: [1.5] },
      },
    };
    const colorsOnly = shuffleDesign(edited, { colors: true, layout: false, style: false, seed: 4 }).design.base;
    expect(colorsOnly.kind === 'blobs' && colorsOnly.edits).toEqual({ order: [], shifts: [[0.1, 0]], scales: [1.5] });
    const newLayout = shuffleDesign(edited, layout(4)).design.base;
    expect(newLayout.kind === 'blobs' && newLayout.edits).toBeUndefined();
  });
});
