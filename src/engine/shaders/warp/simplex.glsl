#ifdef WARP_SIMPLEX
// Single-octave simplex displacement: smooth, large wobbles.
vec2 warpShape(vec2 p) {
  vec2 s = p * u_warpFreq;
  return p + u_warpAmp * vec2(simplex(s, warpKey(WARP_SALT0)).x, simplex(s, warpKey(WARP_SALT1)).x);
}
#endif
