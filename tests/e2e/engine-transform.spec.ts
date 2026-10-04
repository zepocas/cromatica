// Renderer: whole-image transforms (D24).
import { expect, test } from '@playwright/test';
import { defaultGrain } from '../../src/design/design';
import { linear, threeStops, meshDefault, warp, withLook, turn, type StopSpec } from './support/designs';
import { engineHarness, openEngineHarness } from './support/harness';

test.beforeEach(async ({ page }) => {
  await openEngineHarness(page);
});

test.describe('transform', () => {
  const warpedMesh = withLook(meshDefault, warp('domain', 0.6, 0.4, 7));
  const warpedLinear = withLook(threeStops(30), warp('waves', 0.6, 0.4, 7));

  for (const [name, base] of [
    ['mesh', warpedMesh],
    ['linear', warpedLinear],
  ] as const) {
    test(`${name}: identity transform is bit-identical to none`, async ({ page }) => {
      const r = await engineHarness(page, 'compareDesigns', base, turn(base, {}), 480, 270);
      expect(r.identical).toBe(true);
    });

    for (const [map, t] of [
      ['flipX', { flipX: true }],
      ['flipY', { flipY: true }],
      ['rotate180', { rotate: 180 }],
    ] as const) {
      test(`${name}: ${map} permutes pixels exactly`, async ({ page }) => {
        const r = await engineHarness(page, 'compareRemapped', base, turn(base, t), 481, 271, map);
        expect(r.first).toBeNull();
        expect(r.different).toBe(true);
      });
    }

    test(`${name}: rotate 90 permutes pixels exactly on a square`, async ({ page }) => {
      const r = await engineHarness(page, 'compareRemapped', base, turn(base, { rotate: 90 }), 301, 301, 'rotate90');
      expect(r.first).toBeNull();
    });

    test(`${name}: free angle, zoom and flip match the CPU reference`, async ({ page }) => {
      const r = await engineHarness(
        page,
        'compareWarpReference',
        turn(base, { rotate: 33, zoom: 1.7, flipX: true }),
        640,
        360,
        2,
      );
      expect(r.maxDiff, JSON.stringify(r.worstAny)).toBeLessThanOrEqual(2);
    });

    test(`${name}: transformed 1531×917 single pass equals 256 px tiles (grain on)`, async ({ page }) => {
      const r = await engineHarness(
        page,
        'compareTiled',
        turn({ ...base, grain: defaultGrain }, { rotate: 117, zoom: 0.6, flipY: true }),
        1531,
        917,
        256,
        true,
      );
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
    });
  }

  test('linear: a quarter turn keeps the ramp spanning the frame', async ({ page }) => {
    // Angle 0 turned by 90° runs bottom→top: the ramp's ends land on the
    // top and bottom rows rather than off-frame.
    const stops: StopSpec[] = [
      [0, [0.628, 0.2577, 29.23]],
      [1, [0.452, 0.3132, 264.05]],
    ];
    const r = await engineHarness(
      page,
      'compareDesigns',
      linear(90, stops),
      turn(linear(0, stops), { rotate: 90 }),
      640,
      360,
    );
    expect(r.identical).toBe(true);
  });
});
