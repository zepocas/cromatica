import { describe, expect, it } from 'vitest';
import { defaultDesign, defaultMesh, identityTransform, noFinish, type Design } from '../../src/design/design';
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
    expect(d.finish).toEqual(noFinish);
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
    expect(d.finish).toEqual({ ...noFinish, ...finish });
    expect(d.finish.relief).toBe(0);
  });

  it('gives a design saved before band styles the weights style', () => {
    const saved = saveDesign(defaultDesign).design;
    const { bandStyle: _bandStyle, ...finish } = saved.finish;
    const d = loadDesign({ version: SCHEMA_VERSION, design: { ...saved, finish } });
    expect(d.finish.bandStyle).toBe('weights');
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
      { ...v1Linear, grain: { amount: 2, size: 0 } },
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
