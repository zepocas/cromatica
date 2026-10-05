#if BASE_AURORA
// Aurora: glowing ribbons over a dark sky, screen-blended in linear RGB
// (src/engine/aurora.ts, also the reference in doubles).

uniform int u_auroraCount;
uniform vec3 u_auroraSky;                   // linear sRGB
uniform vec3 u_auroraColor[MAX_RIBBONS];    // linear sRGB
uniform vec3 u_auroraLine[MAX_RIBBONS];     // center height, tilt, strength
uniform uint u_auroraKey;                   // flow-noise key of ribbon 0
uniform vec2 u_auroraWidth;                 // upward fade, lower edge

float ribbonGlow(int i, vec2 p) {
  uint key = u_auroraKey + uint(i) * RIBBON_KEY_STEP;
  vec3 line = u_auroraLine[i];
  float center = line.x + line.y * p.x + FLOW_AMP * fbm(vec2(p.x * FLOW_FREQ, 0.0), key, FLOW_OCTAVES);
  float d = p.y - center;
  float profile = d < 0.0 ? exp(-(d / u_auroraWidth.y) * (d / u_auroraWidth.y)) : exp(-d / u_auroraWidth.x);
  float rays = 1.0 - RAY_DEPTH * (0.5 + 0.5 * fbm(vec2(p.x * RAY_FREQ, p.y * RAY_STRETCH), key + RAY_KEY_OFFSET, RAY_OCTAVES));
  float mask = smoothstep(MASK_FROM, MASK_TO, fbm(vec2(p.x * MASK_FREQ, 0.0), key + MASK_KEY_OFFSET, 2));
  return clamp(line.z * profile * rays * mask, 0.0, 1.0);
}

vec3 auroraColor(vec2 p) {
  vec3 rgb = u_auroraSky;
  for (int i = 0; i < MAX_RIBBONS; i++) {
    if (i >= u_auroraCount) break;
    rgb = 1.0 - (1.0 - rgb) * (1.0 - u_auroraColor[i] * ribbonGlow(i, p));
  }
  return rgb;
}
#endif
