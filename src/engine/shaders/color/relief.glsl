#ifdef RELIEF
// Relief (D46): the pattern lit as a height map, measured against a flat
// surface so unchanging areas stay untouched. Must match src/engine/relief.ts.

uniform float u_reliefDepth; // height-to-tilt factor
uniform vec3 u_reliefLight;  // unit vector toward the light
uniform vec3 u_reliefHalf;   // half vector between light and viewer

float extraHighlight(float nh, float flatNh, float exponent) {
  return max(0.0, pow(max(nh, 0.0), exponent) - pow(flatNh, exponent));
}

vec3 relief(vec3 rgb, vec2 comp) {
  vec2 tilt2 = -heightSlope(comp) * u_reliefDepth;
  tilt2 *= inversesqrt(1.0 + dot(tilt2, tilt2) / (MAX_TILT * MAX_TILT));
  vec3 n = normalize(vec3(tilt2, 1.0));
  float tilt = dot(n, u_reliefLight) - u_reliefLight.z;
  float nh = dot(n, u_reliefHalf);
#if RELIEF_GLASS
  vec3 under = patternColor(comp + n.xy * GLASS_REFRACT);
  float rim = GLASS_RIM * (1.0 - n.z) * (1.0 - n.z);
  float glint = GLASS_GLINT_WEIGHT * extraHighlight(nh, u_reliefHalf.z, GLASS_GLINT_EXP);
  return under * (1.0 + GLASS_SHADE * tilt) + (rim + glint) * (1.0 - GLASS_TINT + GLASS_TINT * under);
#else
  float sheen = SATIN_SHEEN_WEIGHT.x * extraHighlight(nh, u_reliefHalf.z, SATIN_SHEEN_EXP.x)
    + SATIN_SHEEN_WEIGHT.y * extraHighlight(nh, u_reliefHalf.z, SATIN_SHEEN_EXP.y);
  return rgb * (1.0 + SATIN_SHADE * tilt) + sheen * (1.0 - SATIN_TINT + SATIN_TINT * rgb);
#endif
}
#endif
