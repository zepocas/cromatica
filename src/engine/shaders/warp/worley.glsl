#ifdef WARP_WORLEY
// Bubbles: each cell pulls toward (or pushes from) its feature point with a
// signed hashed strength that fades to 0 at the border (continuous, creased).
#define WORLEY_RIM 0.2
vec2 warpShape(vec2 p) {
  vec2 s = clampCoord(p * u_warpFreq);
  ivec2 c1, c2;
  vec2 p1;
  float edge = voronoiCells(s, warpKey(0x51u), c1, p1, c2);
  float h = hash1(c1, warpKey(0x52u));
  float st = h < 0.5 ? -0.4 - 1.2 * h : 1.2 * h - 0.2; // ±[0.4, 1]
  float k = u_warpAmp * st * smoothstep(0.0, WORLEY_RIM, edge) / u_warpFreq;
  return p + k * (p1 - s);
}
#endif
