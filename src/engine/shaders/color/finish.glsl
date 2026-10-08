// Finishing effects (src/engine/finish.ts): vignette on the frame; bands on the
// ramp position, or on each mesh point's weight relative to the strongest.

uniform float u_vignette;      // darkening at the corners; 0 = off
uniform float u_vignetteScale; // 1 / half the frame diagonal
uniform float u_bandSteps;     // flat steps; 0 = off
uniform float u_bandEdge;      // fraction of each step that rises into the next; 0 = hard
uniform float u_bandMode;      // mesh bands (BAND_STYLES): 0 weights, 1 facets, 2 layers

// Multiplier on linear RGB at composition coords. Uniform branch: off is exactly 1.
float vignetteFactor(vec2 comp) {
  if (u_vignette == 0.0) return 1.0;
  return 1.0 - u_vignette * smoothstep(VIGNETTE_INNER, 1.0, length(comp) * u_vignetteScale);
}

// x in [0, 1] in flat steps, each rising into the next over its last
// u_bandEdge; 0 and 1 stay exact. Off is exactly x.
float bandLevel(float x) {
  if (u_bandSteps < 2.0) return x;
  float q = x * u_bandSteps;
  float k = floor(q);
  float rise = u_bandEdge > 0.0 ? smoothstep(1.0 - u_bandEdge, 1.0, q - k) : 0.0;
  return min(1.0, (k + rise) / (u_bandSteps - 1.0));
}

// Lightness in flat steps at their centers, each rising into the next over
// u_bandEdge. Off is exactly l (src/engine/finish.ts stepLightness).
float stepLightness(float l) {
  if (u_bandSteps < 2.0) return l;
  float q = clamp(l, 0.0, 1.0) * u_bandSteps;
  float k = floor(q);
  float rise = u_bandEdge > 0.0 ? smoothstep(1.0 - u_bandEdge, 1.0, q - k) : 0.0;
  return min(1.0, (k + rise + 0.5) / u_bandSteps);
}
