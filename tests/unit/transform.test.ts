import { describe, expect, it } from 'vitest';
import { identityTransform, MAX_ZOOM, MIN_ZOOM, type Transform } from '../../src/design/design';
import { applyMat2, clampZoom, inverseTransformMatrix, mat2Uniform, transformMatrix } from '../../src/engine/transform';
import { normalizeDegrees } from '../../src/math';

const t = (p: Partial<Transform>): Transform => ({ ...identityTransform, ...p });
/** -0 → 0, since toEqual tells them apart (both act the same in the shader). */
const m = (tr: Transform | undefined) => transformMatrix(tr).map((v) => v + 0);

describe('transform', () => {
  it('identity (and a missing transform) is the exact identity matrix', () => {
    expect(m(undefined)).toEqual([1, 0, 0, 1]);
    expect(m(identityTransform)).toEqual([1, 0, 0, 1]);
  });

  it('quarter turns are exact', () => {
    expect(m(t({ rotate: 90 }))).toEqual([0, 1, -1, 0]);
    expect(m(t({ rotate: 180 }))).toEqual([-1, 0, 0, -1]);
    expect(m(t({ rotate: -90 }))).toEqual([0, -1, 1, 0]);
  });

  it('rotates the image counter-clockwise', () => {
    // A feature at pattern (1, 0) shows up at screen (0, 1) after +90°.
    const [x, y] = applyMat2(inverseTransformMatrix(t({ rotate: 90 })), 1, 0);
    expect(x).toBeCloseTo(0, 15);
    expect(y).toBeCloseTo(1, 15);
  });

  it('zoom > 1 magnifies: screen coords shrink toward the origin in pattern space', () => {
    expect(applyMat2(transformMatrix(t({ zoom: 2 })), 0.5, -0.25)).toEqual([0.25, -0.125]);
  });

  it('flips mirror pattern axes', () => {
    expect(applyMat2(transformMatrix(t({ flipX: true })), 0.3, 0.2)).toEqual([-0.3, 0.2]);
    expect(applyMat2(transformMatrix(t({ flipY: true })), 0.3, 0.2)).toEqual([0.3, -0.2]);
  });

  it('inverse undoes the transform', () => {
    for (const tr of [t({ rotate: 33, zoom: 1.7, flipX: true }), t({ rotate: 271.5, zoom: 0.6, flipY: true })]) {
      const [x, y] = applyMat2(inverseTransformMatrix(tr), ...applyMat2(transformMatrix(tr), 0.41, -0.37));
      expect(x).toBeCloseTo(0.41, 12);
      expect(y).toBeCloseTo(-0.37, 12);
    }
  });

  it('sanitizes angles and zoom', () => {
    expect(normalizeDegrees(-30)).toBe(330);
    expect(normalizeDegrees(720)).toBe(0);
    expect(normalizeDegrees(NaN)).toBe(0);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(NaN)).toBe(1);
  });

  it('uploads column-major for GLSL', () => {
    expect(Array.from(mat2Uniform([1, 2, 3, 4]))).toEqual([1, 3, 2, 4]);
  });
});
