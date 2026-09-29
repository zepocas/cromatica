out vec4 fragColor;

// Output order (D5): linear RGB → sRGB transfer → dither → 8-bit quantization
// by the framebuffer.
void main() {
  ivec2 px = outputPixel();
  float t = linearGradientT(compositionCoord(px));
  vec3 encoded = srgbEncode(rampColor(t));
  fragColor = vec4(dither(encoded, px), 1.0);
}
