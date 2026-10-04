#if BASE_MESH
// Color-point mesh: normalized rational-quadratic weights blended in Oklab.
//   w_i = (1 + |p - c_i|² / r_i²)^(-k), evaluated as exp(e_i - max e)
// with e_i = -k · log(1 + d² / r²). See src/color/mesh.ts for the rationale;
// the CPU reference there is the same math in doubles.

uniform int u_meshCount;
uniform float u_meshExponent;
uniform vec3 u_meshPoint[MAX_MESH_POINTS]; // x, y, 1 / r²
uniform vec3 u_meshColor[MAX_MESH_POINTS]; // Oklab, gamut-mapped on the CPU

vec3 meshColor(vec2 uv) {
  float e[MAX_MESH_POINTS];
  float emax = -3.0e38;
  for (int i = 0; i < MAX_MESH_POINTS; i++) {
    if (i >= u_meshCount) break;
    vec2 d = uv - u_meshPoint[i].xy;
    e[i] = -u_meshExponent * log(1.0 + dot(d, d) * u_meshPoint[i].z);
    emax = max(emax, e[i]);
  }
  float sum = 0.0;
  vec3 lab = vec3(0.0);
  for (int i = 0; i < MAX_MESH_POINTS; i++) {
    if (i >= u_meshCount) break;
    // Relative weight (the strongest is exactly 1), in bands when they're on.
    float w = bandLevel(exp(e[i] - emax));
    sum += w;
    lab += w * u_meshColor[i];
  }
  // sum >= 1: the largest weight is exactly exp(0), and bandLevel(1) = 1.
  return lab / sum;
}
#endif
