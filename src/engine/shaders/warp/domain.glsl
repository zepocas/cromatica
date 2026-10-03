#ifdef WARP_DOMAIN
// IQ recursive domain warp: p + A · fbm(s + K · fbm(s)). Liquid, silky folds.
// Mirrors DOMAIN_OCTAVES / DOMAIN_K in src/engine/warp.ts.
#define DOMAIN_OCTAVES 3
#define DOMAIN_K 1.5
vec2 warpShape(vec2 p) {
  vec2 s = p * u_warpFreq;
  vec2 q = vec2(fbm(s, warpKey(0x51u), DOMAIN_OCTAVES), fbm(s, warpKey(0x52u), DOMAIN_OCTAVES));
  vec2 t = s + DOMAIN_K * q;
  vec2 r = vec2(fbm(t, warpKey(0x53u), DOMAIN_OCTAVES), fbm(t, warpKey(0x54u), DOMAIN_OCTAVES));
  return p + u_warpAmp * r;
}
#endif
