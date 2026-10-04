#ifdef WARP_DOMAIN
// IQ recursive domain warp: p + A · fbm(s + K · fbm(s)). Liquid, silky folds.
vec2 warpShape(vec2 p) {
  vec2 s = p * u_warpFreq;
  vec2 q = vec2(fbm(s, warpKey(WARP_SALT0), DOMAIN_OCTAVES), fbm(s, warpKey(WARP_SALT1), DOMAIN_OCTAVES));
  vec2 t = s + DOMAIN_K * q;
  vec2 r = vec2(fbm(t, warpKey(WARP_SALT2), DOMAIN_OCTAVES), fbm(t, warpKey(WARP_SALT3), DOMAIN_OCTAVES));
  return p + u_warpAmp * r;
}
#endif
