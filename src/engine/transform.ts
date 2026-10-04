// Whole-image transform (M3.5): composition coords → pattern coords, applied
// before the warp. The shader reads the same matrix (u_transform), so CPU and
// GPU agree; the identity matrix is exact in fp32, so untransformed designs
// render bit-identically to before.
import { MAX_ZOOM, MIN_ZOOM, type Transform } from '../design/design';
import { normalizeDegrees } from '../math';

/** Row-major 2×2 matrix [m00, m01, m10, m11]: q = (m00·x + m01·y, m10·x + m11·y). */
export type Mat2 = [number, number, number, number];

export const IDENTITY: Mat2 = [1, 0, 0, 1];

export function clampZoom(zoom: number): number {
  return Number.isFinite(zoom) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) : 1;
}

/** cos and sin with exact values at multiples of 90°, so quarter turns don't leak 6e-17 terms. */
function cosSin(deg: number): [number, number] {
  const a = normalizeDegrees(deg);
  switch (a) {
    case 0:
      return [1, 0];
    case 90:
      return [0, 1];
    case 180:
      return [-1, 0];
    case 270:
      return [0, -1];
  }
  const r = (a * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r)];
}

/** Rotation and flips only (orthonormal): S · R(-rotate). */
export function orientationMatrix(t: Transform | undefined): Mat2 {
  if (!t) return [...IDENTITY];
  const [c, s] = cosSin(t.rotate);
  const fx = t.flipX ? -1 : 1;
  const fy = t.flipY ? -1 : 1;
  return [fx * c, fx * s, -fy * s, fy * c];
}

/** Composition → pattern coords: S · R(-rotate) / zoom. */
export function transformMatrix(t: Transform | undefined): Mat2 {
  const m = orientationMatrix(t);
  const k = 1 / clampZoom(t?.zoom ?? 1);
  return [m[0] * k, m[1] * k, m[2] * k, m[3] * k];
}

/** Pattern → composition coords (inverse of transformMatrix): zoom · R(rotate) · S. */
export function inverseTransformMatrix(t: Transform | undefined): Mat2 {
  // The orientation part is orthonormal, so its inverse is its transpose.
  const m = orientationMatrix(t);
  const z = clampZoom(t?.zoom ?? 1);
  return [m[0] * z, m[2] * z, m[1] * z, m[3] * z];
}

export function applyMat2(m: Mat2, x: number, y: number): [number, number] {
  return [m[0] * x + m[1] * y, m[2] * x + m[3] * y];
}

/** Column-major Float32Array for a GLSL mat2 uniform. */
export function mat2Uniform(m: Mat2): Float32Array {
  return new Float32Array([m[0], m[2], m[1], m[3]]);
}
