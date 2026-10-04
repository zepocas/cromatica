import { describe, expect, it } from 'vitest';
import type { Oklch } from '../../src/color/types';
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
  it('temperature changes the colors and off restores them exactly', () => {
    const e = fresh();
    const original = colorsOf(e);
    e.palette.setTemperature('warm');
    expect(colorsOf(e)).not.toEqual(original);
    expect(e.palette.originalColors).toEqual(original);
    e.palette.setTemperature('cool');
    expect(e.palette.temperature).toBe('cool');
    e.palette.setTemperature('off');
    expect(colorsOf(e)).toEqual(original);
    expect(e.palette.originalColors).toBeNull();
  });

  it('turning the base hue moves the palette; switching it off undoes the turn', () => {
    const e = fresh();
    const original = colorsOf(e);
    e.palette.setBaseHueEnabled(true, 100);
    expect(colorsOf(e)).toEqual(original);
    e.palette.setBaseHue(160);
    expect(e.palette.hueOffset).toBe(60);
    expect(colorsOf(e)).not.toEqual(original);
    e.palette.setBaseHueEnabled(false, 0);
    expect(colorsOf(e)).toEqual(original);
    expect(e.palette.baseHue).toBeNull();
  });

  it('reset restores the colors and the base hue together', () => {
    const e = fresh();
    const original = colorsOf(e);
    e.palette.setBaseHueEnabled(true, 100);
    e.palette.setBaseHue(130);
    e.palette.setTemperature('warm');
    e.palette.resetAdjustments();
    expect(colorsOf(e)).toEqual(original);
    expect(e.palette.baseHue).toBe(100);
    expect(e.palette.temperature).toBe('off');
  });

  it('a direct edit bakes the adjustment in', () => {
    const e = fresh();
    e.palette.setTemperature('warm');
    const edited: Oklch = [0.5, 0.1, 200];
    e.palette.setColor(0, edited);
    expect(colorsOf(e)[0]).toEqual(edited);
    expect(e.palette.temperature).toBe('off');
    expect(e.palette.originalColors).toBeNull();
  });

  it('temperature carries over to a new palette; an image import starts without it', () => {
    const e = fresh();
    e.palette.setTemperature('cool');
    e.shuffleColors();
    expect(e.palette.temperature).toBe('cool');
    expect(e.palette.info).not.toBeNull();
    e.applyImagePalette({ aspect: 1, palette: [{ color: [0.5, 0.1, 0.05], weight: 1, x: 0.5, y: 0.5 }] });
    expect(e.palette.temperature).toBe('off');
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
    e.linear.stops[0].blend = 'oklch-long';
    const i = e.addStop(0.25)!;
    expect(e.linear.stops[i]).toMatchObject({ position: 0.25, blend: 'oklch-long' });
    while (e.canRemoveColor) e.removeColor(0);
    expect(e.linear.stops).toHaveLength(2);
  });

  it('add color puts a stop in the widest gap', () => {
    const e = fresh();
    e.kind = 'linear';
    e.addColor();
    expect(e.linear.stops.at(-1)!.position).toBeCloseTo(0.25, 9);
  });
});
