#ifdef WARP_SIMPLEX
// Single-octave simplex displacement: smooth, large wobbles.
vec2 warpShape(vec2 p) {
  vec2 s = p * u_warpFreq;
  return p + u_warpAmp * vec2(simplex(s, warpKey(0x51u)).x, simplex(s, warpKey(0x52u)).x);
}
#endif
