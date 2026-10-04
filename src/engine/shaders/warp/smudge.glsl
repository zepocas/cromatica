#ifdef WARP_SMUDGE
// One-way smear: sample from behind along the stroke by a smooth positive
// amount. u_warpParam[0].xy = stroke direction.
vec2 warpShape(vec2 p) {
  vec2 d = u_warpParam[0].xy;
  vec2 s = vec2(dot(d, p), dot(vec2(-d.y, d.x), p)) * u_warpFreq;
  float k = u_warpAmp * (0.5 + 0.5 * fbm(s * vec2(SMUDGE_ALONG, SMUDGE_ACROSS), warpKey(WARP_SALT0), 3));
  return p - k * d;
}
#endif
