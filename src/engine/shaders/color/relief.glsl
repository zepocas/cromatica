#ifdef RELIEF
// Relief (D46): the pattern lit as a height map, measured against a flat
// surface so unchanging areas stay untouched. Must match src/engine/relief.ts.

uniform float u_reliefDepth; // height-to-tilt factor
uniform vec3 u_reliefLight;  // unit vector toward the light
uniform vec3 u_reliefHalf;   // half vector between light and viewer
uniform int u_reliefTaps;    // reliefTaps: the loop bound
uniform bool u_reliefPrecise; // central differences (exports, D108)

float extraHighlight(float nh, float flatNh, float exponent) {
  return max(0.0, pow(max(nh, 0.0), exponent) - pow(flatNh, exponent));
}

// The pattern at comp, with what the lighting reads there: the height (a lightness) and how far the pattern keeps one
// surface before an edge, which caps the glass's refraction. The height is the pattern's own lightness, except where
// the pattern is stippled and a smooth height stands in for it.
vec3 reliefSurface(vec2 comp, bool withColor, out float height, out float room) {
#if BASE_BLOBS
  BlobSurface s = blobsSurface(warpCoord(transformCoord(comp)), comp, withColor);
  height = oklabLightness(vec3(s.height * s.height * s.height));
  room = s.room;
  return s.color;
#else
  vec3 c = patternColor(comp);
  height = oklabLightness(c);
  room = 1e9;
  return c;
#endif
}

// The taps share one call site in a loop whose bound is a uniform, so the driver compiles the pattern once
// instead of inlining a copy per tap (D3D compilers unroll constant loops, and a heavy pattern then takes seconds).
// Tap 0 is the centre: its height, and the colour satin lights or the room glass refracts in; taps 1 and 2 the height
// a step along +u and +v, and, precise, 3 and 4 along -u and -v; tap 5 (glass) the colour under the surface.
vec3 relief(vec2 comp) {
  float centre = 0.0;
  vec2 ahead = vec2(0.0);
  vec3 n = vec3(0.0, 0.0, 1.0);
  vec3 lit = vec3(0.0);
  float room = 0.0;
  int last = u_reliefPrecise ? 4 : 2;
  for (int i = 0; i < u_reliefTaps; i++) {
    if (i > last && i < 5) continue;
#if RELIEF_GLASS && !BASE_BLOBS
    // Precise glass reads neither the centre's height nor its colour.
    if (i == 0 && u_reliefPrecise) continue;
#endif
    vec2 p = comp + neighbourOffset(i);
#if RELIEF_GLASS
    if (i == 5) {
#if BASE_BLOBS
      vec2 shift = n.xy * GLASS_REFRACT_BLOBS;
      shift *= min(1.0, GLASS_ROOM * room / max(length(shift), 1e-6));
      p += shift;
#else
      p += n.xy * GLASS_REFRACT;
#endif
    }
    bool withColor = i == 5;
#else
    bool withColor = i == 0;
#endif
    float height;
    float r;
    vec3 c = reliefSurface(p, withColor, height, r);
    if (i == 0) {
      centre = height;
      room = r;
    } else if (i == 1) {
      ahead.x = height;
    } else if (i == 2) {
      ahead.y = height;
    } else if (i == 3) {
      ahead.x -= height;
    } else if (i == 4) {
      ahead.y -= height;
    }
    if (i == last) {
      vec2 slope = u_reliefPrecise ? ahead / (2.0 * NEIGHBOUR_STEP) : (ahead - centre) / NEIGHBOUR_STEP;
      vec2 tilt2 = -slope * u_reliefDepth;
      tilt2 *= inversesqrt(1.0 + dot(tilt2, tilt2) / (MAX_TILT * MAX_TILT));
      n = normalize(vec3(tilt2, 1.0));
    }
    if (withColor) lit = c;
  }
  float tilt = dot(n, u_reliefLight) - u_reliefLight.z;
  float nh = dot(n, u_reliefHalf);
#if RELIEF_GLASS
  vec3 under = lit;
  float rim = GLASS_RIM * (1.0 - n.z) * (1.0 - n.z);
  float glint = GLASS_GLINT_WEIGHT * extraHighlight(nh, u_reliefHalf.z, GLASS_GLINT_EXP);
  return under * (1.0 + GLASS_SHADE * tilt) + (rim + glint) * (1.0 - GLASS_TINT + GLASS_TINT * under);
#else
  float sheen = SATIN_SHEEN_WEIGHT.x * extraHighlight(nh, u_reliefHalf.z, SATIN_SHEEN_EXP.x)
    + SATIN_SHEEN_WEIGHT.y * extraHighlight(nh, u_reliefHalf.z, SATIN_SHEEN_EXP.y);
  return lit * (1.0 + SATIN_SHADE * tilt) + sheen * (1.0 - SATIN_TINT + SATIN_TINT * lit);
#endif
}
#endif
