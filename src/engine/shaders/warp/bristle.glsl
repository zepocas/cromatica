#ifdef WARP_BRISTLE
// Dry-brush strokes (src/engine/warp.ts, D61): noise fast across the stroke, slow
// along it, displacing along it. The direction drifts across the frame, a finer layer
// mixes in, and each stroke has its own strength. u_warpParam[0].xy = base direction.
vec2 warpShape(vec2 p) {
  vec2 d0 = u_warpParam[0].xy;
  vec2 q = p * u_warpFreq;
  float bend = BRISTLE_BEND * simplex(q * BRISTLE_BEND_FREQ, warpKey(WARP_SALT2)).x;
  vec2 d = vec2(cos(bend) * d0.x - sin(bend) * d0.y, sin(bend) * d0.x + cos(bend) * d0.y);
  float along = dot(d, q);
  float across = dot(vec2(-d.y, d.x), q);
  across += BRISTLE_WOBBLE * simplex(vec2(along * 0.6, across * 0.8), warpKey(WARP_SALT3)).x;
  float broad = simplex(vec2(along * BRISTLE_ALONG, across * BRISTLE_ACROSS), warpKey(WARP_SALT0)).x;
  float fine = simplex(vec2(along * BRISTLE_FINE_ALONG, across * BRISTLE_FINE_ACROSS), warpKey(WARP_SALT1)).x;
  float streak = BRISTLE_BROAD * broad + BRISTLE_FINE * fine;
  float vary = simplex(vec2(along * 0.12, across * 2.1), warpKey(WARP_SALT3)).x;
  float mask = 0.15 + 0.85 * smoothstep(-0.6, 0.5, vary);
  return p + u_warpAmp * BRISTLE_GAIN * streak * mask * d;
}
#endif
