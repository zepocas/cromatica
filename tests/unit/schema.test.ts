import { describe, expect, it } from 'vitest';
import {
  defaultDesign,
  defaultMesh,
  identityTransform,
  noFinish,
  type Design,
  type RampGradient,
} from '../../src/design/design';
import { DesignLoadError, LEGACY_AURORA_BLEND, loadDesign, saveDesign, SCHEMA_VERSION } from '../../src/design/schema';
import { shuffleDesign } from '../../src/design/shuffle';
import v1Linear from './fixtures/design-v1-linear.json';
import v1Mesh from './fixtures/design-v1-mesh.json';

const roundTrip = (d: Design) => loadDesign(JSON.parse(JSON.stringify(saveDesign(d))));

describe('design schema', () => {
  it('loads a version 1 linear design with the implicit defaults filled in', () => {
    const d = loadDesign(v1Linear);
    expect(d.base).toMatchObject({ kind: 'linear', angle: 30, scale: 0.35, seed: 1, noiseStyle: 'contour' });
    expect(d.transform).toEqual(identityTransform);
    // The version 1 grain (0.35) stays grain (D63).
    expect(d.finish).toEqual({ ...noFinish, noise: { type: 'grain', amount: 0.35 } });
  });

  it('keeps the fields a version 1 design did set', () => {
    const d = loadDesign(v1Mesh);
    expect(d.transform).toEqual({ rotate: 90, zoom: 1.5, flipX: true, flipY: false });
    expect(d.warp.seed).toBe(1234567);
    expect(d.base).toEqual(v1Mesh.base);
  });

  it('gives a version 2 aurora the blend that keeps its look', () => {
    const base = { kind: 'aurora', colors: [[0.2, 0.03, 260]], count: 0.5, glow: 0.4, seed: 3 };
    const d = loadDesign({ version: 2, design: { ...saveDesign(defaultDesign).design, base } });
    expect(d.base).toEqual({ ...base, blend: LEGACY_AURORA_BLEND });
  });

  it('gives a version 3 design relief off and keeps its other finishes', () => {
    const saved = saveDesign(defaultDesign).design;
    const finish = { vignette: 0.3, bands: 0.2, bandEdge: 0.5, print: 0.1 };
    const d = loadDesign({ version: 3, design: { ...saved, finish } });
    const { print, ...kept } = finish;
    expect(d.finish).toEqual({ ...noFinish, ...kept, noise: { type: 'lithograph', amount: print / 0.7 } });
    expect(d.finish.relief).toBe(0);
  });

  it('gives a design saved before band styles the weights style', () => {
    const saved = saveDesign(defaultDesign).design;
    const { bandStyle: _bandStyle, ...finish } = saved.finish;
    const d = loadDesign({ version: SCHEMA_VERSION, design: { ...saved, finish } });
    expect(d.finish.bandStyle).toBe('weights');
  });

  it('loads version 5 and 6 ramps whose stops carry a blend, which is dropped, and leaves other patterns alone (D63, D66)', () => {
    const saved = saveDesign(defaultDesign).design;
    const ramp = saved.base as RampGradient;
    const stops = ramp.stops.map((s, i) => ({
      ...s,
      blend: (['oklch-long', 'oklab-chroma', 'oklab'] as const)[i % 3],
    }));
    for (const version of [5, 6]) {
      const d = loadDesign({ version, design: { ...saved, base: { ...ramp, stops } } });
      expect((d.base as typeof ramp).stops.every((s) => !('blend' in s))).toBe(true);
    }
    const d = loadDesign({ version: 5, design: { ...saved, base: { ...ramp, stops } } });
    expect((d.base as typeof ramp).stops.map((s) => s.color)).toEqual(ramp.stops.map((s) => s.color));
    const mesh = saveDesign({ ...defaultDesign, base: defaultMesh }).design;
    expect(loadDesign({ version: 5, design: mesh }).base).toEqual(mesh.base);
  });

  describe('version 4 to 5: grain, print and halftone become one noise (D63)', () => {
    const fromV4 = (grain: number, print: number, halftone: number) =>
      loadDesign({
        version: 4,
        design: {
          ...saveDesign(defaultDesign).design,
          grain: { amount: grain, size: 0 },
          finish: {
            vignette: 0.2,
            bands: 0,
            bandEdge: 0,
            print,
            relief: 0,
            reliefStyle: 'satin',
            reliefLight: 135,
            halftone,
          },
        },
      }).finish;

    it('keeps a gentle print as lithograph, rescaled so it looks the same', () => {
      expect(fromV4(0.35, 0.35, 0).noise).toEqual({ type: 'lithograph', amount: 0.5 });
    });

    it('turns a print past the lithograph range into a xerox of the same amount', () => {
      expect(fromV4(0.35, 0.85, 0).noise).toEqual({ type: 'xerox', amount: 0.85 });
    });

    it('keeps halftone when there is no print', () => {
      expect(fromV4(0.35, 0, 0.4).noise).toEqual({ type: 'halftone', amount: 0.4 });
    });

    it('keeps grain alone as grain, and nothing as off', () => {
      expect(fromV4(0.4, 0, 0).noise).toEqual({ type: 'grain', amount: 0.4 });
      expect(fromV4(0, 0, 0).noise).toEqual({ type: 'grain', amount: 0 });
    });

    it('keeps the other finishes', () => {
      expect(fromV4(0.35, 0.35, 0).vignette).toBe(0.2);
    });
  });

  it('saves the current version', () => {
    expect(saveDesign(defaultDesign).version).toBe(SCHEMA_VERSION);
  });

  it('round-trips shuffled designs of every kind exactly', () => {
    const kinds = new Set<string>();
    let design: Design = { ...defaultDesign, base: defaultMesh };
    for (let seed = 1; seed <= 300; seed++) {
      design = shuffleDesign(design, { colors: true, layout: true, style: true, seed }).design;
      kinds.add(design.base.kind);
      const loaded = roundTrip(design);
      expect(loaded).toMatchObject(design);
      expect(roundTrip(loaded)).toEqual(loaded);
    }
    expect(kinds.size).toBe(9);
  });

  it('rejects what is not a valid design', () => {
    const bad = [
      null,
      [],
      'x',
      { version: SCHEMA_VERSION + 1, design: defaultDesign },
      { ...v1Linear, engineVersion: 2 },
      { ...v1Linear, warp: { ...v1Linear.warp, shape: 'gone' } },
      {
        version: SCHEMA_VERSION,
        design: { ...saveDesign(defaultDesign).design, finish: { ...noFinish, noise: { type: 'xerox', amount: 2 } } },
      },
      {
        version: SCHEMA_VERSION,
        design: { ...saveDesign(defaultDesign).design, finish: { ...noFinish, noise: { type: 'sepia', amount: 0.5 } } },
      },
      { ...v1Mesh, base: { ...v1Mesh.base, points: [] } },
      { ...v1Linear, base: { ...v1Linear.base, kind: 'spiral' } },
    ];
    for (const b of bad) expect(() => loadDesign(b), JSON.stringify(b)).toThrow(DesignLoadError);
  });

  it('rejects a grid whose node count does not match its size', () => {
    const grid = { kind: 'grid', rows: 2, cols: 3, rest: [0.8, 0.5], nodes: [{ x: 0, y: 0, color: [0.5, 0.1, 10] }] };
    expect(() => loadDesign({ ...v1Linear, base: grid })).toThrow(DesignLoadError);
  });
});
