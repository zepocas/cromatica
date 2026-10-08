out vec4 fragColor;

// Output order (D5, D7, D33, D46, D60): pattern (transform → warp → base, linear RGB) → relief → vignette → halftone → sRGB transfer → print →
// grain → dither → 8-bit quantization by the framebuffer.
void main() {
  ivec2 px = outputPixel();
  vec2 comp = compositionCoord(px);
  vec3 rgb = patternColor(comp);
#ifdef RELIEF
  rgb = relief(rgb, comp);
#endif
  rgb *= vignetteFactor(comp);
#ifdef HALFTONE
  rgb = halftone(rgb, comp);
#endif
  vec3 encoded = srgbEncode(rgb);
  // Uniform branch: print off is an exact passthrough.
  if (u_printMix > 0.0) encoded = printTexture(encoded, px, comp);
  // Uniform branch: grain off is an exact passthrough (bit-identical to no grain stage).
  if (u_grainAmp > 0.0) encoded = grain(encoded, px);
  fragColor = vec4(dither(encoded, px), 1.0);
}
