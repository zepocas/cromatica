// M0 placeholder: piecewise-linear interpolation of the sRGB-encoded stop
// values. M1 replaces this with an Oklab lookup texture.

uniform int u_stopCount;
uniform float u_stopPos[MAX_STOPS];
uniform vec3 u_stopColor[MAX_STOPS];

vec3 stopColor(float t) {
  vec3 c = u_stopColor[0];
  for (int i = 1; i < MAX_STOPS; ++i) {
    if (i >= u_stopCount) break;
    float p0 = u_stopPos[i - 1];
    float p1 = u_stopPos[i];
    if (t > p0) {
      float span = p1 - p0;
      float f = span > 0.0 ? clamp((t - p0) / span, 0.0, 1.0) : 1.0;
      c = mix(u_stopColor[i - 1], u_stopColor[i], f);
    }
  }
  return c;
}
