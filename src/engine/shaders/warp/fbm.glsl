#ifdef WARP_FBM
// Displacement by two fBm channels: soft, detailed turbulence.
vec2 warpShape(vec2 p) {
  vec2 s = p * u_warpFreq;
  return p + u_warpAmp * vec2(fbm(s, warpKey(0x51u), 5), fbm(s, warpKey(0x52u), 5));
}
#endif
