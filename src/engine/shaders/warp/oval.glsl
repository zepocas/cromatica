#ifdef WARP_OVAL
// Elliptical swirl around a seeded center: rotate in the ellipse's normalized
// frame by an angle that falls off with distance.
// u_warpParam[0] = (center, cos a, sin a), [1] = (q, 1 / q, spin, -).
vec2 warpShape(vec2 p) {
  vec2 c = u_warpParam[0].xy;
  float ca = u_warpParam[0].z;
  float sa = u_warpParam[0].w;
  vec2 d = p - c;
  vec2 e = vec2(ca * d.x + sa * d.y, (-sa * d.x + ca * d.y) * u_warpParam[1].y);
  float th = u_warpAmp * u_warpParam[1].z * exp(-dot(e, e) * u_warpFreq * u_warpFreq);
  float cs = cos(th);
  float sn = sin(th);
  vec2 l = vec2(cs * e.x - sn * e.y, (sn * e.x + cs * e.y) * u_warpParam[1].x);
  return c + vec2(ca * l.x - sa * l.y, sa * l.x + ca * l.y);
}
#endif
