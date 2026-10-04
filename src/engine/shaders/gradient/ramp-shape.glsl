#if BASE_RAMP
// Ramp position t of a pattern-space point (src/engine/ramp-shape.ts).
// Linear: u_rampAxis = direction / frame extent, so t = 0..1 spans the frame.
// Radial: u_radialScale = 1 / half the frame diagonal.
// Conic: u_rampAxis = unit start direction; t = (1 - cos θ) / 2, seamless.

uniform vec2 u_rampAxis;
uniform float u_radialScale;

float rampT(vec2 uv) {
#if RAMP_RADIAL
  return min(1.0, length(uv) * u_radialScale);
#elif RAMP_CONIC
  float len = length(uv);
  // Near the center t eases toward mid-ramp (CONIC_CORE), so a warp can't shred the point where every color meets.
  float k = smoothstep(0.0, CONIC_CORE, len);
  return len < 1e-12 ? 0.5 : 0.5 - 0.5 * k * dot(uv, u_rampAxis) / len;
#else
  return clamp(dot(uv, u_rampAxis) + 0.5, 0.0, 1.0);
#endif
}
#endif
