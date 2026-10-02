out vec4 fragColor;

// Output order (D5): linear RGB → sRGB transfer → dither → 8-bit quantization
// by the framebuffer.
void main() {
  ivec2 px = outputPixel();
#if BASE_MESH
  vec3 rgb = gamutClip(meshColor(compositionCoord(px)));
#else
  vec3 rgb = rampColor(linearGradientT(compositionCoord(px)));
#endif
  vec3 encoded = srgbEncode(rgb);
  fragColor = vec4(dither(encoded, px), 1.0);
}
