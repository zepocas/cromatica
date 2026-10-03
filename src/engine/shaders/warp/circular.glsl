#ifdef WARP_CIRCULAR
// Radial ripples around a seeded center; minus sin(phase) so the displacement
// vanishes at the center (no tear). u_warpParam[0] = (center, phase, sin(phase)).
vec2 warpShape(vec2 p) {
  vec2 d = p - u_warpParam[0].xy;
  float r2 = dot(d, d);
  float s = u_warpAmp * (sin(TAU * u_warpFreq * sqrt(r2) + u_warpParam[0].z) - u_warpParam[0].w) / sqrt(r2 + 0.0004);
  return p + s * d;
}
#endif
