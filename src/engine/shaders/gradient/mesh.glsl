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
  if (u_bandMode == 1.0 && u_bandSteps >= 2.0) {
    // Facets: the share of the two strongest points in steps, so each band is a flat mix.
    int i1 = 0; int i2 = -1; float w2 = -1.0;
    for (int i = 0; i < MAX_MESH_POINTS; i++) {
      if (i >= u_meshCount) break;
      if (e[i] >= emax) { i1 = i; }
    }
    for (int i = 0; i < MAX_MESH_POINTS; i++) {
      if (i >= u_meshCount) break;
      if (i == i1) continue;
      float w = exp(e[i] - emax);
      if (w > w2) { w2 = w; i2 = i; }
    }
    if (i2 < 0) return u_meshColor[i1];
    float t = bandLevel(2.0 * w2 / (1.0 + w2));
    return mix(u_meshColor[i1], u_meshColor[i2], 0.5 * t);
  }
  float sum = 0.0;
  vec3 lab = vec3(0.0);
  for (int i = 0; i < MAX_MESH_POINTS; i++) {
    if (i >= u_meshCount) break;
    // Relative weight (the strongest is exactly 1), in bands when they're on.
    float w = u_bandMode == 0.0 ? bandLevel(exp(e[i] - emax)) : exp(e[i] - emax);
    sum += w;
    lab += w * u_meshColor[i];
  }
  // sum >= 1: the largest weight is exactly exp(0), and bandLevel(1) = 1.
  lab /= sum;
  if (u_bandMode == 2.0) lab.x = stepLightness(lab.x); // layers
  return lab;
}
#endif
