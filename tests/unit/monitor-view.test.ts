import { describe, expect, it } from 'vitest';
import { layoutRow } from '../../src/ui/monitor-layout';
import { coverNear, coverRect, onWallpaper, slid, stretchRect } from '../../src/ui/monitor-view';
import { screenSize } from '../../src/ui/monitors.svelte';

const pair = layoutRow([
  { w: 2000, h: 1000 },
  { w: 2000, h: 1000 },
]);

describe('wallpaper under the monitors', () => {
  it('cover fits the block at the image proportions, centred, and crops the longer side', () => {
    // Block 4000 x 1000 (4:1) under a 16:9 image: the image is cropped top and bottom.
    const r = coverRect(pair, { w: 1920, h: 1080 });
    expect(r.w).toBeCloseTo(4000);
    expect(r.h).toBeCloseTo(2250);
    expect(r.top).toBeCloseTo(-625);
    const f = onWallpaper(pair[0], r);
    expect(f.w).toBeCloseTo(0.5);
    expect(f.h).toBeCloseTo(1000 / 2250);
  });

  it('cover crops the sides of a wallpaper that is wider than the block', () => {
    const r = coverRect(pair, { w: 8000, h: 1000 });
    expect(r).toMatchObject({ left: -2000, h: 1000 });
    expect(r.w).toBeCloseTo(8000);
  });

  it('stretch gives the wallpaper to exactly the block', () => {
    const r = stretchRect(pair);
    expect(r).toEqual({ left: 0, top: 0, w: 4000, h: 1000 });
    expect(onWallpaper(pair[1], r)).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
  });

  it('sliding moves the block over the spare image and stops at its edges', () => {
    const r = coverRect(pair, { w: 1920, h: 1080 });
    const down = slid(pair, r, 0, 500);
    expect(down.top).toBeCloseTo(r.top - 500);
    expect(down.left).toBeCloseTo(r.left);
    expect(slid(pair, r, 0, 99999).top).toBeCloseTo(-1250);
    expect(slid(pair, r, 0, -99999).top).toBeCloseTo(0);
  });

  it('has nothing to slide where the image just fits', () => {
    const r = coverRect(pair, { w: 4000, h: 1000 });
    expect(slid(pair, r, 300, 300)).toEqual(r);
  });

  it('lets the block reach the top corner whatever the layout did before', () => {
    // One monitor moved under the other: the block is now 2000 x 2000 over a 16:9 image.
    const stacked = [pair[0], { ...pair[1], x: 0, y: 1000 }];
    const r = { left: -500, top: 0, w: 3556, h: 2000 };
    const corner = slid(stacked, r, -99999, -99999);
    expect(onWallpaper(stacked[0], corner)).toMatchObject({ x: 0, y: 0 });
  });
});

describe('re-fitting a wallpaper that no longer covers the block', () => {
  it('covers the new block but stays near where the image was', () => {
    const wallpaper = { w: 1920, h: 1080 };
    const prev = coverRect(pair, wallpaper);
    // The second monitor goes under the first: a 2000 x 2000 block.
    const stacked = [pair[0], { ...pair[1], x: 0, y: 1000 }];
    const r = coverNear(stacked, wallpaper, prev);
    expect(r.h).toBeCloseTo(2000);
    expect(r.w).toBeCloseTo(3556, -1);
    // Covers the block...
    expect(r.left).toBeLessThanOrEqual(0);
    expect(r.left + r.w).toBeGreaterThanOrEqual(2000);
    // ...pushed only as far as covering takes: flush with the block's left edge, not recentred.
    expect(r.left).toBeCloseTo(0);
  });
});

describe('screen size', () => {
  it('works out the physical size from the diagonal and aspect ratio', () => {
    const { w, h } = screenSize({ aspect: '16:9', diagonal: 27, portrait: false });
    expect(w / h).toBeCloseTo(16 / 9, 2);
    expect(Math.hypot(w, h)).toBeCloseTo(2700, -1);
  });

  it('swaps the sides in portrait', () => {
    const land = screenSize({ aspect: '16:10', diagonal: 14, portrait: false });
    expect(screenSize({ aspect: '16:10', diagonal: 14, portrait: true })).toEqual({ w: land.h, h: land.w });
  });
});
