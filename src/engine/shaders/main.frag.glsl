out vec4 fragColor;

void main() {
  vec2 uv = compositionCoord(outputPixel());
  float t = linearGradientT(uv);
  fragColor = vec4(stopColor(t), 1.0);
}
