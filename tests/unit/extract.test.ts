import { describe, expect, it } from 'vitest';
import { clusterImage, imageLayout, pickPalette, type ColorCluster } from '../../src/color/extract';
import { hexToOklch, oklchToOklab } from '../../src/color/oklab';
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
