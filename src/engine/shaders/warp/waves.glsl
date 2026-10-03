#ifdef WARP_WAVES
// Three sine waves at seeded angles, displacing along their wave fronts (silk
// ripples). u_warpParam[i] = (k · m, phase, weight / m).
vec2 warpShape(vec2 p) {
  vec2 d = vec2(0.0);
  for (int i = 0; i < 3; i++) {
    vec4 w = u_warpParam[i];
    float s = w.w * sin(TAU * u_warpFreq * dot(w.xy, p) + w.z);
    d += s * vec2(-w.y, w.x);
  }
  return p + u_warpAmp * d;
}
#endif
