#ifndef WARP_ANY
vec2 warpCoord(vec2 p) {
  return p;
}
#else
vec2 warpShape(vec2 p);

// Composition coords → warped composition coords (src/engine/warp.ts).
vec2 warpCoord(vec2 p) {
  return warpShape(clamp(p, -float(MAX_WARP_COORD), float(MAX_WARP_COORD)));
}
#endif
