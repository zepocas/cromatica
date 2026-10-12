import { describe, expect, it } from 'vitest';
import {
  clusterImage,
  frameToImage,
  imageLayout,
  imageToFrame,
  nearestSample,
  pickPalette,
  sampleColor,
  sampleGrid,
  type ColorCluster,
} from '../../src/color/extract';
import { oklabDistance } from '../../src/color/gamut';
import { hexToOklch } from '../../src/color/hex';
import { oklabToOklch, oklchToOklab } from '../../src/color/oklab';
import type { Oklab } from '../../src/color/types';
import { createRng } from '../../src/design/random';

type Px = [number, number, number, number?];

/** RGBA8 image from a per-pixel function. */
function image(width: number, height: number, f: (x: number, y: number) => Px): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = f(x, y);
      out.set([r, g, b, a], (y * width + x) * 4);
    }
  return out;
}

const RED: Px = [220, 40, 40];
const BLUE: Px = [30, 60, 200];
const lab = (hex: string) => oklchToOklab(hexToOklch(hex));
const dist = (a: Oklab, b: Oklab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const cluster = (color: Oklab, weight: number, x = 0.5, y = 0.5): ColorCluster => ({ color, weight, x, y });

describe('clusterImage', () => {
  // 70% red on the left, 30% blue on the right.
  const twoTone = image(40, 20, (x) => (x < 28 ? RED : BLUE));

  it('finds the colors and their area shares', () => {
    const palette = pickPalette(clusterImage(twoTone, 40, 20, createRng(1)));
    expect(palette).toHaveLength(2);
    expect(dist(palette[0].color, lab('#dc2828'))).toBeLessThan(1e-6);
    expect(palette[0].weight).toBeCloseTo(0.7, 6);
    expect(dist(palette[1].color, lab('#1e3cc8'))).toBeLessThan(1e-6);
    expect(palette[1].weight).toBeCloseTo(0.3, 6);
  });

  it('sorts clusters by weight and their weights sum to 1', () => {
    const noisy = image(32, 32, (x, y) => [(x * 37 + y * 11) % 256, (x * 5 + y * 73) % 256, (x * y) % 256]);
    const clusters = clusterImage(noisy, 32, 32, createRng(3));
    expect(clusters.length).toBeGreaterThan(8);
    expect(clusters.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 9);
    for (let i = 1; i < clusters.length; i++) expect(clusters[i].weight).toBeLessThanOrEqual(clusters[i - 1].weight);
  });

  it('is deterministic for a given seed', () => {
    const noisy = image(32, 32, (x, y) => [(x * 37) % 256, (y * 73) % 256, (x * y) % 256]);
    expect(clusterImage(noisy, 32, 32, createRng(7))).toEqual(clusterImage(noisy, 32, 32, createRng(7)));
  });

  it('places each cluster at its densest spot, not its centroid', () => {
    // Blue: a 12×12 block in the top-right corner plus a 1 px column on the
    // left edge, which drags blue's centroid to x ≈ 0.66. Its peak stays in the block.
    const img = image(48, 48, (x, y) => ((x >= 36 && y < 12) || x === 0 ? BLUE : RED));
    const clusters = clusterImage(img, 48, 48, createRng(1));
    const blue = clusters.find((c) => dist(c.color, lab('#1e3cc8')) < 1e-6)!;
    expect(blue.x).toBeGreaterThan(0.75);
    expect(blue.y).toBeLessThan(0.25);
  });

  it('ignores transparent pixels', () => {
    const img = image(20, 20, (x) => (x < 15 ? [0, 0, 0, 0] : RED));
    const clusters = clusterImage(img, 20, 20, createRng(1));
    expect(clusters).toHaveLength(1);
    expect(clusters[0].weight).toBe(1);
  });

  it('returns nothing for a fully transparent image', () => {
    expect(
      clusterImage(
        image(4, 4, () => [0, 0, 0, 0]),
        4,
        4,
        createRng(1),
      ),
    ).toEqual([]);
  });
});

describe('pickPalette', () => {
  const dark: Oklab = [0.15, 0, 0];
  const darkish: Oklab = [0.2, 0.01, 0];
  const mid: Oklab = [0.5, 0, 0];
  const accent: Oklab = [0.7, 0.15, 0.1];
  const clusters = [cluster(dark, 0.6), cluster(darkish, 0.25), cluster(mid, 0.1), cluster(accent, 0.05)];

  it('always starts with the largest cluster', () => {
    for (const bias of [0, 0.5, 1]) expect(pickPalette(clusters, { bias })[0].color).toBe(dark);
  });

  it('skips near-duplicates of picked colors', () => {
    const colors = pickPalette(clusters, { bias: 0 }).map((c) => c.color);
    expect(colors).not.toContain(darkish);
    expect(colors).toEqual([dark, mid, accent]);
  });

  it('bias 1 takes the most distinct color first, bias 0 the largest', () => {
    const many = [cluster(dark, 0.5), cluster(mid, 0.3), cluster(accent, 0.2)];
    expect(pickPalette(many, { bias: 0, max: 2 })[1].color).toBe(mid);
    expect(pickPalette(many, { bias: 1, max: 2 })[1].color).toBe(accent);
  });

  it('respects max', () => {
    expect(pickPalette(clusters, { max: 2 })).toHaveLength(2);
  });

  it('returns nothing for no clusters', () => {
    expect(pickPalette([])).toEqual([]);
  });
});

describe('imageLayout', () => {
  it('maps image corners onto the frame corners when the aspects match', () => {
    const geo = imageLayout([cluster(mid(), 0.5, 1, 0), cluster(mid(), 0.5, 0, 1)], { imageAspect: 2, frameAspect: 2 });
    expect(geo[0].x).toBeCloseTo(1, 9);
    expect(geo[0].y).toBeCloseTo(0.5, 9);
    expect(geo[1].x).toBeCloseTo(-1, 9);
    expect(geo[1].y).toBeCloseTo(-0.5, 9);
  });

  it('covers a wider frame with a portrait image (cropping top and bottom)', () => {
    const [p] = imageLayout([cluster(mid(), 1, 1, 0)], { imageAspect: 0.5, frameAspect: 2 });
    // Scaled ×4 so its width matches the frame; its top edge sits far above the frame.
    expect(p.x).toBeCloseTo(1, 9);
    expect(p.y).toBeCloseTo(2, 9);
  });

  it('gives larger areas larger radii, unless areaPower is 0', () => {
    const palette = [cluster(mid(), 0.8), cluster(mid(), 0.2)];
    const [big, small] = imageLayout(palette, { imageAspect: 1, frameAspect: 1 });
    expect(big.radius).toBeGreaterThan(small.radius);
    const [a, b] = imageLayout(palette, { imageAspect: 1, frameAspect: 1, areaPower: 0 });
    expect(a.radius).toBe(b.radius);
  });

  function mid(): Oklab {
    return [0.5, 0, 0];
  }
});

describe('image positions', () => {
  const fit = (imageAspect: number, frameAspect: number) => ({ imageAspect, frameAspect });

  it('maps the image onto the frame the way imageLayout lays it out, and back', () => {
    for (const [imageAspect, frameAspect] of [
      [2, 16 / 9],
      [0.5, 16 / 9],
      [16 / 9, 16 / 9],
      [1, 9 / 16],
    ]) {
      for (const [u, v] of [
        [0.5, 0.5],
        [0.2, 0.8],
        [1, 0],
      ]) {
        const [x, y] = imageToFrame(u, v, fit(imageAspect, frameAspect));
        const [u2, v2] = frameToImage(x, y, fit(imageAspect, frameAspect));
        expect(u2).toBeCloseTo(u, 9);
        expect(v2).toBeCloseTo(v, 9);
      }
    }
    const [peak] = imageLayout([{ color: [0.5, 0, 0], weight: 1, x: 0.25, y: 0.75 }], fit(2, 16 / 9));
    const [x, y] = imageToFrame(0.25, 0.75, fit(2, 16 / 9));
    expect([peak.x, peak.y]).toEqual([x, y]);
  });

  it('crops the long side: a wide image spans more than the frame, a tall one less', () => {
    expect(imageToFrame(1, 0.5, fit(3, 16 / 9))[0]).toBeGreaterThan(16 / 9 / 2);
    expect(imageToFrame(0.5, 0, fit(0.5, 16 / 9))[1]).toBeGreaterThan(0.5);
  });

  it('clamps a frame position outside the image to its edge', () => {
    expect(frameToImage(10, -10, fit(2, 16 / 9))).toEqual([1, 1]);
  });
});

describe('sampleColor', () => {
  const split = (x: number): Px => (x < 20 ? [220, 40, 40] : [30, 60, 200]);

  it('reads the color at a position, not the image average', () => {
    const rgba = image(40, 20, (x) => split(x));
    const left = sampleColor(rgba, 40, 20, 0.2, 0.5)!;
    const right = sampleColor(rgba, 40, 20, 0.8, 0.5)!;
    expect(oklabDistance(left, oklchToOklab(hexToOklch('#DC2828')))).toBeLessThan(0.01);
    expect(oklabDistance(right, oklchToOklab(hexToOklch('#1E3CC8')))).toBeLessThan(0.01);
  });

  it('averages a small square, so a single odd pixel does not decide', () => {
    const rgba = image(100, 100, (x, y) => (x === 50 && y === 50 ? [255, 255, 255] : [20, 20, 20]));
    const dark = oklabToOklch(sampleColor(rgba, 100, 100, 0.5, 0.5)!);
    expect(dark[0]).toBeLessThan(0.4);
  });

  it('is null over transparent pixels and clamps to the edges', () => {
    const rgba = image(10, 10, () => [200, 100, 50, 0]);
    expect(sampleColor(rgba, 10, 10, 0.5, 0.5)).toBeNull();
    const solid = image(10, 10, () => [200, 100, 50]);
    expect(sampleColor(solid, 10, 10, 1.5, -2)).not.toBeNull();
  });
});

describe('finding a color in the image', () => {
  const rgba = image(40, 20, (x) => (x < 20 ? [220, 40, 40] : [30, 60, 200]));
  const red = oklchToOklab(hexToOklch('#DC2828'));
  const blue = oklchToOklab(hexToOklch('#1E3CC8'));

  it('samples a grid across the image and drops transparent spots', () => {
    const grid = sampleGrid(rgba, 40, 20, 10);
    expect(grid).toHaveLength(100);
    expect(grid[0]).toMatchObject({ u: 0.05, v: 0.05 });
    const holes = image(10, 10, (x) => (x < 5 ? [200, 100, 50, 0] : [200, 100, 50]));
    // Spots well inside the transparent half are gone; one beside the edge still reads the opaque side.
    const kept = sampleGrid(holes, 10, 10, 10);
    expect(kept.every((p) => p.u > 0.35)).toBe(true);
    expect(kept.some((p) => p.u > 0.9)).toBe(true);
  });

  it('finds where each color sits', () => {
    const grid = sampleGrid(rgba, 40, 20, 10);
    expect(nearestSample(grid, red)!.u).toBeLessThan(0.5);
    expect(nearestSample(grid, blue)!.u).toBeGreaterThan(0.5);
    expect(nearestSample([], red)).toBeNull();
  });

  it('keeps colors that match alike apart, and gives up the gap rather than a match', () => {
    const grid = sampleGrid(rgba, 40, 20, 10);
    const first = nearestSample(grid, red)!;
    const second = nearestSample(grid, red, [first])!;
    expect(Math.hypot(second.u - first.u, second.v - first.v)).toBeGreaterThanOrEqual(0.08);
    expect(oklabDistance(second.color, red)).toBeLessThan(0.01);
    const lone = [{ u: 0.5, v: 0.5, color: red }];
    expect(nearestSample(lone, red, [{ u: 0.5, v: 0.5 }])).toBe(lone[0]);
  });
});
