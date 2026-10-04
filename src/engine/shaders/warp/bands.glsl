#if defined(WARP_ROWS) || defined(WARP_COLUMNS)
// Stepped bands: each band of `across` is shifted by its own hashed offset;
// the step into the next band is a smoothstep over WARP_EDGE.
float bandOffset(float across) {
  float n = 2.0 * u_warpFreq;
  float y = clamp(across * n, -NOISE_MAX, NOISE_MAX);
  float b = floor(y);
  float fr = y - b;
  uint key = warpKey(WARP_SALT0);
  int bi = int(b);
  float o0 = hash1(ivec2(bi, 0), key) * 2.0 - 1.0;
  float o1 = hash1(ivec2(bi + 1, 0), key) * 2.0 - 1.0;
  float e = min(0.45, WARP_EDGE * n);
  return u_warpAmp * mix(o0, o1, smoothstep(1.0 - e, 1.0, fr));
}

vec2 warpShape(vec2 p) {
#ifdef WARP_ROWS
  return vec2(p.x + bandOffset(p.y), p.y);
#else
  return vec2(p.x, p.y + bandOffset(p.x));
#endif
}
#endif
