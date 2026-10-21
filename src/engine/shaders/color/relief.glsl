#ifdef RELIEF
// Relief (D46): the pattern lit as a height map, measured against a flat
// surface so unchanging areas stay untouched. Must match src/engine/relief.ts.

uniform float u_reliefDepth; // height-to-tilt factor
uniform vec3 u_reliefLight;  // unit vector toward the light
uniform vec3 u_reliefHalf;   // half vector between light and viewer
uniform int u_reliefTaps;    // RELIEF_TAPS

float extraHighlight(float nh, float flatNh, float exponent) {
  return max(0.0, pow(max(nh, 0.0), exponent) - pow(flatNh, exponent));
}

// Tap i of the relief: 0..3 read the height (the lightness of the pattern), 4 reads the colour that is lit.
vec3 reliefTap(int i, vec2 p) {
#if BASE_BLOBS
  return i < 4 ? heightColor(p) : patternColor(p);
#else
  return patternColor(p);
#endif
}

// The taps share one call site in a loop whose bound is a uniform, so the driver compiles the pattern once
// instead of inlining a copy per tap (D3D compilers unroll constant loops, and a heavy pattern then takes seconds).
vec3 relief(vec2 comp) {
  float dx = 0.0;
  float dy = 0.0;
  vec3 n = vec3(0.0, 0.0, 1.0);
  vec3 lit = vec3(0.0);
  for (int i = 0; i < u_reliefTaps; i++) {
    vec2 p = comp;
    if (i < 4) {
      p += neighbourOffset(i);
    }
#if RELIEF_GLASS
    else {
#if BASE_BLOBS
      vec2 shift = n.xy * GLASS_REFRACT_BLOBS;
      shift *= min(1.0, GLASS_ROOM * refractRoom(comp) / max(length(shift), 1e-6));
      p += shift;
#else
      p += n.xy * GLASS_REFRACT;
#endif
    }
#endif
    vec3 c = reliefTap(i, p);
    if (i < 4) {
      float l = oklabLightness(c);
      float tap = (i == 0 || i == 2) ? l : -l;
      if (i < 2) dx += tap; else dy += tap;
      if (i == 3) {
        vec2 tilt2 = -(vec2(dx, dy) / (2.0 * NEIGHBOUR_STEP)) * u_reliefDepth;
        tilt2 *= inversesqrt(1.0 + dot(tilt2, tilt2) / (MAX_TILT * MAX_TILT));
        n = normalize(vec3(tilt2, 1.0));
      }
    } else {
      lit = c;
    }
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
