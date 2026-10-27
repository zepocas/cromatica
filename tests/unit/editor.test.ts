import { describe, expect, it } from 'vitest';
import { hexToOklch, oklchToHex } from '../../src/color/hex';
import type { Oklch } from '../../src/color/types';
import { MAX_MESH_POINTS, MAX_STOPS } from '../../src/design/design';
import { shortestTurn } from '../../src/math';
import { EditorState } from '../../src/ui/state/editor.svelte';
import { emptiestSpot, median, widestGapCenter } from '../../src/ui/state/placement';

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

  it('brightness and contrast grade the palette and undo exactly', () => {
    const e = fresh();
    const original = colorsOf(e);
    const spread = (cs: Oklch[]) => Math.max(...cs.map((c) => c[0])) - Math.min(...cs.map((c) => c[0]));
    e.palette.setContrast(0.6);
    expect(spread(colorsOf(e))).toBeGreaterThan(spread(original));
    e.palette.setContrast(-0.6);
    expect(spread(colorsOf(e))).toBeLessThan(spread(original));
    e.palette.setContrast(0);
    e.palette.setBrightness(0.5);
    const bright = colorsOf(e);
    bright.forEach((c, i) => expect(c[0]).toBeGreaterThan(original[i][0]));
    e.palette.setBrightness(-0.5);
    colorsOf(e).forEach((c, i) => expect(c[0]).toBeLessThan(original[i][0]));
    e.palette.resetAdjustments();
    expect(colorsOf(e)).toEqual(original);
    expect(e.palette.originalColors).toBeNull();
  });

  it('saturation scales chroma, gray at -1, and undoes exactly', () => {
    const e = fresh();
    const original = colorsOf(e);
    const total = (cs: Oklch[]) => cs.reduce((sum, c) => sum + c[1], 0);
    e.palette.setSaturation(0.5);
    expect(total(colorsOf(e))).toBeGreaterThan(total(original));
    e.palette.setSaturation(-0.5);
    expect(total(colorsOf(e))).toBeLessThan(total(original));
    e.palette.setSaturation(-1);
    expect(Math.max(...colorsOf(e).map((c) => c[1]))).toBeLessThan(0.05);
    e.palette.setSaturation(0);
    expect(colorsOf(e)).toEqual(original);
    expect(e.palette.originalColors).toBeNull();
  });

  it('brightness keeps the base hue turn, and contrast keeps the lightness order', () => {
    const e = fresh();
    const original = colorsOf(e);
    e.palette.setBaseHueEnabled(true, 100);
    e.palette.setBaseHue(160);
    e.palette.setContrast(0.8);
    expect(e.palette.hueOffset).toBe(60);
    const order = (cs: Oklch[]) => cs.map((_, i) => i).sort((a, b) => cs[a][0] - cs[b][0]);
    expect(order(colorsOf(e))).toEqual(order(original));
    expect(e.palette.originalColors).toEqual(original);
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

  it('the rule, mood and key are kept for shuffles one by one', () => {
    const e = fresh();
    e.palette.setRule('complementary');
    const info = e.palette.info!;
    expect(e.palette.shuffleOptions()).toMatchObject({ rule: undefined, mood: 'any', key: 'any' });
    e.palette.keepRule = true;
    expect(e.palette.shuffleOptions()).toMatchObject({ rule: 'complementary', mood: 'any', key: 'any' });
    e.palette.keepMood = true;
    expect(e.palette.shuffleOptions()).toMatchObject({ rule: 'complementary', mood: info.mood, key: 'any' });
    e.palette.keepKey = true;
    expect(e.palette.shuffleOptions()).toMatchObject({ rule: 'complementary', mood: info.mood, key: info.key });
    e.palette.keepRule = false;
    expect(e.palette.shuffleOptions().rule).toBeUndefined();
  });

  it('toggleKeepAll locks all three, or releases all three when they are', () => {
    const e = fresh();
    e.palette.keepMood = true;
    e.palette.toggleKeepAll();
    expect([e.palette.keepRule, e.palette.keepMood, e.palette.keepKey]).toEqual([true, true, true]);
    e.palette.toggleKeepAll();
    expect([e.palette.keepRule, e.palette.keepMood, e.palette.keepKey]).toEqual([false, false, false]);
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

  it('a new stop sits at its position; at least two stops are kept', () => {
    const e = fresh();
    e.kind = 'linear';
    const i = e.addStop(0.25)!;
    expect(e.ramp.stops[i]).toMatchObject({ position: 0.25 });
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

describe('pins on the image', () => {
  /** A 4 × 2 image, red on the left half and blue on the right. */
  const withImage = (e: EditorState) => {
    const data = new Uint8ClampedArray(4 * 2 * 4);
    for (let i = 0; i < 8; i++) data.set(i % 4 < 2 ? [220, 40, 40, 255] : [30, 60, 200, 255], i * 4);
    e.pins.source = { file: new Blob(), data, width: 4, height: 2, aspect: 2 };
    return e;
  };
  const hex = (e: EditorState, i: number) => oklchToHex(e.pins.items[i].color).toUpperCase();

  it('a click adds a color while the pattern can grow, and replaces the selected one at its limit', () => {
    const e = withImage(fresh());
    const before = e.mesh.points.length;
    expect(e.pins.add(0.9, 0.5)).toBe(before);
    expect(e.mesh.points).toHaveLength(before + 1);

    while (e.canAddColor) e.addColor();
    expect(e.mesh.points).toHaveLength(MAX_MESH_POINTS);
    e.selectedPoint = 2;
    expect(e.pins.add(0.1, 0.5)).toBe(2);
    expect(e.mesh.points).toHaveLength(MAX_MESH_POINTS);
    expect(hex(e, 2)).toBe('#DC2828');
  });

  it('does the same on stops, and always replaces on a net', () => {
    const e = withImage(fresh());
    e.kind = 'linear';
    while (e.canAddColor) e.addColor();
    expect(e.ramp.stops).toHaveLength(MAX_STOPS);
    e.selectedStop = 1;
    expect(e.pins.add(0.9, 0.5)).toBe(1);
    expect(e.ramp.stops).toHaveLength(MAX_STOPS);
    expect(hex(e, 1)).toBe('#1E3CC8');

    e.kind = 'grid';
    const nodes = e.grid.nodes.length;
    e.selectedNode = 3;
    expect(e.pins.add(0.1, 0.5)).toBe(3);
    expect(e.grid.nodes).toHaveLength(nodes);
    expect(hex(e, 3)).toBe('#DC2828');
  });

  it('does nothing without an image', () => {
    const e = fresh();
    expect(e.pins.add(0.5, 0.5)).toBeNull();
  });
});

describe('swapping the color order', () => {
  it('changes the colors the walkthrough watches, though not the palette snapshot', () => {
    const e = fresh();
    const colors = JSON.stringify(colorsOf(e));
    const snapshot = JSON.stringify(e.palette.snapshot());
    e.palette.shuffleOrder();
    expect(JSON.stringify(colorsOf(e))).not.toBe(colors);
    expect(JSON.stringify(e.palette.snapshot())).toBe(snapshot);
  });
});

describe('the design handed to the export worker', () => {
  it('survives structuredClone after planes are arranged by hand', () => {
    const e = fresh();
    e.kind = 'planes';
    e.setPlaneShift(0, 0.1, 0.1);
    e.setPlaneScale(0, 1.2);
    expect(() => structuredClone(e.design)).not.toThrow();
  });
});

describe('switching the pattern', () => {
  it('carries a shuffled palette across mesh, net and the other patterns', () => {
    const e = fresh();
    e.shuffleColors();
    const shown = JSON.stringify(e.palette.colors.slice(0, 1));
    for (const kind of ['linear', 'grid', 'planes', 'mesh'] as const) {
      e.switchKind(kind);
      expect(JSON.stringify(e.palette.colors.slice(0, 1))).toBe(shown);
    }
  });
});

describe('stepping the warp shape', () => {
  it('gives a shape a visible amount when the warp was off', () => {
    const e = fresh();
    e.warp.shape = 'none';
    e.warp.amount = 0;
    e.cycleWarpShape(1);
    expect(e.warp.shape).not.toBe('none');
    expect(e.warp.amount).toBeGreaterThan(0);
  });
});
