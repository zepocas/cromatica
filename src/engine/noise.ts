// Hash and noise library, in doubles. Mirrors src/engine/shaders/common/hash.glsl
// and src/engine/shaders/warp/noise.glsl operation for operation: keep them in
// sync. Integer hashes are bit-exact with the GPU; float results differ only by
// fp32 rounding. Seeds are mixed into the hash key, never added to coordinates (D2).

export type Vec2 = [number, number];

const imul = Math.imul;

/** pcg3d (Jarzynski & Olano 2020) on uint32s. Returns a new triple. */
export function pcg3d(x: number, y: number, z: number): [number, number, number] {
  x = (imul(x, 1664525) + 1013904223) >>> 0;
  y = (imul(y, 1664525) + 1013904223) >>> 0;
  z = (imul(z, 1664525) + 1013904223) >>> 0;
  x = (x + imul(y, z)) >>> 0;
  y = (y + imul(z, x)) >>> 0;
  z = (z + imul(x, y)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  y = (y ^ (y >>> 16)) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  x = (x + imul(y, z)) >>> 0;
  y = (y + imul(z, x)) >>> 0;
  z = (z + imul(x, y)) >>> 0;
  return [x, y, z];
}

/** pcg (Jarzynski & Olano 2020), one uint32 → uint32. */
export function pcg(v: number): number {
  const state = (imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const word = imul((state >>> (((state >>> 28) + 4) >>> 0)) ^ state, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}

/** Hash key of a seed and a salt (a per-use constant). */
export function hashKey(seed: number, salt: number): number {
  return (seed ^ imul(salt, 0x9e3779b9)) >>> 0;
}

/** Key of octave i of a key. */
export function octaveKey(key: number, i: number): number {
  return (key + imul(i, 0x632be5ab)) >>> 0;
}

/** 24-bit uint → [0, 1), exact in float32. */
const unit = (h: number) => (h >>> 8) * (1 / 16777216);

/** Two uniform [0, 1) values of an integer lattice cell. */
export function hash2(cx: number, cy: number, key: number): Vec2 {
  const h = pcg3d(cx >>> 0, cy >>> 0, key);
  return [unit(h[0]), unit(h[1])];
}

export function hash1(cx: number, cy: number, key: number): number {
  return unit(pcg3d(cx >>> 0, cy >>> 0, key)[0]);
}

/** Cell coordinates are clamped so int conversion stays defined (and fp32 sane). */
export const MAX_NOISE_COORD = 1e4;
export const clampCoord = (x: number) => Math.min(MAX_NOISE_COORD, Math.max(-MAX_NOISE_COORD, x));

const F2 = 0.3660254037844386; // (√3 - 1) / 2
const G2 = 0.21132486540518713; // (3 - √3) / 6
const TAU = 6.283185307179586;

function corner(x: number, y: number, cx: number, cy: number, key: number, out: number[]) {
  const t = 0.5 - (x * x + y * y);
  if (t <= 0) return;
  const a = hash1(cx, cy, key) * TAU;
  const gx = Math.cos(a);
  const gy = Math.sin(a);
  const t2 = t * t;
  const t4 = t2 * t2;
  const gd = gx * x + gy * y;
  out[0] += t4 * gd;
  out[1] += t4 * gx - 8 * t2 * t * gd * x;
  out[2] += t4 * gy - 8 * t2 * t * gd * y;
}

/** 2D simplex noise with analytic gradient: [value ≈ [-1, 1], d/dx, d/dy]. */
export function simplex(px: number, py: number, key: number): [number, number, number] {
  px = clampCoord(px);
  py = clampCoord(py);
  const s = (px + py) * F2;
  const ix = Math.floor(px + s);
  const iy = Math.floor(py + s);
  const t = (ix + iy) * G2;
  const x0 = px - ix + t;
  const y0 = py - iy + t;
  const ox = x0 > y0 ? 1 : 0;
  const oy = 1 - ox;
  const out = [0, 0, 0];
  corner(x0, y0, ix, iy, key, out);
  corner(x0 - ox + G2, y0 - oy + G2, ix + ox, iy + oy, key, out);
  corner(x0 - 1 + 2 * G2, y0 - 1 + 2 * G2, ix + 1, iy + 1, key, out);
  return [70 * out[0], 70 * out[1], 70 * out[2]];
}

/** Value noise in [-1, 1], cubic (smoothstep) interpolation: soft but visibly grid-aligned. */
export function valueNoise(px: number, py: number, key: number): number {
  px = clampCoord(px);
  py = clampCoord(py);
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash1(ix, iy, key);
  const b = hash1(ix + 1, iy, key);
  const c = hash1(ix, iy + 1, key);
  const d = hash1(ix + 1, iy + 1, key);
  const lo = a + (b - a) * ux;
  const hi = c + (d - c) * ux;
  return (lo + (hi - lo) * uy) * 2 - 1;
}

/** Simplex fBm, lacunarity 2, gain 0.5, rotated per octave; ≈ [-1, 1]. */
export function fbm(px: number, py: number, key: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * simplex(px, py, octaveKey(key, i))[0];
    // Rotate by atan(0.6 / 0.8) and double: same as GLSL mat2(0.8, 0.6, -0.6, 0.8) * p * 2.
    const nx = (0.8 * px - 0.6 * py) * 2;
    const ny = (0.6 * px + 0.8 * py) * 2;
    px = nx;
    py = ny;
    amp *= 0.5;
  }
  // Normalized by Σ 0.5^i.
  return sum * (1 / (2 - Math.pow(0.5, octaves - 1)));
}
