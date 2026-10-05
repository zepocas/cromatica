#if BASE_RAMP
// Ramp position t of a pattern-space point (src/engine/ramp-shape.ts).
// Linear: u_rampAxis = direction / frame extent, so t = 0..1 spans the frame.
// Radial: u_radialScale = 1 / half the frame diagonal.
// Conic: u_rampAxis = unit start direction; t = (1 - cos θ) / 2, seamless.

uniform vec2 u_rampAxis;
uniform float u_radialScale;
uniform float u_rampFreq; // noise and cells: features per image height
uniform uint u_rampKey;
uniform uint u_rampKey2;
uniform float u_rampEdge; // cells: antialiasing half width, cell units

#if RAMP_CELLS
float cellT(ivec2 c, vec2 f, vec2 s) {
  return CELL_TINT * hash1(c, u_rampKey2) + CELL_SHADE * length(s - f);
}
#endif

float rampT(vec2 uv) {
#if RAMP_RADIAL
  return min(1.0, length(uv) * u_radialScale);
#elif RAMP_NOISE
  return clamp(0.5 + NOISE_GAIN * fbm(uv * u_rampFreq, u_rampKey, NOISE_OCTAVES), 0.0, 1.0);
#elif RAMP_CELLS
  vec2 s = clamp(uv * u_rampFreq, -NOISE_MAX, NOISE_MAX);
  ivec2 c1;
  vec2 p1;
  ivec2 c2;
  float edge = voronoiCells(s, u_rampKey, c1, p1, c2);
  float t1 = cellT(c1, p1, s);
  float t2 = cellT(c2, cellFeature(c2, u_rampKey), s);
  float mid = 0.5 * (t1 + t2);
  return clamp(mix(mid, t1, smoothstep(0.0, 1.0, edge / u_rampEdge)), 0.0, 1.0);
#elif RAMP_CONIC
  float len = length(uv);
  // Near the center t eases toward mid-ramp (CONIC_CORE), so a warp can't shred the point where every color meets.
  float k = smoothstep(0.0, CONIC_CORE, len);
  return len < 1e-12 ? 0.5 : 0.5 - 0.5 * k * dot(uv, u_rampAxis) / len;
#else
  return clamp(dot(uv, u_rampAxis) + 0.5, 0.0, 1.0);
#endif
}
#endif
