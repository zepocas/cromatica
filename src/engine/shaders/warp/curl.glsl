#ifdef WARP_CURL
// Stateless curl-noise flow: CURL_STEPS Euler steps along the curl of a
// two-octave simplex stream function, integrated per pixel (D2).
vec2 warpShape(vec2 p) {
  uint k0 = warpKey(0x51u);
  uint k1 = warpKey(0x52u);
  float h = u_warpAmp * 0.25 / float(CURL_STEPS);
  for (int i = 0; i < CURL_STEPS; i++) {
    vec2 s = p * u_warpFreq;
    // ∇ψ in noise units; the second octave's chain-rule 2 cancels its 0.5 weight.
    vec2 g = simplex(s, k0).yz + simplex(2.0 * s, k1).yz;
    p += h * vec2(g.y, -g.x);
  }
  return p;
}
#endif
