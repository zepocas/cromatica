out vec4 fragColor;

// Output order (D5, D7, D33): transform → warp → base pattern (linear RGB, bands) → vignette → sRGB transfer →
// grain → dither → 8-bit quantization by the framebuffer.
void main() {
  ivec2 px = outputPixel();
  vec2 comp = compositionCoord(px);
  vec2 uv = warpCoord(transformCoord(comp));
#if BASE_MESH
  vec3 rgb = gamutClip(meshColor(uv));
#else
  vec3 rgb = rampColor(bandLevel(rampT(uv)));
#endif
  rgb *= vignetteFactor(comp);
  vec3 encoded = srgbEncode(rgb);
  // Uniform branch: grain off is an exact passthrough (bit-identical to no grain stage).
  if (u_grainAmp > 0.0) encoded = grain(encoded, px);
  fragColor = vec4(dither(encoded, px), 1.0);
}
