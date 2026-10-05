#if BASE_PLANES
// Planes (D37): seeded flat-color quads with torn edges over a background,
// composited back to front in linear RGB. The layout is prepared on the CPU
// (src/engine/planes.ts, also the reference in doubles).

uniform int u_planeCount;
uniform vec3 u_planeBackground;               // linear sRGB
uniform vec4 u_planeEdge[MAX_PLANES * 3];     // per plane 4 × (nx, ny, c): inside distance dot(n, p) - c
uniform vec3 u_planeBound[MAX_PLANES];        // bounding circle: x, y, radius
uniform vec3 u_planeColor[MAX_PLANES];        // linear sRGB
uniform uint u_planeKey;                      // torn-edge noise key of plane 0
uniform float u_planeTear;                    // how far a torn edge wanders; 0 = clean
uniform float u_planeRim;                     // paper rim strength; 0 = none
uniform float u_planeSoft;                    // edge half width: antialiasing plus blend

// Smooth value noise on the integer lattice, [0, 1).
float planeValueNoise(vec2 q, uint key) {
  vec2 i = floor(q);
  vec2 f = q - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  ivec2 c = ivec2(i);
  float a = hash1(c, key);
  float b = hash1(c + ivec2(1, 0), key);
  float d = hash1(c + ivec2(0, 1), key);
  float e = hash1(c + ivec2(1, 1), key);
  return a + (b - a) * u.x + (d - a) * u.y + (a - b - d + e) * u.x * u.y;
}

// Torn-edge noise, value fBm in [-1, 1].
float tearNoise(vec2 p, uint key) {
  vec2 q = clamp(p * TEAR_FREQ, -1.0e4, 1.0e4);
  float sum = 0.0;
  float amp = 1.0;
  for (int i = 0; i < TEAR_OCTAVES; i++) {
    sum += amp * (2.0 * planeValueNoise(q, key + uint(i) * OCTAVE_KEY_STEP) - 1.0);
    q = mat2(0.8, 0.6, -0.6, 0.8) * q * 2.0;
    amp *= 0.5;
  }
  return sum / (2.0 - pow(0.5, float(TEAR_OCTAVES - 1)));
}

vec3 planesColor(vec2 p) {
  vec3 rgb = u_planeBackground;
  float reach = u_planeTear + u_planeSoft;
  float near = u_planeTear + max(RIM_WIDTH, u_planeSoft);
  for (int i = 0; i < MAX_PLANES; i++) {
    if (i >= u_planeCount) break;
    vec3 bound = u_planeBound[i];
    if (length(p - bound.xy) > bound.z + reach) continue;
    vec4 a = u_planeEdge[3 * i];
    vec4 b = u_planeEdge[3 * i + 1];
    vec4 c = u_planeEdge[3 * i + 2];
    float d = min(
      min(dot(a.xy, p) - a.z, dot(vec2(a.w, b.x), p) - b.y),
      min(dot(b.zw, p) - c.x, dot(c.yz, p) - c.w)
    );
    if (d < -reach) continue;
    float rim = 0.0;
    if (d < near) {
      if (u_planeTear > 0.0) d += u_planeTear * tearNoise(p, u_planeKey + uint(i) * PLANE_KEY_STEP);
      rim = u_planeRim * (1.0 - smoothstep(0.0, RIM_WIDTH, d));
    }
    float cover = smoothstep(-u_planeSoft, u_planeSoft, d);
    vec3 color = mix(u_planeColor[i], PAPER_COLOR, rim);
    rgb = mix(rgb, color, cover);
  }
  return rgb;
}
#endif
