#ifdef WARP_FBM
// Displacement by two fBm channels: soft, detailed turbulence.
vec2 warpShape(vec2 p) {
  vec2 s = p * u_warpFreq;
  return p + u_warpAmp * vec2(fbm(s, warpKey(WARP_SALT0), FBM_OCTAVES), fbm(s, warpKey(WARP_SALT1), FBM_OCTAVES));
}
#endif
