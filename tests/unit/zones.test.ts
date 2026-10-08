import { describe, expect, it } from 'vitest';
import { placeZone, type ContextScreen, type Zone } from '../../src/context/zones';

const screen: ContextScreen = {
  id: 'test',
  label: 'test',
  group: 'desktop',
  os: 'test 1',
  device: 'test',
  width: 1600,
  height: 1000,
  zones: [],
};
const zone = (z: Partial<Zone>): Zone => ({ kind: 'bar', label: 'z', x: 0, y: 0, w: 100, h: 50, ...z });

describe('zone placement', () => {
  it('maps points to fractions on the device aspect', () => {
    expect(placeZone(screen, zone({ x: 160, y: 100 }), 1.6)).toEqual({ x: 0.1, y: 0.1, w: 100 / 1600, h: 0.05 });
  });

  it('keeps zones on their anchored edges on a wider frame', () => {
    const r = placeZone(screen, zone({ x: 10, y: 20, anchorX: 'right', anchorY: 'bottom' }), 2);
    expect(r.x * 2000).toBeCloseTo(2000 - 10 - 100, 6);
    expect(r.y * 1000).toBeCloseTo(1000 - 20 - 50, 6);
  });

  it('centers on the frame', () => {
    const r = placeZone(screen, zone({ anchorX: 'center' }), 2);
    expect(r.x + r.w / 2).toBeCloseTo(0.5, 6);
  });

  it('stretches across the frame, less the side margin', () => {
    const r = placeZone(screen, zone({ x: 100, anchorX: 'stretch' }), 2);
    expect(r.x).toBeCloseTo(0.05, 6);
    expect(r.x + r.w).toBeCloseTo(0.95, 6);
  });
});
