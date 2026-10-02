#if BASE_LINEAR
// Linear gradient parameter. u_linearAxis = (cos a, sin a) / frameExtent,
// precomputed on the CPU, where frameExtent is the length of the output
// frame's projection onto the direction. t = 0..1 spans the frame.

uniform vec2 u_linearAxis;

float linearGradientT(vec2 uv) {
  return clamp(dot(uv, u_linearAxis) + 0.5, 0.0, 1.0);
}
#endif
