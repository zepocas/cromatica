// Exact sRGB transfer function (IEC 61966-2-1), linear → encoded.

float srgbEncode(float x) {
  x = clamp(x, 0.0, 1.0);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * pow(x, 1.0 / 2.4) - 0.055;
}

vec3 srgbEncode(vec3 c) {
  return vec3(srgbEncode(c.r), srgbEncode(c.g), srgbEncode(c.b));
}
