import { describe, expect, it } from 'vitest';
import { CanvasView, MAX_ZOOM } from '../../src/ui/view.svelte';

const W = 800;
const H = 450;

describe('canvas view', () => {
  it('starts fitted and ignores panning while fitted', () => {
    const v = new CanvasView();
    v.panBy(50, 50, W, H);
    expect([v.zoom, v.x, v.y]).toEqual([1, 0, 0]);
  });

  it('keeps the point under the cursor still while zooming', () => {
    const v = new CanvasView();
    v.zoomAt(2, 100, -50, W, H);
    // Frame point under the cursor: (c - t) / z, before and after.
    expect((100 - v.x) / v.zoom).toBeCloseTo(100, 9);
    expect((-50 - v.y) / v.zoom).toBeCloseTo(-50, 9);
  });

  it('clamps zoom and keeps the frame from leaving its own rect', () => {
    const v = new CanvasView();
    v.zoomAt(100, 400, 225, W, H);
    expect(v.zoom).toBe(MAX_ZOOM);
    expect(v.x).toBeGreaterThanOrEqual(-((MAX_ZOOM - 1) * W) / 2);
    v.panBy(1e6, -1e6, W, H);
    expect(v.x).toBe(((MAX_ZOOM - 1) * W) / 2);
    expect(v.y).toBe(-((MAX_ZOOM - 1) * H) / 2);
  });

  it('snaps back to fit when pinched out, and resets', () => {
    const v = new CanvasView();
    v.zoomAt(3, 200, 100, W, H);
    v.zoomAt(0.01, 200, 100, W, H);
    expect([v.zoom, v.x, v.y]).toEqual([1, 0, 0]);
    v.zoomAt(2, 0, 0, W, H);
    v.panBy(10, 10, W, H);
    v.reset();
    expect([v.zoom, v.x, v.y]).toEqual([1, 0, 0]);
  });
});
