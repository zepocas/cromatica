// Print texture (D35): lithograph to xerox. Per OUTPUT pixel (D4 exception,
// like grain), on sRGB-encoded values before grain and dither. Each channel
// is reduced to a few tones by thresholding against a fibrous paper-tooth
// noise (stochastic screening), with toner specks and uneven darkening toward
// the frame edges. See src/engine/finish.ts for the parameter mapping.

uniform float u_printMix;     // 0 = off (exact passthrough)
uniform float u_printInk;     // how strongly the paper tooth modulates the ink (litho)
uniform float u_printScreen;  // how much of the thresholded, few-tone screen is mixed in (xerox)
uniform float u_printLevels;  // tones per channel of the screen
uniform float u_printSpeckle; // fraction of pixels with a toner speck
uniform float u_printEdge;    // darkening at the frame edges

const uint PRINT_KEY = 0xBB67AE85u;

// Smooth value noise over output pixels, [0, 1).
float printNoise(vec2 q, uint key) {
  vec2 i = floor(q);
  vec2 f = q - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  ivec2 c = ivec2(i);
  float a = hash1(c, key);
  float b = hash1(c + ivec2(1, 0), key);
  float d = hash1(c + ivec2(0, 1), key);
  float e = hash1(c + ivec2(1, 1), key);
  return mix(mix(a, b, u.x), mix(d, e, u.x), u.y);
}

// Paper tooth, roughly uniform in [0, 1): two layers of fibers at different
// angles (stretched value noise) over a fine tooth.
float paperTooth(ivec2 px) {
  vec2 p = vec2(px);
  float fibers = printNoise(p * vec2(0.4, 0.14), PRINT_KEY)
    + printNoise(mat2(0.8, 0.6, -0.6, 0.8) * p * vec2(0.4, 0.15), PRINT_KEY + 1u);
  float tooth = printNoise(p * 0.9, PRINT_KEY + 2u);
  float n = 0.15 * fibers + 0.7 * tooth;
  // Stretch the clustered sum toward uniform, so every tone gets its share.
  return clamp((n - 0.5) * 2.4 + 0.5, 0.0, 0.999);
}

vec3 printTexture(vec3 e, ivec2 px, vec2 comp) {
  float tooth = paperTooth(px);
  // Litho: the tooth modulates how much ink lands (ink = 1 - e), so bare paper
  // stays white and inked areas get an even texture.
  vec3 ink = clamp((1.0 - e) * (1.0 + u_printInk * (tooth - 0.5) * 2.0), 0.0, 1.0);
  vec3 printed = 1.0 - ink;
  // Xerox: lightness in a few tones by thresholding against the tooth, the
  // color rescaled to it, so hue holds and the grain is light and dark, not
  // colored. Black and white stay exact.
  float levels = u_printLevels - 1.0;
  float y = dot(e, vec3(0.2126, 0.7152, 0.0722));
  float yq = min(floor(y * levels + tooth) / levels, 1.0);
  vec3 screen = clamp(e * (yq / max(y, 1e-4)), 0.0, 1.0);
  printed = mix(printed, screen, u_printScreen);
  // Uneven darkening toward the frame edges, as on a copier.
  vec2 halfFrame = vec2(0.5 * float(u_outputSize.x) / float(u_outputSize.y), 0.5);
  float edge = max(abs(comp.x) / halfFrame.x, abs(comp.y) / halfFrame.y);
  float uneven = 0.6 + 0.4 * printNoise(vec2(px) * 0.01, PRINT_KEY + 3u);
  printed *= 1.0 - u_printEdge * uneven * smoothstep(0.8, 1.0, edge);
  // Toner specks.
  if (hash1(px, PRINT_KEY + 4u) < u_printSpeckle) printed *= 0.2;
  return mix(e, printed, u_printMix);
}
