// Finishing effects (src/engine/finish.ts): vignette on the frame, bands on the ramp.

uniform float u_vignette;      // darkening at the corners; 0 = off
uniform float u_vignetteScale; // 1 / half the frame diagonal
uniform float u_bandSteps;     // flat steps of the ramp; 0 = off

// Multiplier on linear RGB at composition coords. Uniform branch: off is exactly 1.
float vignetteFactor(vec2 comp) {
  if (u_vignette == 0.0) return 1.0;
  return 1.0 - u_vignette * smoothstep(VIGNETTE_INNER, 1.0, length(comp) * u_vignetteScale);
}

// The ramp position in flat steps; t = 0 and 1 stay exact.
float bandT(float t) {
  if (u_bandSteps < 2.0) return t;
  return min(1.0, floor(t * u_bandSteps) / (u_bandSteps - 1.0));
}
