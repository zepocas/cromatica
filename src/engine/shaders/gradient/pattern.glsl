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
#elif BASE_BLOBS
  return blobsColor(uv, comp);
#elif BASE_GRID
  return gamutClip(gridColor(uv, t + GRID_LINE_WARP * (uv - t)));
#else
  return rampColor(bandLevel(rampT(uv)));
#endif
}

// What the lighting reads as the surface height (its lightness): the pattern itself, except where that
// is stippled and a smooth height stands in for it.
vec3 heightColor(vec2 comp) {
#if BASE_BLOBS
  return blobsHeight(warpCoord(transformCoord(comp)));
#else
  return patternColor(comp);
#endif
}
