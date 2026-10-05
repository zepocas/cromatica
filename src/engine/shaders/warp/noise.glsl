#if defined(WARP_ANY) || defined(NOISE_LIB)
// Noise library of the warps and the noise/cells patterns; src/engine/noise.ts
// is the same math in doubles. The seed only ever enters through hash keys (D2).

const float TAU = 6.283185307179586;
const float NOISE_MAX = 1.0e4; // cell coords stay well inside int and fp32 range

#ifdef WARP_ANY
uniform uint u_warpSeed;
uniform float u_warpFreq;     // cycles per image height
uniform float u_warpAmp;      // shape-specific magnitude (src/engine/warp.ts TUNING)
uniform vec4 u_warpParam[WARP_PARAM_SLOTS]; // seeded per-shape parameters

uint warpKey(uint salt) {
  return u_warpSeed ^ (salt * 0x9E3779B9u);
}
#endif

uint octaveKey(uint key, int i) {
  return key + uint(i) * 0x632BE5ABu;
}

vec2 clampCoord(vec2 p) {
  return clamp(p, -NOISE_MAX, NOISE_MAX);
}

vec3 simplexCorner(vec2 x, ivec2 c, uint key) {
  float t = 0.5 - dot(x, x);
  if (t <= 0.0) return vec3(0.0);
  float a = hash1(c, key) * TAU;
  vec2 g = vec2(cos(a), sin(a));
  float t2 = t * t;
  float t4 = t2 * t2;
  float gd = dot(g, x);
  return vec3(t4 * gd, t4 * g - 8.0 * t2 * t * gd * x);
}

// 2D simplex noise: (value ≈ [-1, 1], d/dx, d/dy).
vec3 simplex(vec2 p, uint key) {
  const float F2 = 0.3660254037844386;
  const float G2 = 0.21132486540518713;
  p = clampCoord(p);
  vec2 i = floor(p + (p.x + p.y) * F2);
  vec2 x0 = p - i + (i.x + i.y) * G2;
  vec2 o = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  ivec2 c = ivec2(i);
  vec3 n = simplexCorner(x0, c, key)
    + simplexCorner(x0 - o + G2, c + ivec2(o), key)
    + simplexCorner(x0 - 1.0 + 2.0 * G2, c + 1, key);
  return 70.0 * n;
}

#ifdef WARP_RIDGED
// Ridged simplex fBm, ≈ [-1, 1]: each octave is (1 - |n|)² (src/engine/noise.ts ridged).
float ridged(vec2 p, uint key, int octaves) {
  float sum = 0.0;
  float amp = 1.0;
  for (int i = 0; i < octaves; i++) {
    float n = 1.0 - abs(simplex(p, octaveKey(key, i)).x);
    sum += amp * n * n;
    p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.0;
    amp *= 0.5;
  }
  return sum * (2.0 / (2.0 - pow(0.5, float(octaves - 1)))) - 1.0;
}
#endif

// Simplex fBm, lacunarity 2, gain 0.5, rotated per octave; ≈ [-1, 1].
float fbm(vec2 p, uint key, int octaves) {
  float sum = 0.0;
  float amp = 1.0;
  for (int i = 0; i < octaves; i++) {
    sum += amp * simplex(p, octaveKey(key, i)).x;
    p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.0;
    amp *= 0.5;
  }
  // Normalized by Σ 0.5^i.
  return sum * (1.0 / (2.0 - pow(0.5, float(octaves - 1))));
}

#if defined(WARP_WORLEY) || defined(WARP_VORONOI) || defined(NOISE_CELLS)
// Jittered feature point of a Worley/Voronoi cell, cell units.
vec2 cellFeature(ivec2 c, uint key) {
  return vec2(c) + 0.1 + 0.8 * hash2(c, key);
}

// F1 cell c1 and its feature p1, the cell c2 across the nearest border;
// returns the distance to that border (bisector), cell units. 3×3 searches.
float voronoiCells(vec2 s, uint key, out ivec2 c1, out vec2 p1, out ivec2 c2) {
  ivec2 c = ivec2(floor(s));
  float best = 3.0e38;
  c1 = c;
  p1 = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      ivec2 cell = c + ivec2(i, j);
      vec2 f = cellFeature(cell, key);
      vec2 d = f - s;
      float d2 = dot(d, d);
      if (d2 < best) {
        best = d2;
        c1 = cell;
        p1 = f;
      }
    }
  }
  float edge = 3.0e38;
  c2 = c1;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      if (i == 0 && j == 0) continue;
      ivec2 cell = c1 + ivec2(i, j);
      vec2 f = cellFeature(cell, key);
      vec2 d = f - p1;
      float e = dot((p1 + f) * 0.5 - s, d) / sqrt(dot(d, d));
      if (e < edge) {
        edge = e;
        c2 = cell;
      }
    }
  }
  return edge;
}
#endif
#endif
