#ifdef NEIGHBOURS
// Neighbour sampling (D46): the pattern read as a height map, height = Oklab
// lightness. Must match src/engine/neighbours.ts.

float oklabLightness(vec3 rgb) {
  vec3 lms = vec3(
    dot(vec3(0.412221469470763, 0.5363325372617348, 0.0514459932675022), rgb),
    dot(vec3(0.2119034958178252, 0.6806995506452344, 0.1073969535369406), rgb),
    dot(vec3(0.0883024591900564, 0.2817188391361215, 0.6299787016738222), rgb));
  lms = pow(max(lms, vec3(0.0)), vec3(1.0 / 3.0));
  return dot(vec3(0.210454268309314, 0.7936177747023054, -0.0040720430116193), lms);
}

// Offset of height tap i (0..3) from the centre: +u, -u, +v, -v, NEIGHBOUR_STEP apart in composition
// units so the look doesn't depend on the output size. The slope is the central difference of each pair.
vec2 neighbourOffset(int i) {
  float e = NEIGHBOUR_STEP;
  return i == 0 ? vec2(e, 0.0) : i == 1 ? vec2(-e, 0.0) : i == 2 ? vec2(0.0, e) : vec2(0.0, -e);
}
#endif
