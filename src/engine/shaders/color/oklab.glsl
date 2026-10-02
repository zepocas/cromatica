#if BASE_MESH
// Oklab → linear sRGB (Ottosson's matrices, cube of LMS) and the mesh gamut
// clip. Must match src/color/oklab.ts and meshGamutClip in src/color/mesh.ts.

vec3 oklabToLinearSrgb(vec3 lab) {
  vec3 lms = mat3(
    1.0, 1.0, 1.0,
    0.3963377773761749, -0.1055613458156586, -0.0894841775298119,
    0.2158037573099136, -0.0638541728258133, -1.2914855480194092) * lab;
  lms = lms * lms * lms;
  return mat3(
    4.0767416360759574, -1.2684379732850317, -0.0041960761386756,
    -3.3077115392580616, 2.6097573492876887, -0.7034186179359362,
    0.2309699031821044, -0.3413193760026573, 1.7076146940746117) * lms;
}

vec3 cbrt0(vec3 x) {
  // x >= 0 here; pow(0, y) is defined for y > 0.
  return pow(max(x, vec3(0.0)), vec3(1.0 / 3.0));
}

vec3 linearSrgbToOklab(vec3 rgb) {
  vec3 lms = cbrt0(mat3(
    0.412221469470763, 0.2119034958178252, 0.0883024591900564,
    0.5363325372617348, 0.6806995506452344, 0.2817188391361215,
    0.0514459932675022, 0.1073969535369406, 0.6299787016738222) * rgb);
  return mat3(
    0.210454268309314, 1.9779985324311684, 0.0259040424655478,
    0.7936177747023054, -2.4285922420485799, 0.7827717124575296,
    -0.0040720430116193, 0.450593709617411, -0.8086757549230774) * lms;
}

bool inUnitCube(vec3 c) {
  return all(greaterThanEqual(c, vec3(0.0))) && all(lessThanEqual(c, vec3(1.0)));
}

const float GAMUT_JND = 0.02;

// Oklab blends of in-gamut colors can land slightly outside sRGB. Same method
// as the ramp (CSS Color 4 gamut mapping, src/color/oklab.ts): accept the
// channel clip if it is within a JND (ΔE_OK 0.02), else bisect the chroma
// scale at constant L and hue for the most chroma whose clip is within a JND.
// A fixed step count keeps it deterministic per pixel. Pure chroma reduction
// to the boundary was rejected: near the blue cusp the boundary runs almost
// along the chroma axis and it lost up to 0.06 ΔE_OK of chroma vs the ramp.
vec3 gamutClip(vec3 lab) {
  if (lab.x >= 1.0) return vec3(1.0);
  if (lab.x <= 0.0) return vec3(0.0);
  vec3 rgb = oklabToLinearSrgb(lab);
  if (inUnitCube(rgb)) return rgb;
  vec3 clipped = clamp(rgb, 0.0, 1.0);
  if (distance(linearSrgbToOklab(clipped), lab) < GAMUT_JND) return clipped;
  float lo = 0.0;
  float hi = 1.0;
  bool loInGamut = true;
  for (int i = 0; i < GAMUT_CLIP_STEPS; i++) {
    float k = 0.5 * (lo + hi);
    vec3 cur = vec3(lab.x, lab.yz * k);
    rgb = oklabToLinearSrgb(cur);
    if (loInGamut && inUnitCube(rgb)) {
      lo = k;
    } else if (distance(linearSrgbToOklab(clamp(rgb, 0.0, 1.0)), cur) < GAMUT_JND) {
      loInGamut = false;
      lo = k;
    } else {
      hi = k;
    }
  }
  return clamp(oklabToLinearSrgb(vec3(lab.x, lab.yz * lo)), 0.0, 1.0);
}
#endif
