import { describe, expect, it } from 'vitest';
import type { Oklch } from '../../src/color/types';
import type { BlobsPattern } from '../../src/design/design';
import {
  BACKGROUND_IS_LIGHTEST,
  backgroundIndex,
  BLOB_BINS,
  blobBins,
  blobCount,
  blobDistance,
  blobReach,
  blobOutline,
  evaluateBlobs,
  evaluateBlobsHeight,
  MAX_BLOBS,
  OUTLINE_POINTS,
  prepareBlobs,
} from '../../src/engine/blobs';

const colors: Oklch[] = [
  [0.95, 0.02, 90],
  [0.8, 0.17, 85],
  [0.6, 0.2, 30],
  [0.55, 0.1, 250],
];
const blobs = (over: Partial<BlobsPattern> = {}): BlobsPattern => ({
  kind: 'blobs',
  colors,
  count: 0.5,
  size: 0.5,
  wobble: 0.6,
  grain: 0.4,
  seed: 7,
  ...over,
});
const output = { height: 360 };
type Prepared = ReturnType<typeof prepareBlobs>;
const sample = (p: Prepared, f: (p: Prepared, x: number, y: number) => number[]) => {
  const out: number[][] = [];
  for (let j = 0; j < 40; j++) for (let i = 0; i < 70; i++) out.push(f(p, (i / 70) * 1.8 - 0.9, (j / 40) * 1 - 0.5));
  return out;
};
const key = (c: ArrayLike<number>) => Array.from(c, (x) => x.toFixed(4)).join();

describe('blobs', () => {
  it('maps the count slider to 1..MAX_BLOBS blobs', () => {
    expect(blobCount(0)).toBe(1);
    expect(blobCount(1)).toBe(MAX_BLOBS);
    expect(prepareBlobs(blobs({ count: 1 }), output).count).toBe(MAX_BLOBS);
  });

  it('is the same layout for the same seed and a different one for another', () => {
    const a = prepareBlobs(blobs(), output);
    expect(prepareBlobs(blobs(), output).shape0).toEqual(a.shape0);
    expect(prepareBlobs(blobs({ seed: 8 }), output).shape0).not.toEqual(a.shape0);
  });

  it('keeps the layout as the wobble moves: only the lumps change', () => {
    const smooth = prepareBlobs(blobs({ wobble: 0 }), output);
    const lumpy = prepareBlobs(blobs({ wobble: 1 }), output);
    expect(lumpy.shape0).toEqual(smooth.shape0);
    expect(lumpy.shape2).toEqual(smooth.shape2);
    expect(Math.max(...smooth.shape1.filter((_, i) => i % 4 !== 0))).toBe(0);
    expect(Math.max(...lumpy.shape1.filter((_, i) => i % 4 !== 0))).toBeGreaterThan(0.1);
  });

  it('takes the lightest color as the background and the rest as inks', () => {
    const p = prepareBlobs(blobs(), output);
    expect(p.inkCount).toBe(3);
    // Far outside every blob only the background shows.
    expect(evaluateBlobs(p, 9, 9)).toEqual(p.background);
    expect(prepareBlobs(blobs({ colors: [colors[2]] }), output).inkCount).toBe(1);
  });

  it('stipples ink dots over black inside a blob, and nothing else', () => {
    const p = prepareBlobs(blobs({ count: 1, size: 1 }), output);
    const seen = new Set(sample(p, evaluateBlobs).map(key));
    expect(seen.has(key(p.background))).toBe(true);
    expect(seen.has(key(p.base))).toBe(true);
    // Blended dot edges aside, a deep blob shows full ink.
    expect([...Array(p.inkCount).keys()].some((i) => seen.has(key(p.inks.subarray(i * 3, i * 3 + 3))))).toBe(true);
  });

  it('grain 0 is no stipple: the ink is a smooth tone between black and the ink', () => {
    const p = prepareBlobs(blobs({ count: 1, size: 1, grain: 0 }), output);
    expect(p.dot).toBe(0);
    const inside = sample(p, evaluateBlobs).filter((c) => key(c) !== key(p.background));
    expect(inside.length).toBeGreaterThan(100);
    // Many distinct tones, where stipple has a few: black, ink and blended dot edges.
    expect(new Set(inside.map(key)).size).toBeGreaterThan(100);
    for (const c of inside)
      for (let k = 0; k < 3; k++)
        expect(c[k]).toBeGreaterThanOrEqual(
          Math.min(p.base[k], ...Array.from({ length: p.inkCount }, (_, i) => p.inks[i * 3 + k])) - 1e-9,
        );
  });

  it('the finest grain above 0 is a finer stipple than the coarsest', () => {
    expect(prepareBlobs(blobs({ grain: 0.01 }), output).dot).toBeLessThan(
      prepareBlobs(blobs({ grain: 1 }), output).dot,
    );
    expect(prepareBlobs(blobs({ grain: 0.01 }), output).dot).toBeGreaterThan(0);
  });

  it('keeps the colors in [0, 1]', () => {
    const p = prepareBlobs(blobs(), output);
    for (const c of sample(p, evaluateBlobs)) {
      for (const x of c) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
      }
    }
  });

  it('stacks the blobs: the last one is on top, so its centre reads its own dome', () => {
    const p = prepareBlobs(blobs({ size: 1, wobble: 0 }), output);
    const top = p.count - 1;
    const [h] = evaluateBlobsHeight(p, p.shape0[top * 4], p.shape0[top * 4 + 1]);
    expect(h).toBeGreaterThan(0.9);
  });

  it('has a smooth height: zero outside, rising to 1 deep inside', () => {
    const p = prepareBlobs(blobs({ count: 1, size: 1 }), output);
    const heights = sample(p, evaluateBlobsHeight).map((c) => c[0]);
    expect(Math.min(...heights)).toBe(0);
    expect(Math.max(...heights)).toBeGreaterThan(0.5);
    // A gray: lightness (the height) comes from the cube root.
    const [r, g, b] = evaluateBlobsHeight(p, p.shape0[0], p.shape0[1]);
    expect(g).toBe(r);
    expect(b).toBe(r);
  });
});

describe('blobs edits', () => {
  const edited = (edits: BlobsPattern['edits']) => prepareBlobs(blobs({ edits }), output);
  const plain = prepareBlobs(blobs(), output);
  const at = (p: Prepared, slot: number) => [...p.shape0.subarray(slot * 4, slot * 4 + 4)];

  it('leaves the layout alone for no edits, an identity order and zero shifts', () => {
    for (const edits of [
      undefined,
      { order: [], shifts: [] },
      { order: [0, 1, 2], shifts: [[0, 0]] as [number, number][] },
    ]) {
      const p = edited(edits);
      expect(p.shape0).toEqual(plain.shape0);
      expect(p.ids).toEqual(plain.ids);
    }
  });

  it('moves one blob and nothing else', () => {
    const shifts: [number, number][] = [
      [0, 0],
      [0, 0],
      [0.1, -0.05],
    ];
    const p = edited({ order: [], shifts });
    for (let slot = 0; slot < p.count; slot++) {
      const [x, y, ...rest] = at(plain, slot);
      const [ex, ey, ...erest] = at(p, slot);
      expect(erest).toEqual(rest);
      expect(ex).toBeCloseTo(x + (slot === 2 ? 0.1 : 0), 12);
      expect(ey).toBeCloseTo(y + (slot === 2 ? -0.05 : 0), 12);
    }
  });

  it('reorders the stack, and the shape, lumps and ink go with the blob', () => {
    const order = Array.from({ length: plain.count }, (_, i) => plain.count - 1 - i);
    const p = edited({ order, shifts: [] });
    expect(p.ids).toEqual(order);
    order.forEach((id, slot) => {
      expect(at(p, slot)).toEqual(at(plain, id));
      expect([...p.shape1.subarray(slot * 4, slot * 4 + 4)]).toEqual([...plain.shape1.subarray(id * 4, id * 4 + 4)]);
      expect([...p.shape2.subarray(slot * 4, slot * 4 + 4)]).toEqual([...plain.shape2.subarray(id * 4, id * 4 + 4)]);
    });
  });

  it('survives an order with duplicates and out-of-range entries, and a bad shift', () => {
    const p = edited({ order: [1, 1, 99, -2, 0.5, 0], shifts: [[Number.NaN, 0]] });
    expect([...p.ids].sort((a, b) => a - b)).toEqual(Array.from({ length: plain.count }, (_, i) => i));
    expect(p.ids.slice(0, 2)).toEqual([1, 0]);
    expect(at(p, p.ids.indexOf(0))).toEqual(at(plain, 0));
  });

  it('moving a blob moves what is drawn there', () => {
    const p = prepareBlobs(blobs({ count: 0, size: 0.6, wobble: 0 }), output);
    const top = p.count - 1;
    const [cx, cy] = at(p, top);
    const moved = prepareBlobs(
      blobs({ count: 0, size: 0.6, wobble: 0, edits: { order: [], shifts: [...Array(top).fill([0, 0]), [0.3, 0]] } }),
      output,
    );
    expect(evaluateBlobsHeight(moved, cx + 0.3, cy)).toEqual(evaluateBlobsHeight(p, cx, cy));
  });

  it('outlines each blob with points on its edge', () => {
    const base = prepareBlobs(blobs({ wobble: 1 }), output);
    // Every other blob is moved out of frame, so only the one being outlined is drawn.
    for (let id = 0; id < base.count; id++) {
      const shifts: [number, number][] = Array.from({ length: base.count }, (_, k) => (k === id ? [0, 0] : [9, 0]));
      const p = prepareBlobs(blobs({ wobble: 1, edits: { order: [], shifts } }), output);
      const outline = blobOutline(p, id);
      expect(outline).toHaveLength(OUTLINE_POINTS);
      for (const [x, y] of outline) {
        // Half covered at the edge: the dome has not started rising.
        expect(evaluateBlobsHeight(p, x, y)[0]).toBeLessThan(0.01);
        const [cx, cy] = p.shape0.subarray(id * 4, id * 4 + 2);
        // A touch toward the centre is inside it.
        expect(evaluateBlobsHeight(p, x + (cx - x) * 0.1, y + (cy - y) * 0.1)[0]).toBeGreaterThan(0);
      }
    }
  });
});

describe('blob sizes', () => {
  const sized = (scales: number[]) => prepareBlobs(blobs({ edits: { order: [], shifts: [], scales } }), output);
  const plain = prepareBlobs(blobs(), output);
  const radius = (p: Prepared, slot: number) => p.shape0[slot * 4 + 2];

  it('leaves the layout alone for no scales and for scales of 1', () => {
    for (const scales of [[], [1, 1, 1]]) expect(sized(scales).shape0).toEqual(plain.shape0);
  });

  it("scales one blob's radius and nothing else", () => {
    const p = sized([1, 1.5, 1, 0.5]);
    for (let slot = 0; slot < p.count; slot++) {
      const factor = [1, 1.5, 1, 0.5][slot] ?? 1;
      expect(radius(p, slot)).toBeCloseTo(radius(plain, slot) * factor, 12);
      expect(p.shape0[slot * 4]).toBe(plain.shape0[slot * 4]);
      expect([...p.shape1.subarray(slot * 4, slot * 4 + 4)]).toEqual([
        ...plain.shape1.subarray(slot * 4, slot * 4 + 4),
      ]);
    }
  });

  it('keeps a blob its size when the stack is reordered', () => {
    const order = Array.from({ length: plain.count }, (_, i) => plain.count - 1 - i);
    const p = prepareBlobs(blobs({ edits: { order, shifts: [], scales: [2] } }), output);
    order.forEach((id, slot) => expect(radius(p, slot)).toBeCloseTo(radius(plain, id) * (id === 0 ? 2 : 1), 12));
  });

  it('keeps a size inside the range, and treats a bad one as 1', () => {
    expect(radius(sized([100]), 0)).toBeCloseTo(radius(plain, 0) * 2.5, 12);
    expect(radius(sized([0.001]), 0)).toBeCloseTo(radius(plain, 0) * 0.25, 12);
    expect(radius(sized([Number.NaN]), 0)).toBe(radius(plain, 0));
  });

  it('draws a bigger blob bigger', () => {
    const big = prepareBlobs(blobs({ edits: { order: [], shifts: [], scales: Array(MAX_BLOBS).fill(2) } }), output);
    const covered = (p: Prepared) => sample(p, evaluateBlobsHeight).filter((c) => c[0] > 0).length;
    expect(covered(big)).toBeGreaterThan(covered(plain));
  });
});

describe('blob reach', () => {
  it("no point past a blob's reach is inside it, whatever the lumps and stretch", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const p = prepareBlobs(blobs({ seed, count: 1, size: 1, wobble: 1 }), output);
      for (let i = 0; i < p.count; i++) {
        const [cx, cy] = p.shape0.subarray(i * 4, i * 4 + 2);
        const reach = blobReach(p, i);
        for (let k = 0; k < 720; k++) {
          const a = (k / 720) * 2 * Math.PI;
          // Just past the reach, in every direction, the blob's own distance says outside.
          expect(
            blobDistance(p, i, cx + Math.cos(a) * reach * 1.001, cy + Math.sin(a) * reach * 1.001),
          ).toBeGreaterThan(-p.soft);
        }
      }
    }
  });

  it('is not loose: some outline gets within a fifth of the reach', () => {
    const p = prepareBlobs(blobs({ count: 1, size: 1, wobble: 1 }), output);
    const [cx, cy] = p.shape0.subarray(0, 2);
    const farthest = Math.max(...blobOutline(p, 0).map(([x, y]) => Math.hypot(x - cx, y - cy)));
    expect(farthest).toBeGreaterThan(blobReach(p, 0) * 0.5);
  });
});

describe('blob bins', () => {
  // The cell the shader looks p up in, in float32 as it does.
  const maskAt = (bins: ReturnType<typeof blobBins>, x: number, y: number) => {
    const f = Math.fround;
    const [left, bottom, sx, sy] = bins.box.map(f);
    const gx = f(f(f(x) - left) * sx);
    const gy = f(f(f(y) - bottom) * sy);
    if (gx < 0 || gy < 0 || gx >= BLOB_BINS || gy >= BLOB_BINS) return 0;
    return bins.masks[Math.floor(gy) * BLOB_BINS + Math.floor(gx)];
  };

  it('every blob that reaches a point is in its cell, moved and resized ones too', () => {
    const edits = { order: [2, 0], shifts: [[0.4, -0.3] as [number, number]], scales: [2.5, 0.25] };
    const missed: string[] = [];
    for (const [seed, count] of [
      [1, 0],
      [2, 0.5],
      [3, 1],
      [4, 1],
    ]) {
      for (const p of [
        prepareBlobs(blobs({ seed, count, size: 1, wobble: 1 }), output),
        prepareBlobs(blobs({ seed, count, edits }), output),
      ]) {
        const bins = blobBins(p);
        for (let j = 0; j <= 300; j++) {
          for (let k = 0; k <= 300; k++) {
            const x = (k / 300) * 4 - 2;
            const y = (j / 300) * 3 - 1.5;
            const mask = maskAt(bins, x, y);
            for (let i = 0; i < p.count; i++) {
              const inReach = Math.hypot(x - p.shape0[i * 4], y - p.shape0[i * 4 + 1]) <= blobReach(p, i);
              if (inReach && !(mask & (1 << i))) missed.push(`seed ${seed} blob ${i} at ${x}, ${y}`);
            }
          }
        }
      }
    }
    expect(missed).toEqual([]);
  });

  it('leaves out blobs far from a cell', () => {
    const p = prepareBlobs(blobs({ count: 1, size: 0 }), output);
    const bins = blobBins(p);
    const busiest = Math.max(...Array.from(bins.masks, (m) => m.toString(2).replace(/0/g, '').length));
    expect(busiest).toBeLessThan(p.count);
  });
});

describe('blobs base', () => {
  const light: Oklch[] = [
    [0.95, 0.02, 90],
    [0.85, 0.15, 85],
  ];
  const dark: Oklch[] = [
    [0.95, 0.02, 90],
    [0.35, 0.1, 255],
  ];
  const palette = (colors: Oklch[], over: Partial<BlobsPattern> = {}) =>
    prepareBlobs(blobs({ colors, base: 'palette', count: 0, size: 1, ...over }), output);
  const modeOf = (p: Prepared) => p.inkDots[3];

  it('is the black base with ink dots unless asked: the dots are the ink', () => {
    for (const base of [undefined, 'black' as const]) {
      const p = prepareBlobs(blobs({ base }), output);
      for (let i = 0; i < p.inkCount; i++) {
        expect(p.inkDots[i * 4 + 3]).toBe(0);
        expect([...p.inkDots.subarray(i * 4, i * 4 + 3)]).toEqual([...p.inks.subarray(i * 3, i * 3 + 3)]);
      }
    }
  });

  it('shades every ink with a deeper shade of itself, light or dark', () => {
    for (const colors of [light, dark]) {
      const p = palette(colors);
      expect(modeOf(p)).toBe(1);
      const dots = [...p.inkDots.subarray(0, 3)];
      const ink = [...p.inks.subarray(0, 3)];
      // Darker than the ink in every channel, and the same hue: the ratios between its channels stay close.
      for (let k = 0; k < 3; k++) expect(dots[k]).toBeLessThan(ink[k]);
      const total = (c: number[]) => c[0] + c[1] + c[2];
      expect(total(dots)).toBeGreaterThan(0);
      expect(total(dots)).toBeLessThan(total(ink) * 0.5);
    }
  });

  it('never uses white dots', () => {
    const p = palette(dark);
    expect([...p.inkDots.subarray(0, 3)].every((c) => c < 0.5)).toBe(true);
  });

  it('keeps the layout whatever the base', () => {
    const black = prepareBlobs(blobs({ base: 'black' }), output);
    const pal = prepareBlobs(blobs({ base: 'palette' }), output);
    expect(pal.shape0).toEqual(black.shape0);
    expect(pal.shape1).toEqual(black.shape1);
    expect(pal.ids).toEqual(black.ids);
  });

  it('draws the ink itself in the middle of a palette blob, and black at the edge of a light one', () => {
    const p = palette(light, { grain: 0 });
    const colorAt = (x: number, y: number) => evaluateBlobs(p, x, y);
    const [cx, cy] = p.shape0.subarray(0, 2);
    const ink = [...p.inks.subarray(0, 3)];
    // Deep inside the (large) blob, the smooth ink is the ink; just inside its edge it is near the black.
    const middle = colorAt(cx, cy);
    for (let k = 0; k < 3; k++) expect(middle[k]).toBeCloseTo(ink[k], 1);
    const outline = blobOutline(p, 0);
    const [ex, ey] = outline[0];
    const edge = colorAt(ex + (cx - ex) * 0.02, ey + (cy - ey) * 0.02);
    for (let k = 0; k < 3; k++) expect(Math.abs(edge[k] - p.base[k])).toBeLessThan(Math.abs(edge[k] - ink[k]));
  });

  it('stipples the deeper shade over a dark ink too, and none in its middle', () => {
    const p = palette(dark, { grain: 1 });
    const seen = new Set(sample(p, evaluateBlobs).map(key));
    expect(seen.has(key(p.inkDots.subarray(0, 3)))).toBe(true);
    expect(seen.has(key(p.inks.subarray(0, 3)))).toBe(true);
    // The middle of the blob is clean ink.
    const [cx, cy] = p.shape0.subarray(0, 2);
    const middle = evaluateBlobs(p, cx, cy);
    for (let k = 0; k < 3; k++) expect(middle[k]).toBeCloseTo(p.inks[k], 2);
  });

  it('keeps the colors in [0, 1]', () => {
    for (const colors of [light, dark]) {
      for (const grain of [0, 0.5, 1]) {
        const p = palette(colors, { grain, count: 0.5, size: 0.5 });
        for (const c of sample(p, evaluateBlobs)) {
          for (const x of c) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});

describe('ink order', () => {
  const inkOf = (p: Prepared) =>
    Array.from({ length: p.count }, (_, i) =>
      key(p.inks.subarray(p.shape2[i * 4 + 3] * 3, p.shape2[i * 4 + 3] * 3 + 3)),
    );

  it('takes the background from the palette by its rule, wherever the color sits', () => {
    const shuffled = [colors[2], colors[0], colors[3], colors[1]];
    const want = BACKGROUND_IS_LIGHTEST ? colors[0] : shuffled[0];
    expect(shuffled[backgroundIndex(shuffled)]).toBe(want);
    expect(key(prepareBlobs(blobs({ colors: shuffled }), output).background)).toBe(
      key(prepareBlobs(blobs({ colors: [want, ...shuffled.filter((c) => c !== want)] }), output).background),
    );
  });

  it('deals the inks to other blobs when the palette is swapped around, with the same layout', () => {
    const swapped = [colors[0], colors[3], colors[1], colors[2]];
    const a = prepareBlobs(blobs(), output);
    const b = prepareBlobs(blobs({ colors: swapped }), output);
    expect(Array.from(b.shape0)).toEqual(Array.from(a.shape0));
    expect(inkOf(b)).not.toEqual(inkOf(a));
  });
});
