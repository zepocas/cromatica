#ifdef WARP_BRISTLE
// Dry-brush streaks: noise fast across the stroke, slow along it, displacing
// along the stroke; a coarse mask breaks strokes off. u_warpParam[0].xy = stroke direction.
vec2 warpShape(vec2 p) {
  vec2 d = u_warpParam[0].xy;
  vec2 s = vec2(dot(d, p), dot(vec2(-d.y, d.x), p)) * u_warpFreq;
  float streak = simplex(s * vec2(BRISTLE_ALONG, BRISTLE_ACROSS), warpKey(WARP_SALT0)).x;
  float mask = smoothstep(-0.3, 0.3, simplex(s * 0.5, warpKey(WARP_SALT1)).x);
  return p + u_warpAmp * streak * mask * d;
}
#endif
