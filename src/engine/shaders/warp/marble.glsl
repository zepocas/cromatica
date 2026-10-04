#ifdef WARP_MARBLE
// Displace along the band normal by a sine of the band phase, stirred by fBm.
// u_warpParam[0].xy = band direction.
vec2 warpShape(vec2 p) {
  vec2 d = u_warpParam[0].xy;
  float turbulence = MARBLE_TURBULENCE * fbm(p * u_warpFreq, warpKey(WARP_SALT0), MARBLE_OCTAVES);
  float s = u_warpAmp * sin(TAU * u_warpFreq * dot(d, p) + turbulence);
  return p + s * d;
}
#endif
