#if BASE_BLOBS
// Blobs: seeded lumpy bubbles stacked back to front like planes, each with stippled ink over a
// black base (src/engine/blobs.ts, also the reference in doubles). Needs blueNoise from dither.glsl.

uniform int u_blobCount;
uniform vec3 u_blobBackground;              // linear sRGB
uniform vec3 u_blobBase;
uniform vec3 u_blobInk[MAX_INKS];
uniform vec4 u_blobInkDot[MAX_INKS];        // dot color, then 0 = ink dots over the black base, 1 = a deeper shade of the ink shading it
uniform vec4 u_blobShape0[MAX_BLOBS];       // centre x, y, radius, turn
uniform vec4 u_blobShape1[MAX_BLOBS];       // elongation, then the weights of the 2-, 3- and 4-lobed lumps
uniform vec4 u_blobShape2[MAX_BLOBS];       // the phases of those lumps, then the ink index
uniform float u_blobDot;                    // stipple dot cell; 0 = no stipple, a smooth tone
uniform float u_blobSoft;                   // edge half width: antialiasing

// Distance-like value to blob i's outline (negative inside) in its own stretched, turned frame.
float blobDist(int i, vec2 p) {
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
  return length(q) - r;
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
  vec4 a = u_blobShape0[i];
  vec4 b = u_blobShape1[i];
  return length(p - a.xy) <= (a.z * (1.0 + b.y + b.z + b.w) + u_blobSoft) * sqrt(b.x);
}

// Share of full ink at p inside blob i, where the outline distance is d: none in the black rim, full deep in,
// and deeper on the light side.
float blobDensity(int i, vec2 p, float d) {
  vec4 a = u_blobShape0[i];
  float lit = dot(p - a.xy, BLOB_LIGHT_DIR) / a.z;
  float depth = max(-d, 0.0) / a.z + BLOB_LIGHT_SHIFT * lit;
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

// p: pattern coords (the shapes); comp: composition coords, which the stipple follows so a warp bends the shapes, not the dots.
vec3 blobsColor(vec2 p, vec2 comp) {
  vec3 rgb = vec3(0.0);
  float remaining = 1.0;
  // Front to back: each blob takes its share of what the ones above left uncovered.
  for (int k = 0; k < MAX_BLOBS; k++) {
    int i = u_blobCount - 1 - k;
    if (i < 0 || remaining <= 0.001) break;
    if (!blobReaches(i, p)) continue;
    float d = blobDist(i, p);
    float cover = 1.0 - smoothstep(-u_blobSoft, u_blobSoft, d);
    if (cover <= 0.0) continue;
    float density = blobDensity(i, p, d);
    vec3 color = blobColor(int(u_blobShape2[i].w), density, comp);
    rgb += remaining * cover * color;
    remaining *= 1.0 - cover;
  }
  return rgb + remaining * u_blobBackground;
}

// Smooth dome height as a gray whose Oklab lightness is the height: what the lighting reads.
vec3 blobsHeight(vec2 p) {
  float height = 0.0;
  float remaining = 1.0;
  for (int k = 0; k < MAX_BLOBS; k++) {
    int i = u_blobCount - 1 - k;
    if (i < 0 || remaining <= 0.001) break;
    if (!blobReaches(i, p)) continue;
    float d = blobDist(i, p);
    float cover = 1.0 - smoothstep(-u_blobSoft, u_blobSoft, d);
    if (cover <= 0.0) continue;
    float inside = clamp(-d / (BLOB_DOME * u_blobShape0[i].z), 0.0, 1.0);
    height += remaining * cover * (1.0 - (1.0 - inside) * (1.0 - inside));
    remaining *= 1.0 - cover;
  }
  return vec3(height * height * height);
}
#endif
