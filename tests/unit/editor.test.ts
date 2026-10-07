import { describe, expect, it } from 'vitest';
import { hexToOklch } from '../../src/color/hex';
import type { Oklch } from '../../src/color/types';
import { shortestTurn } from '../../src/math';
import { EditorState } from '../../src/ui/editor.svelte';
import { emptiestSpot, median, widestGapCenter } from '../../src/ui/placement';

/** An editor on the built-in design (no opening shuffle). */
const fresh = () => new EditorState({ shuffle: false });
const colorsOf = (e: EditorState): Oklch[] => e.palette.colors;

describe('placement', () => {
  it('finds the spot farthest from every point', () => {
    const [x, y] = emptiestSpot([[-0.5, 0]], 16 / 9);
    expect(x).toBeGreaterThan(0.5);
    expect(Math.abs(y)).toBeGreaterThan(0.3);
  });

  it('centers a new stop in the widest gap, the ends included', () => {
    expect(widestGapCenter([0, 0.2, 1])).toBeCloseTo(0.6, 9);
    expect(widestGapCenter([0.6, 1])).toBeCloseTo(0.3, 9);
  });

  it('takes the median of odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe('palette adjustments', () => {
  it('turning the base hue moves the palette; switching it off undoes the turn', () => {
    const e = fresh();
    const original = colorsOf(e);
    e.palette.setBaseHueEnabled(true, 100);
    expect(colorsOf(e)).toEqual(original);
    e.palette.setBaseHue(160);
    expect(e.palette.hueOffset).toBe(60);
    expect(colorsOf(e)).not.toEqual(original);
    expect(e.palette.originalColors).toEqual(original);
    e.palette.setBaseHueEnabled(false, 0);
    expect(colorsOf(e)).toEqual(original);
    expect(e.palette.baseHue).toBeNull();
  });

  it('reset restores the colors and the base hue together', () => {
    const e = fresh();
    const original = colorsOf(e);
    e.palette.setBaseHueEnabled(true, 100);
    e.palette.setBaseHue(130);
    e.palette.resetAdjustments();
    expect(colorsOf(e)).toEqual(original);
    expect(e.palette.baseHue).toBe(100);
    expect(e.palette.hueOffset).toBe(0);
  });

  it('a direct edit bakes the adjustment in', () => {
    const e = fresh();
    e.palette.setBaseHueEnabled(true, 100);
    e.palette.setBaseHue(150);
    const edited: Oklch = [0.5, 0.1, 200];
    e.palette.setColor(0, edited);
    expect(colorsOf(e)[0]).toEqual(edited);
    expect(e.palette.hueOffset).toBe(0);
    expect(e.palette.originalColors).toBeNull();
  });

  it('a new palette or an image import starts unadjusted', () => {
    const e = fresh();
    e.palette.setBaseHueEnabled(true, 100);
    e.palette.setBaseHue(150);
    e.shuffleColors();
    expect(e.palette.hueOffset).toBe(0);
    expect(e.palette.info).not.toBeNull();
    e.palette.setBaseHue(180);
    e.applyImagePalette({ aspect: 1, palette: [{ color: [0.5, 0.1, 0.05], weight: 1, x: 0.5, y: 0.5 }] });
    expect(e.palette.hueOffset).toBe(0);
    expect(e.palette.info).toBeNull();
  });
});

describe('palette steering and edits', () => {
  it('picking a rule regenerates in it, keeping mood and key', () => {
    const e = fresh();
    e.shuffleColors();
    const { mood, key } = e.palette.info!;
    e.palette.setRule('triadic');
    expect(e.palette.info).toEqual({ rule: 'triadic', mood, key });
  });

  it('switching mood, key or rule away and back returns the same colors', () => {
    const e = fresh();
    e.shuffleColors();
    const original = colorsOf(e);
    const { rule, mood, key } = e.palette.info!;
    e.palette.setMood(mood === 'vivid' ? 'natural' : 'vivid');
    expect(colorsOf(e)).not.toEqual(original);
    e.palette.setMood(mood);
    expect(colorsOf(e)).toEqual(original);
    e.palette.setKey(key === 'low' ? 'high' : 'low');
    e.palette.setKey(key);
    expect(colorsOf(e)).toEqual(original);
    e.palette.setRule(rule === 'triadic' ? 'analogous' : 'triadic');
    e.palette.setRule(rule);
    expect(colorsOf(e)).toEqual(original);
  });

  it('keep pins rule, mood and key for shuffles', () => {
    const e = fresh();
    e.palette.setRule('complementary');
    expect(e.palette.shuffleOptions().rule).toBeUndefined();
    e.palette.keep = true;
    expect(e.palette.shuffleOptions()).toMatchObject({ rule: 'complementary', ...e.palette.info });
  });

  it('linked editing moves every color; free editing moves one', () => {
    const e = fresh();
    const before = colorsOf(e);
    e.palette.setColor(0, [before[0][0], before[0][1], before[0][2] + 40]);
    expect(colorsOf(e).slice(1)).toEqual(before.slice(1));
    e.palette.linked = true;
    e.palette.setColor(0, [before[0][0], before[0][1], before[0][2] + 80]);
    expect(colorsOf(e)[1]).not.toEqual(before[1]);
  });

  it('a linked edit puts a monochrome palette on the edited hue, its cream included', () => {
    const red = hexToOklch('#C0392B');
    for (let k = 0; k < 40; k++) {
      const e = fresh();
      e.palette.setRule('monochrome');
      e.palette.linked = true;
      const i = colorsOf(e).findIndex((c) => c[1] > 0.06);
      if (i < 0) continue;
      e.palette.setColor(i, red);
      for (const [, c, h] of colorsOf(e)) if (c >= 0.02) expect(Math.abs(shortestTurn(h, red[2]))).toBeLessThan(0.5);
    }
  });

  it('shuffling the order keeps the same colors in a new arrangement', () => {
    const e = fresh();
    const before = colorsOf(e);
    e.palette.shuffleOrder();
    const after = colorsOf(e);
    expect(after).not.toEqual(before);
    expect([...after].sort()).toEqual([...before].sort());
  });
});

describe('points and stops', () => {
  it('a new point gets the median radius; at least one point is kept', () => {
    const e = fresh();
    const radii = e.mesh.points.map((p) => p.radius);
    const i = e.addPoint(0, 0)!;
    expect(e.mesh.points[i].radius).toBe(median(radii));
    expect(e.selectedPoint).toBe(i);
    while (e.canRemovePoint) e.removePoint(0);
    expect(e.mesh.points).toHaveLength(1);
    e.removePoint(0);
    expect(e.mesh.points).toHaveLength(1);
  });

  it('a new stop takes the blend of the segment it splits; at least two stops are kept', () => {
    const e = fresh();
    e.kind = 'linear';
    e.ramp.stops[0].blend = 'oklch-long';
    const i = e.addStop(0.25)!;
    expect(e.ramp.stops[i]).toMatchObject({ position: 0.25, blend: 'oklch-long' });
    while (e.canRemoveColor) e.removeColor(0);
    expect(e.ramp.stops).toHaveLength(2);
  });

  it('add color puts a stop in the widest gap', () => {
    const e = fresh();
    e.kind = 'linear';
    e.addColor();
    expect(e.ramp.stops.at(-1)!.position).toBeCloseTo(0.25, 9);
  });
});

describe('saving and undo', () => {
  it('setDesign brings back a design exactly', () => {
    for (let i = 0; i < 40; i++) {
      const source = new EditorState();
      const e = fresh();
      e.setDesign(source.design);
      expect(e.design).toEqual(source.design);
    }
  });

  it('restore brings back every pattern and the palette state', () => {
    const e = fresh();
    e.shuffle();
    e.palette.setBaseHueEnabled(true, 40);
    e.palette.setBaseHue(90);
    const before = e.snapshot();
    const design = e.design;
    e.shuffle();
    e.kind = 'planes';
    e.palette.setBaseHue(120);
    e.restore(before);
    expect(e.design).toEqual(design);
    expect(e.palette.hueOffset).toBe(50);
    expect(JSON.stringify(e.snapshot())).toBe(JSON.stringify(before));
  });

  it('restore keeps the selection in range', () => {
    const e = fresh();
    const before = e.snapshot();
    while (e.canAddPoint) e.addPoint(0, 0);
    e.selectedPoint = e.mesh.points.length - 1;
    e.restore(before);
    expect(e.selectedPoint).toBeLessThan(e.mesh.points.length);
  });
});
