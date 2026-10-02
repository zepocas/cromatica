#if BASE_LINEAR
// Gradient ramp lookup: u_ramp is a RAMP_SIZE×1 RGBA16F texture of LINEAR
// sRGB, baked on the CPU from the Oklch stops. Entry i holds t = i / (N - 1),
// so t maps to texel centers: (t·(N - 1) + 0.5) / N.

uniform sampler2D u_ramp;
uniform float u_rampSize;

vec3 rampColor(float t) {
  float s = (t * (u_rampSize - 1.0) + 0.5) / u_rampSize;
  return texture(u_ramp, vec2(s, 0.5)).rgb;
}
#endif
