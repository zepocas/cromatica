// Blue-noise TPDF dither, ±1 LSB of the 8-bit output (D7). u_blueNoise holds
// void-and-cluster ranks (R16UI); it is indexed by OUTPUT pixel, so the
// pattern does not depend on tiling. Each channel reads the tile at its own
// offset so the channels are decorrelated.

uniform highp usampler2D u_blueNoise;
uniform ivec2 u_ditherOffset[3];
uniform float u_dither; // 1 = on, 0 = off

// Uniform (0, 1) → triangular (-1, 1) by the inverse CDF. Monotone, so the
// blue-noise spectrum of the ranks carries over.
float triangular(float u) {
  return u < 0.5 ? sqrt(2.0 * u) - 1.0 : 1.0 - sqrt(2.0 - 2.0 * u);
}

float blueNoise(ivec2 px) {
  ivec2 p = px & (BLUE_NOISE_SIZE - 1);
  uint rank = texelFetch(u_blueNoise, p, 0).r;
  return (float(rank) + 0.5) / float(BLUE_NOISE_SIZE * BLUE_NOISE_SIZE);
}

vec3 dither(vec3 encoded, ivec2 px) {
  vec3 n = vec3(
    triangular(blueNoise(px + u_ditherOffset[0])),
    triangular(blueNoise(px + u_ditherOffset[1])),
    triangular(blueNoise(px + u_ditherOffset[2])));
  // Fade the dither out within 1 LSB of black/white so exact 0 and 255 stay
  // exact (no ±1 specks after clamping); the bias this adds is < 1 LSB there.
  vec3 fade = clamp(min(encoded, 1.0 - encoded) * 255.0, 0.0, 1.0);
  return encoded + n * fade * (u_dither / 255.0);
}
