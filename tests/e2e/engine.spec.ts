/// <reference types="node" />
import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import type { Oklch } from '../../src/color/types';
import {
  type BlendMode,
  defaultGrain,
  defaultMesh,
  type Design,
  type Grain,
  noGrain,
  noWarp,
  type Transform,
  type Warp,
  WARP_SHAPES,
  type WarpShape,
} from '../../src/design/design';
import type { EngineHarness } from './harness/engine';

declare global {
  interface Window {
    engineHarness: EngineHarness;
  }
}

type StopSpec = [position: number, color: Oklch, blend?: BlendMode];

function linear(angle: number, stops: StopSpec[]): Design {
  return {
    engineVersion: 1,
    warp: noWarp,
    grain: noGrain,
    base: {
      kind: 'linear',
      angle,
      stops: stops.map(([position, color, blend = 'oklab']) => ({ position, color, blend })),
    },
  };
}

const threeStops = (angle: number) =>
  linear(angle, [
    [0, [0.3, 0.12, 280], 'oklab'],
    [0.4, [0.62, 0.2, 350], 'oklch-short'],
    [1, [0.86, 0.13, 77]],
  ]);

// Mid-tone gradient whose channels stay away from 0 and 255, so the dither is never clipped.
const midTones = linear(20, [
  [0, [0.5, 0.08, 250]],
  [0.5, [0.62, 0.09, 150], 'oklab-chroma'],
  [1, [0.72, 0.08, 40]],
]);

async function openHarness(page: Page) {
  await page.goto('/tests/e2e/harness/engine.html');
  await page.waitForFunction(() => window.engineHarness !== undefined);
}

test.beforeEach(async ({ page }) => {
  await openHarness(page);
});

test.describe('tile independence', () => {
  for (const dither of [true, false]) {
    const label = `dither ${dither ? 'on' : 'off'}`;
    for (const angle of [30, 135]) {
      test(`1531×917 single pass equals 256 px tiles (angle ${angle}, ${label})`, async ({ page }) => {
        const r = await page.evaluate(([d, dither]) => window.engineHarness.compareTiled(d, 1531, 917, 256, dither), [
          threeStops(angle),
          dither,
        ] as const);
        expect(r.first).toBeNull();
        expect(r.identical).toBe(true);
        expect(r.tiles).toBe(24);
      });
    }

    test(`5120×2880 single pass equals 2048 px tiles (${label})`, async ({ page }) => {
      const r = await page.evaluate(([d, dither]) => window.engineHarness.compareTiled(d, 5120, 2880, 2048, dither), [
        threeStops(17),
        dither,
      ] as const);
      console.log(
        `5120×2880 ${label}: ${r.tiles} tiles, single ${r.singleMs.toFixed(0)} ms, tiled ${r.tiledMs.toFixed(0)} ms`,
      );
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
      expect(r.tiles).toBe(6);
    });

    test(`worker OffscreenCanvas tiles equal main-thread single pass (${label})`, async ({ page }) => {
      const r = await page.evaluate(([d, dither]) => window.engineHarness.compareWorker(d, 1531, 917, 300, dither), [
        threeStops(250),
        dither,
      ] as const);
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
    });
  }
});

test.describe('correctness vs CPU reference (dither off)', () => {
  for (const angle of [0, 45, 90, 180, 300]) {
    for (const [w, h] of [
      [640, 360],
      [480, 777],
    ]) {
      test(`angle ${angle}, ${w}×${h}`, async ({ page }) => {
        const r = await page.evaluate(([d, w, h]) => window.engineHarness.compareReference(d, w, h), [
          threeStops(angle),
          w,
          h,
        ] as const);
        console.log(`reference angle ${angle} ${w}×${h}: max ${r.maxDiff} (f16 model ${r.maxDiffHalf})`);
        expect(r.alphaOk).toBe(true);
        expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
      });
    }
  }

  test('hard edge, clamped ends and max stops', async ({ page }) => {
    const blends: BlendMode[] = ['oklab', 'oklab-chroma', 'oklch-short', 'oklch-long'];
    const d = linear(
      63,
      Array.from({ length: 8 }, (_, i): StopSpec => [
        // Stops start at 0.1 and end at 0.9 so both clamped ends are exercised;
        // stops 3 and 4 share a position (hard edge).
        [0.1, 0.2, 0.3, 0.45, 0.45, 0.6, 0.8, 0.9][i],
        [0.25 + i * 0.09, 0.04 + (i % 3) * 0.05, (i * 47) % 360],
        blends[i % 4],
      ]),
    );
    const r = await page.evaluate(([d]) => window.engineHarness.compareReference(d, 801, 503), [d] as const);
    console.log(`reference 8 stops: max ${r.maxDiff} (f16 model ${r.maxDiffHalf})`);
    expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
  });
});

test('cached ramp follows stop changes', async ({ page }) => {
  const r = await page.evaluate(([a, b]) => window.engineHarness.rampCache(a, b, 320, 200), [
    threeStops(10),
    midTones,
  ] as const);
  expect(r).toEqual([true, true, true, true]);
});

test.describe('dither', () => {
  test('stays within ±2 of dither off and is unbiased', async ({ page }) => {
    const r = await page.evaluate(([d]) => window.engineHarness.ditherStats(d, 1600, 1000), [midTones] as const);
    console.log(`dither: ${JSON.stringify(r)}`);
    expect(r.range[0]).toBeGreaterThan(2);
    expect(r.range[1]).toBeLessThan(253);
    expect(r.maxDiff).toBeLessThanOrEqual(2);
    for (const b of r.meanBias) expect(Math.abs(b)).toBeLessThanOrEqual(0.1);
    for (const b of r.meanBiasIdeal) expect(Math.abs(b)).toBeLessThanOrEqual(0.1);
  });

  test('removes banding from a dark, shallow gradient', async ({ page }) => {
    const dark = linear(0, [
      [0, [0.1, 0.01, 250]],
      [1, [0.14, 0.01, 250]],
    ]);
    const r = await page.evaluate(([d]) => window.engineHarness.banding(d, 3840, 256, 16), [dark] as const);
    console.log(`banding: ${JSON.stringify(r)}`);
    // Dither off: a handful of flat bands hundreds of pixels wide.
    expect(Math.max(...r.off.longestRun)).toBeGreaterThan(200);
    // Dither on: flat runs are over an order of magnitude shorter than the
    // bands (the longest happen where the ideal value sits on an integer,
    // since |TPDF| < 0.5 LSB 75% of the time), and 16×16 block averages
    // follow the continuous ramp far more closely.
    expect(Math.max(...r.on.longestRun)).toBeLessThanOrEqual(32);
    expect(r.on.block.rms).toBeLessThan(r.off.block.rms / 3);
    expect(r.on.block.max).toBeLessThan(0.25);
  });
});

test.describe('aspect behavior', () => {
  // Oklch of sRGB #ff0000 and #0000ff.
  const twoStops = linear(0, [
    [0, [0.628, 0.2577, 29.23]],
    [1, [0.452, 0.3132, 264.05]],
  ]);
  for (const [w, h] of [
    [1600, 900],
    [900, 1600],
    [700, 700],
    [2100, 300],
    [301, 1999],
  ]) {
    test(`angle 0 spans the frame at ${w}×${h}`, async ({ page }) => {
      const r = await page.evaluate(([d, w, h]) => window.engineHarness.edgeColumns(d, w, h), [
        twoStops,
        w,
        h,
      ] as const);
      expect(r.left).toBeLessThanOrEqual(1);
      expect(r.right).toBeLessThanOrEqual(1);
    });
  }
});

// ---- M2: color-point mesh -------------------------------------------------

function mesh(sharpness: number, points: [x: number, y: number, color: Oklch, radius: number][]): Design {
  return {
    engineVersion: 1,
    warp: noWarp,
    grain: noGrain,
    base: { kind: 'mesh', sharpness, points: points.map(([x, y, color, radius]) => ({ x, y, color, radius })) },
  };
}

const meshDefault: Design = { engineVersion: 1, warp: noWarp, grain: noGrain, base: defaultMesh };

// 16 points (MAX_MESH_POINTS) with vivid, partly out-of-gamut colors and varied radii.
const mesh16 = mesh(
  0.6,
  Array.from({ length: 16 }, (_, i) => [
    ((i * 0.618) % 1) * 1.9 - 0.95,
    ((i * 0.381 + 0.13) % 1) * 1.1 - 0.55,
    [0.35 + ((i * 0.29) % 0.55), 0.12 + (i % 4) * 0.07, (i * 67) % 360],
    0.12 + (i % 5) * 0.08,
  ]),
);

// sRGB primaries and secondaries: their Oklab blends leave the sRGB gamut.
const primaries = mesh(0.2, [
  [-0.6, 0.25, [0.628, 0.2577, 29.23], 0.35],
  [0.0, 0.3, [0.8664, 0.2948, 142.5], 0.35],
  [0.6, 0.25, [0.452, 0.3132, 264.05], 0.35],
  [-0.4, -0.3, [0.9054, 0.1546, 194.77], 0.3],
  [0.4, -0.3, [0.7017, 0.3225, 328.36], 0.3],
]);

// Every point far outside the frame, with extreme radii.
const farAway = (sharpness: number) =>
  mesh(sharpness, [
    [-3, 2, [0.55, 0.12, 270], 0.3],
    [4, 0.2, [0.7, 0.15, 10], 2],
    [0.5, -6, [0.8, 0.13, 70], 0.05],
    [-1e3, -1e3, [0.65, 0.1, 190], 5],
    [1e6, 1e6, [0.9, 0.05, 90], 1e-3],
    [-1e6, 3e5, [0.6, 0.2, 140], 1e3],
  ]);

// Degenerate inputs inside the frame: tiny/huge radii, coincident points.
const extreme = mesh(1, [
  [0, 0, [0.6, 0.2, 30], 1e-6],
  [0, 0, [0.7, 0.1, 200], 1e-6],
  [0.3, 0.1, [0.75, 0.15, 120], 1e5],
  [-0.5, -0.2, [0.5, 0.25, 300], 1e-3],
  [2e7, -2e7, [0.4, 0.1, 60], 0.5],
]);

test.describe('mesh tile independence', () => {
  for (const dither of [true, false]) {
    const label = `dither ${dither ? 'on' : 'off'}`;
    test(`1531×917 single pass equals 256 px tiles (${label})`, async ({ page }) => {
      const r = await page.evaluate(([d, dither]) => window.engineHarness.compareTiled(d, 1531, 917, 256, dither), [
        mesh16,
        dither,
      ] as const);
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
      expect(r.tiles).toBe(24);
    });

    test(`5120×2880 single pass equals 2048 px tiles (${label})`, async ({ page }) => {
      const r = await page.evaluate(([d, dither]) => window.engineHarness.compareTiled(d, 5120, 2880, 2048, dither), [
        mesh16,
        dither,
      ] as const);
      console.log(
        `mesh 5120×2880 ${label}: ${r.tiles} tiles, single ${r.singleMs.toFixed(0)} ms, tiled ${r.tiledMs.toFixed(0)} ms`,
      );
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
      expect(r.tiles).toBe(6);
    });

    test(`worker tiles equal main-thread single pass (${label})`, async ({ page }) => {
      const r = await page.evaluate(([d, dither]) => window.engineHarness.compareWorker(d, 1001, 777, 300, dither), [
        primaries,
        dither,
      ] as const);
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
    });
  }
});

test.describe('mesh vs CPU reference (dither off)', () => {
  const cases: [string, Design][] = [
    ['default', meshDefault],
    ['default haze', { ...meshDefault, base: { ...defaultMesh, sharpness: 0 } }],
    ['default blobby', { ...meshDefault, base: { ...defaultMesh, sharpness: 1 } }],
    ['16 points', mesh16],
    ['primaries', primaries],
    ['far away', farAway(0.5)],
    ['extreme', extreme],
  ];
  for (const [name, d] of cases) {
    for (const [w, h] of [
      [640, 360],
      [479, 777],
    ]) {
      test(`${name}, ${w}×${h}`, async ({ page }) => {
        const r = await page.evaluate(([d, w, h]) => window.engineHarness.compareReference(d, w, h), [
          d,
          w,
          h,
        ] as const);
        console.log(`mesh reference ${name} ${w}×${h}: max ${r.maxDiff}`);
        expect(r.alphaOk).toBe(true);
        expect(r.maxDiff, JSON.stringify(r.worst)).toBeLessThanOrEqual(1);
      });
    }
  }

  for (const [name, d] of [
    ['primaries', primaries],
    ['16 points', mesh16],
  ] as const) {
    test(`gamut clip stays within ΔE_OK 0.02 of CSS gamut mapping (${name})`, async ({ page }) => {
      const r = await page.evaluate(([d]) => window.engineHarness.meshGamutVsCss(d, 480, 270), [d] as const);
      console.log(`mesh gamut ${name}: ${JSON.stringify(r)}`);
      expect(r.outOfGamut).toBeGreaterThan(0);
      expect(r.clip).toBeLessThanOrEqual(0.02);
      expect(r.gpu).toBeLessThanOrEqual(0.02);
    });
  }
});

test.describe('mesh robustness', () => {
  for (const dither of [true, false]) {
    const label = `dither ${dither ? 'on' : 'off'}`;
    for (const s of [0, 1]) {
      test(`points far outside the frame give a smooth image (sharpness ${s}, ${label})`, async ({ page }) => {
        const r = await page.evaluate(([d, dither]) => window.engineHarness.imageStats(d, 1600, 900, dither), [
          farAway(s),
          dither,
        ] as const);
        console.log(`mesh far away s=${s} ${label}: ${JSON.stringify(r)}`);
        expect(r.alphaOk).toBe(true);
        expect(r.black).toBe(0);
        expect(r.min).toBeGreaterThan(10);
        expect(r.maxStep).toBeLessThanOrEqual(dither ? 3 : 1);
      });
    }

    test(`degenerate radii and positions produce no NaN specks (${label})`, async ({ page }) => {
      const r = await page.evaluate(([d, dither]) => window.engineHarness.imageStats(d, 1600, 900, dither), [
        extreme,
        dither,
      ] as const);
      console.log(`mesh extreme ${label}: ${JSON.stringify(r)}`);
      expect(r.alphaOk).toBe(true);
      expect(r.black).toBe(0);
      expect(r.min).toBeGreaterThan(10);
      expect(r.max).toBeLessThanOrEqual(255);
    });
  }
});

test('mesh render time, 16 points', async ({ page }) => {
  for (const [w, h] of [
    [3456, 2234],
    [5120, 2880],
  ]) {
    const ms = await page.evaluate(([d, w, h]) => window.engineHarness.timeRender(d, w, h, 3), [mesh16, w, h] as const);
    const linearMs = await page.evaluate(([d, w, h]) => window.engineHarness.timeRender(d, w, h, 3), [
      threeStops(30),
      w,
      h,
    ] as const);
    console.log(`mesh 16 points ${w}×${h}: ${ms.toFixed(0)} ms (linear ${linearMs.toFixed(0)} ms)`);
    expect(ms).toBeGreaterThan(0);
  }
});

// ---- M3: warp and grain ---------------------------------------------------

const SHAPES = WARP_SHAPES.filter((s) => s !== 'none');
/** Intentionally stepped shapes: compared off their step edges only. */
const STEPPED: readonly WarpShape[] = ['rows', 'columns', 'voronoi'];

const warp = (shape: WarpShape, amount = 0.5, size = 0.5, seed = 7): Warp => ({ shape, amount, size, seed });
const withLook = (d: Design, w: Warp, grain: Grain = noGrain): Design => ({ ...d, warp: w, grain });
const bases: [string, Design][] = [
  ['linear', threeStops(30)],
  ['mesh', mesh16],
];

test.describe('warp tile independence (dither + grain on)', () => {
  for (const shape of WARP_SHAPES) {
    for (const [name, base] of bases) {
      test(`${shape} × ${name}: 1531×917 single pass equals 256 px tiles`, async ({ page }) => {
        const r = await page.evaluate(([d]) => window.engineHarness.compareTiled(d, 1531, 917, 256, true), [
          withLook(base, warp(shape), defaultGrain),
        ] as const);
        expect(r.first).toBeNull();
        expect(r.identical).toBe(true);
        expect(r.tiles).toBe(24);
      });
    }
  }

  for (const shape of ['domain', 'curl', 'voronoi'] as const) {
    test(`${shape} mesh 5120×2880 single pass equals 2048 px tiles`, async ({ page }) => {
      const r = await page.evaluate(([d]) => window.engineHarness.compareTiled(d, 5120, 2880, 2048, true), [
        withLook(mesh16, warp(shape, 0.6, 0.4, 0xdeadbeef), { amount: 0.8, size: 0.6 }),
      ] as const);
      console.log(`${shape} 5120×2880: single ${r.singleMs.toFixed(0)} ms, tiled ${r.tiledMs.toFixed(0)} ms`);
      expect(r.first).toBeNull();
      expect(r.identical).toBe(true);
      expect(r.tiles).toBe(6);
    });
  }

  test('worker tiles equal main-thread single pass (domain, grain)', async ({ page }) => {
    const r = await page.evaluate(([d]) => window.engineHarness.compareWorker(d, 1001, 777, 300, true), [
      withLook(primaries, warp('domain'), defaultGrain),
    ] as const);
    expect(r.first).toBeNull();
    expect(r.identical).toBe(true);
  });
});

test.describe('warp vs CPU reference (dither + grain off)', () => {
  for (const shape of SHAPES) {
    for (const [name, base] of [
      ['mesh', meshDefault],
      ['linear', threeStops(60)],
    ] as const) {
      test(`${shape} × ${name}`, async ({ page }) => {
        const stepped = STEPPED.includes(shape);
        for (const w of [warp(shape, 0.5, 0.35, 1), warp(shape, 0.9, 0.8, 0x9e3779b9)]) {
          const r = await page.evaluate(([d]) => window.engineHarness.compareWarpReference(d, 640, 360, 2), [
            withLook(base, w),
          ] as const);
          console.log(
            `warp ref ${shape} × ${name} a=${w.amount} s=${w.size}: max ${r.maxDiff}, off-step max ${r.maxDiffOffStep}, ` +
              `>2: ${r.over} (${r.overOffStep} off-step), step px ${r.stepPixels}`,
          );
          if (stepped) {
            expect(r.overOffStep, JSON.stringify(r.worst)).toBe(0);
          } else if (shape === 'curl') {
            // 8 integrated steps amplify fp32 error where the flow stretches
            // hardest: a handful of pixels may reach ±3-4.
            expect(r.maxDiff, JSON.stringify(r.worstAny)).toBeLessThanOrEqual(4);
            expect(r.over).toBeLessThanOrEqual(640 * 360 * 1e-4);
          } else {
            expect(r.maxDiff, JSON.stringify(r.worstAny)).toBeLessThanOrEqual(2);
          }
        }
      });
    }
  }
});

test.describe('warp identities', () => {
  for (const shape of SHAPES) {
    test(`${shape}: amount 0 is bit-identical to no warp; seeds differ`, async ({ page }) => {
      const r = await page.evaluate(
        ([plain, zero, a, b]) => {
          const h = window.engineHarness;
          return {
            zero: h.compareDesigns(plain, zero, 480, 270),
            seeds: h.compareDesigns(a, b, 480, 270),
          };
        },
        [
          meshDefault,
          withLook(meshDefault, warp(shape, 0)),
          withLook(meshDefault, warp(shape, 0.5, 0.5, 1)),
          withLook(meshDefault, warp(shape, 0.5, 0.5, 2)),
        ] as const,
      );
      expect(r.zero.identical).toBe(true);
      expect(r.seeds.mismatches).toBeGreaterThan(1000);
    });
  }

  test('grain amount 0 is bit-identical to no grain', async ({ page }) => {
    const r = await page.evaluate(([a, b]) => window.engineHarness.compareDesigns(a, b, 480, 270), [
      withLook(mesh16, warp('fbm')),
      withLook(mesh16, warp('fbm'), { amount: 0, size: 0.7 }),
    ] as const);
    expect(r.identical).toBe(true);
  });
});

const turn = (d: Design, t: Partial<Transform>): Design => ({
  ...d,
  transform: { rotate: 0, zoom: 1, flipX: false, flipY: false, ...t },
});

test.describe('transform (M3.5)', () => {
  const warpedMesh = withLook(meshDefault, warp('domain', 0.6, 0.4, 7));
  const warpedLinear = withLook(threeStops(30), warp('waves', 0.6, 0.4, 7));

  for (const [name, base] of [
    ['mesh', warpedMesh],
    ['linear', warpedLinear],
  ] as const) {
    test(`${name}: identity transform is bit-identical to none`, async ({ page }) => {
      const r = await page.evaluate(([a, b]) => window.engineHarness.compareDesigns(a, b, 480, 270), [
        base,
        turn(base, {}),
      ] as const);
      expect(r.identical).toBe(true);
    });

    for (const [map, t] of [
      ['flipX', { flipX: true }],
      ['flipY', { flipY: true }],
      ['rotate180', { rotate: 180 }],
    ] as const) {
      test(`${name}: ${map} permutes pixels exactly`, async ({ page }) => {
        const r = await page.evaluate(([a, b, m]) => window.engineHarness.compareRemapped(a, b, 481, 271, m), [
          base,
          turn(base, t),
          map,
        ] as const);
        expect(r.first).toBeNull();
        expect(r.different).toBe(true);
      });
    }

    test(`${name}: rotate 90 permutes pixels exactly on a square`, async ({ page }) => {
      const r = await page.evaluate(([a, b]) => window.engineHarness.compareRemapped(a, b, 301, 301, 'rotate90'), [
        base,
        turn(base, { rotate: 90 }),
      ] as const);
      expect(r.first).toBeNull();
    });

    test(`${name}: free angle, zoom and flip match the CPU reference`, async ({ page }) => {
      const r = await page.evaluate(([d]) => window.engineHarness.compareWarpReference(d, 640, 360, 2), [
        turn(base, { rotate: 33, zoom: 1.7, flipX: true }),
      ] as const);
      expect(r.maxDiff, JSON.stringify(r.worstAny)).toBeLessThanOrEqual(2);
    });

    test(`${name}: transformed 1531×917 single pass equals 256 px tiles (grain on)`, async ({ page }) => {
      const r = await page.evaluate(([d]) => window.engineHarness.compareTiled(d, 1531, 917, 256, true), [
        turn({ ...base, grain: defaultGrain }, { rotate: 117, zoom: 0.6, flipY: true }),
      ] as const);
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
    const r = await page.evaluate(([a, b]) => window.engineHarness.compareDesigns(a, b, 640, 360), [
      linear(90, stops),
      turn(linear(0, stops), { rotate: 90 }),
    ] as const);
    expect(r.identical).toBe(true);
  });
});

const gray = (l: number): Design => mesh(0.5, [[0, 0, [l, 0, 0], 0.5]]);

test.describe('grain', () => {
  test('is unbiased, grows with amount, and size sets its correlation length', async ({ page }) => {
    const stats: Record<string, { meanDiff: number[]; sigma: number; autocorr: number[] }> = {};
    for (const amount of [0.15, 0.35, 1]) {
      for (const size of [0, 0.5, 1]) {
        const r = await page.evaluate(([d]) => window.engineHarness.grainStats(d, 1024, 512), [
          withLook(gray(0.6), noWarp, { amount, size }),
        ] as const);
        stats[`${amount}/${size}`] = r;
        console.log(
          `grain a=${amount} s=${size}: mean ${r.meanDiff.map((m) => m.toFixed(3))}, σ ${r.sigma.toFixed(2)} LSB, ` +
            `autocorr ${r.autocorr.map((c) => c.toFixed(2))}`,
        );
        for (const m of r.meanDiff) expect(Math.abs(m)).toBeLessThan(0.2);
      }
    }
    for (const size of ['0', '0.5', '1']) {
      expect(stats[`0.35/${size}`].sigma).toBeGreaterThan(stats[`0.15/${size}`].sigma * 1.8);
      expect(stats[`1/${size}`].sigma).toBeGreaterThan(stats[`0.35/${size}`].sigma * 2.2);
    }
    // Size 0 is white per pixel; coarser grain stays correlated over more pixels.
    expect(Math.abs(stats['0.35/0'].autocorr[0])).toBeLessThan(0.05);
    expect(stats['0.35/0.5'].autocorr[0]).toBeGreaterThan(0.3);
    expect(stats['0.35/1'].autocorr[1]).toBeGreaterThan(stats['0.35/0.5'].autocorr[1] + 0.1);
  });

  test('leaves pure black and white exact', async ({ page }) => {
    const d3 = threeStops(0);
    for (const d of [gray(0), gray(1), d3]) {
      const r = await page.evaluate(([d]) => window.engineHarness.grainStats(d, 800, 450), [
        withLook(d, warp('domain'), { amount: 1, size: 0.3 }),
      ] as const);
      // Channels that only round to 0/255 may move by 1 LSB; never a speck.
      expect(r.maxChangeAtEnds).toBeLessThanOrEqual(1);
      if (d !== d3) expect(r.changedAtEnds).toBe(0);
    }
    const r = await page.evaluate(([d]) => window.engineHarness.grainStats(d, 800, 450), [
      withLook(gray(0), noWarp, { amount: 1, size: 0 }),
    ] as const);
    expect(r.ends).toBe(800 * 450 * 3);
    expect(r.changedAtEnds).toBe(0);
  });
});

test('warp render time at 5120×2880 (mesh, 16 points, grain on)', async ({ page }) => {
  const lines: string[] = [];
  for (const shape of WARP_SHAPES) {
    const ms = await page.evaluate(([d]) => window.engineHarness.timeRender(d, 5120, 2880, 3), [
      withLook(mesh16, warp(shape), defaultGrain),
    ] as const);
    lines.push(`${shape} ${ms.toFixed(0)} ms`);
    expect(ms).toBeGreaterThan(0);
  }
  console.log(`warp timings 5120×2880: ${lines.join(', ')}`);
});

test.describe('contact sheets', () => {
  const sheetBase: Design = { ...meshDefault, grain: defaultGrain };
  const sheets: [string, string[], (shape: WarpShape, i: number) => Warp][] = [
    [
      '/tmp/m3-warps-amount.png',
      ['amount 0.2', 'amount 0.5', 'amount 0.8'],
      (s, i) => warp(s, [0.2, 0.5, 0.8][i], 0.35, 1),
    ],
    ['/tmp/m3-warps-size.png', ['size 0.1', 'size 0.5', 'size 0.9'], (s, i) => warp(s, 0.4, [0.1, 0.5, 0.9][i], 1)],
  ];
  for (const [path, columns, make] of sheets) {
    test(path, async ({ page }) => {
      const rows = WARP_SHAPES.map((shape) => ({
        label: shape,
        designs: columns.map((_, i) => withLook(sheetBase, make(shape, i), defaultGrain)),
      }));
      const png = await page.evaluate(([rows, columns]) => window.engineHarness.contactSheet(rows, columns, 480, 270), [
        rows,
        columns,
      ] as const);
      writeFileSync(path, Buffer.from(png, 'base64'));
    });
  }
});
