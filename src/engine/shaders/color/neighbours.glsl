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

// Height slope (dL/du, dL/dv) at comp by central differences, NEIGHBOUR_STEP
// apart in composition units so the look doesn't depend on the output size.
vec2 heightSlope(vec2 comp) {
  vec2 e = vec2(NEIGHBOUR_STEP, 0.0);
  float dx = oklabLightness(patternColor(comp + e.xy)) - oklabLightness(patternColor(comp - e.xy));
  float dy = oklabLightness(patternColor(comp + e.yx)) - oklabLightness(patternColor(comp - e.yx));
  return vec2(dx, dy) / (2.0 * NEIGHBOUR_STEP);
}
#endif
