// Analog film grain (finish stage, D7, D60): per OUTPUT pixel (D4), on sRGB-encoded values,
// before dither. Two layers of smooth value noise over output pixels, renormalized so the variance does
// not dip between lattice points: a fine one (under 1 px, so about white) for the crisp tooth and a coarser one (≈2 px)
// for the clumping of real film. Lattice values are ≈ gaussian (sum of four 16-bit uniforms) for luma,
// plus a small zero-sum chroma component. See src/engine/grain.ts for the parameter mapping.

uniform float u_grainAmp;       // σ in encoded units at midtones; 0 = off (exact passthrough)
uniform float u_grainScale;     // 1 / fine grain size in px
uniform float u_grainClumpScale; // 1 / clump size in px
uniform float u_grainChroma;    // chroma σ relative to luma σ
uniform float u_grainSeed;      // pattern number (a whole number): a different amount draws different grain

const uint GRAIN_KEY = 0x6A09E667u;
const uint GRAIN_CLUMP_KEY = 0xBB67AE85u;

// (luma, chroma a, chroma b) of a lattice point, each ≈ zero mean, unit variance.
vec3 grainLattice(ivec2 c, uint key) {
  uvec3 h = pcg3d(uvec3(uvec2(c), key));
  uvec4 u = uvec4(h.x & 0xFFFFu, h.x >> 16u, h.y & 0xFFFFu, h.y >> 16u);
  // Each (k + 0.5) / 65536 has mean 1/2, variance 1/12: the sum of four has variance 1/3.
  float luma = (float(u.x + u.y + u.z + u.w) + 2.0) * (1.0 / 65536.0) - 2.0;
  vec2 ch = (vec2(float(h.z & 0xFFFFu), float(h.z >> 16u)) + 0.5) * (1.0 / 65536.0) - 0.5;
  return vec3(luma * 1.7320508075688772, ch * 3.4641016151377544);
}

vec3 grainNoise(ivec2 px, float scale, uint key) {
  vec2 q = vec2(px) * scale;
  vec2 i = floor(q);
  vec2 f = q - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  ivec2 c = ivec2(i);
  vec4 w = vec4((1.0 - u.x) * (1.0 - u.y), u.x * (1.0 - u.y), (1.0 - u.x) * u.y, u.x * u.y);
  vec3 n = w.x * grainLattice(c, key) + w.y * grainLattice(c + ivec2(1, 0), key)
    + w.z * grainLattice(c + ivec2(0, 1), key) + w.w * grainLattice(c + ivec2(1, 1), key);
  return n * inversesqrt(dot(w, w));
}

vec3 grain(vec3 e, ivec2 px) {
  // 0.85² + 0.527² ≈ 1: the two layers add up to unit variance.
  uint seed = uint(u_grainSeed) * 2654435761u;
  vec3 n = 0.85 * grainNoise(px, u_grainScale, GRAIN_KEY ^ seed) + 0.527 * grainNoise(px, u_grainClumpScale, GRAIN_CLUMP_KEY ^ seed);
  vec3 delta = n.x + u_grainChroma * vec3(n.y, -0.5 * n.y + 0.8660254 * n.z, -0.5 * n.y - 0.8660254 * n.z);
  // Midtone weighting by luma, capped per channel so 0 and 1 stay exact (D18).
  float y = dot(e, vec3(0.2126, 0.7152, 0.0722));
  vec3 weight = min(vec3(4.0 * y * (1.0 - y)), 8.0 * e * (1.0 - e));
  return clamp(e + u_grainAmp * weight * delta, 0.0, 1.0);
}
