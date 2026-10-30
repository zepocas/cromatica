#if BASE_BLOBS
// Blobs: seeded lumpy bubbles stacked back to front like planes, each with stippled ink over a
// black base (src/engine/blobs.ts, also the reference in doubles). Needs blueNoise from dither.glsl.

uniform vec3 u_blobBackground;              // linear sRGB
uniform vec3 u_blobBase;
uniform vec3 u_blobInk[MAX_INKS];
uniform vec4 u_blobInkDot[MAX_INKS];        // dot color, then 0 = ink dots over the black base, 1 = a deeper shade of the ink shading it
uniform vec4 u_blobShape0[MAX_BLOBS];       // centre x, y, radius, turn
uniform vec4 u_blobShape1[MAX_BLOBS];       // elongation, then the weights of the 2-, 3- and 4-lobed lumps
uniform vec4 u_blobShape2[MAX_BLOBS];       // the phases of those lumps, then the ink index
uniform vec3 u_blobCull[MAX_BLOBS];         // centre x, y, then the squared reach (blobReach in blobs.ts)
uniform highp usampler2D u_blobBins;        // per cell, a bit per blob that can reach it (blobBins in blobs.ts)
uniform vec4 u_blobBinBox;                  // the grid's lower-left corner, then cells per unit
uniform float u_blobDot;                    // stipple dot cell; 0 = no stipple, a smooth tone
uniform float u_blobSoft;                   // edge half width: antialiasing

// How far p is from blob i's centre and how far the outline is in that direction, in the blob's own stretched, turned frame.
vec2 blobPolar(int i, vec2 p) {
  vec4 a = u_blobShape0[i];
  vec4 b = u_blobShape1[i];
  vec4 c = u_blobShape2[i];
  vec2 d = p - a.xy;
  float cs = cos(a.w);
  float sn = sin(a.w);
  float s = sqrt(b.x);
  vec2 q = vec2((cs * d.x + sn * d.y) / s, (-sn * d.x + cs * d.y) * s);
  float phi = atan(q.y, q.x);
  float r = a.z * (1.0 + b.y * cos(2.0 * phi + c.x) + b.z * cos(3.0 * phi + c.y) + b.w * cos(4.0 * phi + c.z));
  return vec2(length(q), r);
}

// Distance-like value to blob i's outline (negative inside), from its blobPolar.
float blobDist(vec2 lr) {
  return lr.x - lr.y;
}

// How deep a point is inside blob i, from its blobPolar: the radius times the share of the way from the outline to the centre, so the
// contours of constant depth are scaled copies of the outline and the ink follows the blob's own form (a little rounded at the centre, see PEAK).
float blobDepth(int i, vec2 lr) {
  float radius = u_blobShape0[i].z;
  float e = BLOB_PEAK * radius;
  return radius * (1.0 - (length(vec2(lr.x, e)) - e) / (length(vec2(lr.y, e)) - e));
}

float blobNoise(ivec2 cell, ivec2 tap) {
  return blueNoise(cell + tap);
}

// Share of ink at comp: round dots, one per cell where the density beats the cell's blue noise,
// at a jittered spot with its own radius, so nothing lines up on a grid.
float blobStipple(vec2 comp, float density) {
  // No dot ever beats the noise at density 0 (the black rim).
  if (density <= 0.0) return 0.0;
  vec2 g = comp / u_blobDot;
  float aa = min(u_blobSoft / u_blobDot, 0.5);
  ivec2 c0 = ivec2(floor(g));
  float cover = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      ivec2 cell = c0 + ivec2(dx, dy);
      if (density <= blueNoise(cell)) continue;
      vec2 at = vec2(cell) + DOT_JITTER_MARGIN + DOT_JITTER_RANGE * vec2(blobNoise(cell, TAP_X), blobNoise(cell, TAP_Y));
      float r = DOT_RADIUS_BASE + DOT_RADIUS_SPREAD * blobNoise(cell, TAP_R);
      cover = max(cover, 1.0 - smoothstep(r - aa, r + aa, length(g - at)));
    }
  }
  return cover;
}

// Whether p can be in blob i: within how far its outline can reach from the centre, edge softness included.
bool blobReaches(int i, vec2 p) {
  vec3 c = u_blobCull[i];
  vec2 d = p - c.xy;
  return dot(d, d) <= c.z;
}

// Index of the highest set bit, from the exponent of the mask as a float: exact, since a mask
// fits a float's mantissa (GLSL ES 3.00 has no findMSB).
int highestBit(uint mask) {
  return int(floatBitsToUint(float(mask)) >> 23) - 127;
}

// The blobs that can reach p, a bit each in drawing order; none off the grid (or at a NaN point, which fails both tests).
uint blobMask(vec2 p) {
  vec2 g = (p - u_blobBinBox.xy) * u_blobBinBox.zw;
  if (!(all(greaterThanEqual(g, vec2(0.0))) && all(lessThan(g, vec2(float(BLOB_BINS)))))) return 0u;
  return texelFetch(u_blobBins, ivec2(g), 0).r;
}

// Share of full ink at p inside blob i, none in the black rim, full deep in,
// and deeper on the light side.
float blobDensity(int i, vec2 p, vec2 lr) {
  vec4 a = u_blobShape0[i];
  float lit = dot(p - a.xy, BLOB_LIGHT_DIR) / a.z;
  float depth = max(blobDepth(i, lr), 0.0) / a.z + BLOB_LIGHT_SHIFT * lit;
  return pow(clamp((depth - BLOB_RIM) / (BLOB_FADE - BLOB_RIM), 0.0, 1.0), BLOB_DENSITY_POWER);
}

// The color of ink k at a density: dots of its dot color over its body (black for ink dots, else the ink itself).
vec3 blobColor(int k, float density, vec2 comp) {
  vec4 dotInk = u_blobInkDot[k];
  float mode = dotInk.w;
  float tone = smoothstep(0.0, BLOB_SMOOTH_SOLID, density);
  float dotDensity = mode < 0.5 ? density : max(0.0, 1.0 - density / BLOB_SHADE_CLEAR);
  float smoothShare = mode < 0.5 ? tone : 1.0 - tone;
  float share = u_blobDot > 0.0 ? blobStipple(comp, dotDensity) : smoothShare;
  vec3 body = mode < 0.5 ? u_blobBase : u_blobInk[k];
  return mix(body, dotInk.xyz, share);
}

// What a point of the blobs is: its color, its smooth dome height (what the lighting reads instead of the
// dots) and how deep it is inside them (the room the glass has before an outline). The visible blobs are
// weighted by how much of the point they cover.
struct BlobSurface {
  vec3 color;
  float height;
  float room;
};

// p: pattern coords (the shapes); comp: composition coords, which the stipple follows so a warp bends the shapes, not the dots.
// Without withColor the inks are left out of the color (the lighting's height reads don't need their stipple).
BlobSurface blobsSurface(vec2 p, vec2 comp, bool withColor) {
  vec3 rgb = vec3(0.0);
  float height = 0.0;
  float room = 0.0;
  float remaining = 1.0;
  // Front to back: each blob takes its share of what the ones above left uncovered.
  uint mask = blobMask(p);
  for (int k = 0; k < MAX_BLOBS; k++) {
    if (mask == 0u || remaining <= 0.001) break;
    int i = highestBit(mask);
    mask ^= 1u << uint(i);
    if (!blobReaches(i, p)) continue;
    vec2 lr = blobPolar(i, p);
    float cover = 1.0 - smoothstep(-u_blobSoft, u_blobSoft, blobDist(lr));
    if (cover <= 0.0) continue;
    if (withColor) rgb += remaining * cover * blobColor(int(u_blobShape2[i].w), blobDensity(i, p, lr), comp);
    float depth = blobDepth(i, lr);
    float inside = clamp(depth / (BLOB_DOME * u_blobShape0[i].z), 0.0, 1.0);
    height += remaining * cover * (1.0 - (1.0 - inside) * (1.0 - inside));
    room += remaining * cover * max(depth, 0.0);
    remaining *= 1.0 - cover;
  }
  return BlobSurface(rgb + remaining * u_blobBackground, height, room);
}

vec3 blobsColor(vec2 p, vec2 comp) {
  return blobsSurface(p, comp, true).color;
}
#endif
