import { describe, expect, it } from 'vitest';
import {
  addMonitor,
  blockBounds,
  isJoined,
  layoutRow,
  placeMonitor,
  removeMonitor,
  resizeMonitor,
  touching,
  type Monitor,
} from '../../src/ui/monitor-layout';

const size = { w: 2350, h: 1320 };
const two = () => layoutRow([size, size]);
const at = (m: Monitor[], id: number) => m.find((x) => x.id === id)!;

describe('monitor layout', () => {
  it('starts as monitors side by side, tops aligned and touching', () => {
    const m = two();
    expect(touching(m[0], m[1])).toBe(true);
    expect(m[1].x).toBe(m[0].w);
    expect(m[1].y).toBe(m[0].y);
  });

  it('puts a dragged monitor under the other and follows the pointer along the shared edge', () => {
    const m = placeMonitor(two(), 2, 900, 1800, 0);
    expect(at(m, 2).y).toBe(at(m, 1).h);
    expect(at(m, 2).x).toBe(900);
  });

  it('lines up with the neighbour within the snap distance', () => {
    const m = placeMonitor(two(), 2, 55, 1800, 100);
    expect(at(m, 2).x).toBe(at(m, 1).x);
    expect(placeMonitor(two(), 2, 55, 1800, 0)[1].x).toBe(55);
  });

  it('never leaves a monitor floating or overlapping', () => {
    for (const [x, y] of [
      [100, 100],
      [-5000, 40],
      [9000, 9000],
    ]) {
      const m = placeMonitor(two(), 2, x, y, 0);
      expect(isJoined(m)).toBe(true);
      expect(touching(at(m, 1), at(m, 2))).toBe(true);
    }
  });

  it('leaves the layout joined when the move would split the block', () => {
    const three = addMonitor(two(), size);
    const mid = at(three, 2);
    expect(isJoined(placeMonitor(three, 2, mid.x, mid.y + 5000, 0))).toBe(true);
  });

  it('turning a monitor swaps its size and keeps the block joined', () => {
    const m = resizeMonitor(two(), 2, { w: size.h, h: size.w });
    expect(at(m, 2)).toMatchObject({ w: size.h, h: size.w });
    expect(isJoined(m)).toBe(true);
    expect(at(m, 2).x).toBe(at(m, 1).w);
  });

  it('a resize that would overlap slides the monitor to the nearest free edge', () => {
    const m = resizeMonitor(two(), 1, { w: 3000, h: 1700 });
    expect(isJoined(m)).toBe(true);
  });

  it('adds a monitor to the right of the block, at the top', () => {
    const m = addMonitor(two(), size);
    expect(m).toHaveLength(3);
    expect(at(m, 3)).toMatchObject({ x: 2 * size.w, y: 0 });
  });

  describe('inside bounds', () => {
    // Room for the pair side by side, or stacked.
    const bounds = { left: -100, top: -300, w: 4800, h: 3000 };

    it('keeps the monitor inside, however far it is dragged', () => {
      for (const [x, y] of [
        [99999, 99999],
        [-99999, -99999],
        [-99999, 99999],
      ]) {
        const m = placeMonitor(two(), 2, x, y, 0, bounds);
        const b = at(m, 2);
        expect(b.x).toBeGreaterThanOrEqual(bounds.left);
        expect(b.x + b.w).toBeLessThanOrEqual(bounds.left + bounds.w);
        expect(b.y).toBeGreaterThanOrEqual(bounds.top);
        expect(b.y + b.h).toBeLessThanOrEqual(bounds.top + bounds.h);
        expect(isJoined(m)).toBe(true);
      }
    });

    it('lines a monitor up flush with the edge of the bounds', () => {
      const m = placeMonitor(two(), 2, 2400, -250, 100, bounds);
      expect(at(m, 2).y).toBe(bounds.top);
    });

    it('takes a slot beyond the bounds, to stack a pair, only when the pointer is clearly there', () => {
      const tight = { left: 0, top: 0, w: 4700, h: 1320 };
      const stacked = placeMonitor(two(), 2, 100, 1300, 0, tight);
      expect(at(stacked, 2).y).toBe(at(stacked, 1).h);
      expect(isJoined(stacked)).toBe(true);
      // A little downward (the image has no room) stays beside the first.
      const nudged = placeMonitor(two(), 2, 2350, 150, 0, tight);
      expect(at(nudged, 2).y).toBe(0);
    });
  });

  it('keeps what else a monitor carries', () => {
    const m = resizeMonitor(
      layoutRow([
        { ...size, label: 'a' },
        { ...size, label: 'b' },
      ]),
      2,
      { ...size, w: 1000 },
    );
    expect(m.map((x) => x.label)).toEqual(['a', 'b']);
  });

  it('removing the middle monitor re-joins what is left', () => {
    const m = removeMonitor(addMonitor(two(), size), 2);
    expect(m).toHaveLength(2);
    expect(isJoined(m)).toBe(true);
  });

  it('measures the block', () => {
    expect(blockBounds(two())).toEqual({ left: 0, top: 0, w: 2 * size.w, h: size.h });
  });
});
