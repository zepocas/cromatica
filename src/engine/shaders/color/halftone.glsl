#ifdef HALFTONE
// Halftone (M8): ink or paper per pixel on a 45° screen, dots in image units.
// Must match src/engine/halftone.ts.

uniform float u_halftoneContrast;                  // ink/paper contrast
uniform float u_halftoneTable[HALFTONE_LUT_SIZE];  // ink share → threshold on the spot function

const float HALFTONE_TAU = 6.283185307179586;

float halftoneInk(float cover, vec2 comp) {
  if (cover <= 0.0 || cover >= 1.0) return cover;
  float x = cover * float(HALFTONE_LUT_SIZE - 1);
  int i = min(HALFTONE_LUT_SIZE - 2, int(floor(x)));
  float threshold = mix(u_halftoneTable[i], u_halftoneTable[i + 1], x - float(i));
  vec2 q = vec2(comp.x + comp.y, comp.y - comp.x) * 0.7071067811865476 / HALFTONE_CELL;
  float spot = 0.5 - 0.25 * (cos(HALFTONE_TAU * q.x) + cos(HALFTONE_TAU * q.y));
  float slope = 0.25 * HALFTONE_TAU * length(vec2(sin(HALFTONE_TAU * q.x), sin(HALFTONE_TAU * q.y)));
  // Anti-aliased over one pixel; the width stays above 0 where the dot edge is flat.
  float w = max(0.5 / (float(u_outputSize.y) * HALFTONE_CELL) * slope, 1e-4);
  return 1.0 - smoothstep(threshold - w, threshold + w, spot);
}

vec3 halftone(vec3 rgb, vec2 comp) {
  vec3 lab = linearSrgbToOklab(max(rgb, vec3(0.0)));
  float k = u_halftoneContrast;
  vec3 ink = vec3(lab.x * (1.0 - k), lab.yz * (1.0 + INK_CHROMA * k));
  vec3 paper = vec3(lab.x + k * (1.0 - lab.x), lab.yz * (1.0 - PAPER_FADE * k));
  // The eye mixes ink and paper in linear light; for these colors Y ≈ L³.
  float paperY = paper.x * paper.x * paper.x;
  float inkY = ink.x * ink.x * ink.x;
  float cover = paperY > inkY ? (paperY - lab.x * lab.x * lab.x) / (paperY - inkY) : 0.0;
  float t = halftoneInk(clamp(cover, 0.0, 1.0), comp);
  // Edge pixels mix in linear light too.
  return mix(oklabToLinearSrgb(paper), oklabToLinearSrgb(ink), t);
}
#endif
