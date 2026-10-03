// Integer hashes (mirrored bit-exactly by src/engine/noise.ts). Used by the
// warp stage and the grain, so every value is a pure function of its inputs.

// pcg3d (Jarzynski & Olano 2020).
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  return v;
}

// 24-bit uint → [0, 1), exact in fp32.
float hashUnit(uint h) {
  return float(h >> 8u) * (1.0 / 16777216.0);
}

// int → uint keeps the bit pattern (GLSL ES 3.00 §5.4.1), matching `>>> 0` in TS.
float hash1(ivec2 c, uint key) {
  return hashUnit(pcg3d(uvec3(uvec2(c), key)).x);
}

vec2 hash2(ivec2 c, uint key) {
  uvec3 h = pcg3d(uvec3(uvec2(c), key));
  return vec2(hashUnit(h.x), hashUnit(h.y));
}
