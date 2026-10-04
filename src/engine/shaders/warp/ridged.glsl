#ifdef WARP_RIDGED
// Silk: long folds along a seeded direction d. Ridged noise runs slowly along
// d and fast across it, displacing across d. u_warpParam[0].xy = d.
vec2 warpShape(vec2 p) {
  vec2 d = u_warpParam[0].xy;
  vec2 n = vec2(-d.y, d.x);
  vec2 s = vec2(dot(d, p) * SILK_ALONG, dot(n, p)) * u_warpFreq;
  return p + u_warpAmp * ridged(s, warpKey(WARP_SALT0), RIDGED_OCTAVES) * n;
}
#endif
