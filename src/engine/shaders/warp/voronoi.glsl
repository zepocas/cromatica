#ifdef WARP_VORONOI
// Each Voronoi cell shifted by its own hashed offset (faceted glass). At a
// border both cells give their mean offset, softened over WARP_EDGE.
vec2 warpShape(vec2 p) {
  vec2 s = clampCoord(p * u_warpFreq);
  ivec2 c1, c2;
  vec2 p1;
  float edge = voronoiCells(s, warpKey(WARP_SALT0), c1, p1, c2);
  uint ko = warpKey(WARP_SALT1);
  vec2 o1 = hash2(c1, ko);
  vec2 m = (o1 + hash2(c2, ko)) * 0.5;
  float t = smoothstep(0.0, WARP_EDGE * u_warpFreq, edge);
  return p + u_warpAmp * ((m + (o1 - m) * t) * 2.0 - 1.0);
}
#endif
