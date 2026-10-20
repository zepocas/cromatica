#version 300 es
// PROTOTYPE (throwaway). Seeded smin-capsule blobs, one internal "layer" per ink.
// The user never sees layers: they are just how the engine would build the look.
precision highp float;
precision highp int;

#define MAXN 40

uniform highp usampler2D u_bn; // blue-noise ranks (R16UI), same data as the engine
uniform int u_bnMask;
uniform float u_bnCount;
uniform vec2 u_res;
uniform float u_seed;
uniform int u_count;
uniform float u_size;
uniform float u_elong;
uniform float u_smoothk;
uniform float u_warp;
uniform float u_depth;
uniform float u_contrast;
uniform float u_dot;
uniform float u_misreg;
uniform int u_variant; // 0 = A stipple, 1 = B solid + spray, 2 = C riso halftone
uniform vec3 u_ink[5];
uniform vec3 u_paper;

out vec4 o;

float h11(float n) { return fract(sin(n * 127.1 + u_seed * 311.7) * 43758.5453); }

float sdCap(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * t) - r;
}

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// Signed distance to the union of all capsules belonging to `ink`.
float field(int ink, vec2 p) {
  float aspect = u_res.x / u_res.y;
  float d = 1e3;
  for (int j = 0; j < MAXN; j++) {
    if (j >= u_count) break;
    if (j % 5 != ink) continue;
    float f = float(j);
    vec2 c = vec2((h11(f * 6.0 + 1.0) - 0.5) * aspect * 0.95, (h11(f * 6.0 + 2.0) - 0.5) * 0.9);
    float th = h11(f * 6.0 + 3.0) * 3.14159;
    float hl = u_size * (0.4 + u_elong * h11(f * 6.0 + 4.0));
    float r = u_size * (0.35 + 0.4 * h11(f * 6.0 + 5.0));
    vec2 dir = vec2(cos(th), sin(th));
    d = smin(d, sdCap(p, c - dir * hl, c + dir * hl, r), u_smoothk);
  }
  return d;
}

vec2 wobble(vec2 p) {
  vec2 w = vec2(sin(p.y * 6.0 + u_seed) + 0.5 * sin(p.y * 13.0 + p.x * 5.0),
                sin(p.x * 6.0 + 1.7 * u_seed) + 0.5 * sin(p.x * 11.0 - p.y * 7.0));
  return p + u_warp * 0.06 * w;
}

// Blue noise in (0,1); each ink reads at its own offset so inks interleave
// instead of sharing the same dots.
float bn(ivec2 cell, int ink) {
  ivec2 off = ivec2(ink * 37 + 11, ink * 53 + 5);
  return (float(texelFetch(u_bn, (cell + off) & u_bnMask, 0).r) + 0.5) / u_bnCount;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 p0 = (frag - 0.5 * u_res) / u_res.y;
  vec3 col = u_paper;

  if (u_variant == 2) {
    // C: riso. Misregistered plates, rotated halftone screens, multiply on paper.
    float ang[5] = float[5](0.26, 0.0, 1.31, 0.79, 0.52);
    for (int i = 0; i < 5; i++) {
      if (i == 1) continue; // white ink is invisible under multiply
      vec2 p = wobble(p0 + u_misreg * 0.01 * vec2(cos(float(i) * 2.4), sin(float(i) * 2.4)));
      float dens = smoothstep(0.0, 1.0, clamp(-field(i, p) / u_depth, 0.0, 1.0)) * u_contrast;
      float cs = cos(ang[i]), sn = sin(ang[i]);
      vec2 g = mat2(cs, -sn, sn, cs) * frag / (u_dot * 4.0);
      float on = step(length(fract(g) - 0.5), 0.72 * sqrt(clamp(dens, 0.0, 1.0)));
      col *= mix(vec3(1.0), u_ink[i], on);
    }
  } else {
    ivec2 cell = ivec2(floor(frag / u_dot));
    vec2 p = wobble(p0);
    for (int i = 0; i < 5; i++) {
      float d = field(i, p);
      float dens;
      if (u_variant == 0) {
        // A: dense core fading to a soft stippled edge.
        dens = pow(clamp(-d / u_depth, 0.0, 1.0), 0.7);
      } else {
        // B: solid silhouette with a sprayed halo outside.
        dens = d < 0.0 ? 1.0 : pow(clamp(1.0 - d / u_depth, 0.0, 1.0), 2.0);
      }
      if (dens * u_contrast > bn(cell, i)) col = u_ink[i];
    }
  }
  o = vec4(col, 1.0);
}
