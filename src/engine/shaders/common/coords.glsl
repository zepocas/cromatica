// Output-pixel and composition coordinates (see src/engine/types.ts).
// All inputs are integers so every pixel gets the exact same value no matter
// which tile renders it.

uniform ivec2 u_outputSize; // output width, height
uniform ivec4 u_tile;       // x, y, width, height; top-left origin

// Output pixel index (top-left origin) of the current fragment.
ivec2 outputPixel() {
  // gl_FragCoord is at pixel centers (n + 0.5), so truncation gives n exactly.
  ivec2 frag = ivec2(gl_FragCoord.xy);
  // gl_FragCoord.y counts up from the tile's bottom row.
  return ivec2(u_tile.x + frag.x, u_tile.y + (u_tile.w - 1 - frag.y));
}

// Composition coords: height = 1 unit, origin at center, +y up.
//   u = (px + 0.5 - W/2) / H = (2px + 1 - W) / 2H
//   v = (H/2 - (py + 0.5)) / H = (H - 2py - 1) / 2H
// Numerators and denominator are exact integers (well below 2^24 as floats),
// so the only rounding is the final division, identical for every tile.
vec2 compositionCoord(ivec2 px) {
  ivec2 num = ivec2(2 * px.x + 1 - u_outputSize.x, u_outputSize.y - 2 * px.y - 1);
  return vec2(num) / float(2 * u_outputSize.y);
}

// Whole-image transform (src/engine/transform.ts): composition → pattern coords.
uniform mat2 u_transform;

vec2 transformCoord(vec2 p) {
  return u_transform * p;
}
