// The pattern at composition coords, in linear RGB: transform → warp → base
// pattern (bands applied; planes are already flat). Finishes act on top of it.
vec3 patternColor(vec2 comp) {
  vec2 t = transformCoord(comp);
  vec2 uv = warpCoord(t);
#if BASE_MESH
  return gamutClip(meshColor(uv));
#elif BASE_PLANES
  return planesColor(uv);
#elif BASE_AURORA
  return auroraColor(uv);
#elif BASE_GRID
  return gamutClip(gridColor(uv, t + GRID_LINE_WARP * (uv - t)));
#else
  return rampColor(bandLevel(rampT(uv)));
#endif
}
