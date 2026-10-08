#if BASE_GRID
// Grid mesh (D43): pull the pixel back onto the rest grid by Newton steps on
// F(q) = q + D(q), then blend the node colors there. Same math as
// src/engine/grid.ts (Catmull-Rom in both directions, clamped indices).

uniform ivec2 u_gridSize;                     // cols, rows
uniform vec2 u_gridRest;                      // rest half width, half height
uniform vec2 u_gridOffset[MAX_GRID_NODES];    // node offset from its rest spot
uniform vec3 u_gridColor[MAX_GRID_NODES];     // Oklab, gamut-mapped on the CPU
uniform float u_gridLines;                  // lines along the bent grid, [0, 1]; 0 = none (D62)

void gridWeights(float f, out vec4 w, out vec4 d) {
  float f2 = f * f;
  float f3 = f2 * f;
  w = 0.5 * vec4(-f3 + 2.0 * f2 - f, 3.0 * f3 - 5.0 * f2 + 2.0, -3.0 * f3 + 4.0 * f2 + f, f3 - f2);
  d = 0.5 * vec4(-3.0 * f2 + 4.0 * f - 1.0, 9.0 * f2 - 10.0 * f, -9.0 * f2 + 8.0 * f + 1.0, 3.0 * f2 - 2.0 * f);
}

// Cell index, fraction and d(param)/d(coord) (0 where clamped) along one axis.
void gridAxis(float q, float halfSize, int n, out int cell, out float f, out float scale) {
  float k = float(n - 1);
  float raw = (q + halfSize) / (2.0 * halfSize) * k;
  float s = clamp(raw, 0.0, k);
  cell = min(n - 2, int(floor(s)));
  f = s - float(cell);
  scale = raw == s ? k / (2.0 * halfSize) : 0.0;
}

int gridNode(int r, int c) {
  return clamp(r, 0, u_gridSize.y - 1) * u_gridSize.x + clamp(c, 0, u_gridSize.x - 1);
}

// Offset D(q) in .xy; Jacobian columns in jx (d/dx) and jy (d/dy).
vec2 gridOffset(vec2 q, out vec2 jx, out vec2 jy) {
  int cx, cy;
  float fx, fy, sx, sy;
  gridAxis(q.x, u_gridRest.x, u_gridSize.x, cx, fx, sx);
  gridAxis(q.y, u_gridRest.y, u_gridSize.y, cy, fy, sy);
  vec4 wx, dx, wy, dy;
  gridWeights(fx, wx, dx);
  gridWeights(fy, wy, dy);
  vec2 o = vec2(0.0);
  jx = vec2(0.0);
  jy = vec2(0.0);
  for (int b = 0; b < 4; b++) {
    for (int a = 0; a < 4; a++) {
      vec2 off = u_gridOffset[gridNode(cy - 1 + b, cx - 1 + a)];
      o += wx[a] * wy[b] * off;
      jx += dx[a] * wy[b] * sx * off;
      jy += wx[a] * dy[b] * sy * off;
    }
  }
  return o;
}

vec3 gridColor(vec2 p) {
  vec2 q = p;
  for (int k = 0; k < GRID_STEPS; k++) {
    vec2 jx, jy;
    vec2 e = q + gridOffset(q, jx, jy) - p;
    float a = 1.0 + jx.x;
    float b = jy.x;
    float c = jx.y;
    float d = 1.0 + jy.y;
    float det = a * d - b * c;
    vec2 s = abs(det) > GRID_MIN_DET ? vec2(d * e.x - b * e.y, a * e.y - c * e.x) / det : e;
    float len = length(s);
    if (len > GRID_MAX_STEP) s *= GRID_MAX_STEP / len;
    q -= s;
  }
  int cx, cy;
  float fx, fy, sx, sy;
  gridAxis(q.x, u_gridRest.x, u_gridSize.x, cx, fx, sx);
  gridAxis(q.y, u_gridRest.y, u_gridSize.y, cy, fy, sy);
  vec4 wx, dx, wy, dy;
  gridWeights(fx, wx, dx);
  gridWeights(fy, wy, dy);
  vec3 lab = vec3(0.0);
  for (int b = 0; b < 4; b++) {
    for (int a = 0; a < 4; a++) {
      lab += wx[a] * wy[b] * u_gridColor[gridNode(cy - 1 + b, cx - 1 + a)];
    }
  }
  if (u_gridLines > 0.0) {
    // Distance to the nearest grid line in pattern units: its distance in grid
    // parameters over the pixel gradient of that parameter (inverse Jacobian).
    vec2 jx, jy;
    gridOffset(q, jx, jy);
    float a = 1.0 + jx.x;
    float b = jy.x;
    float c = jx.y;
    float d = 1.0 + jy.y;
    float det = a * d - b * c;
    if (abs(det) >= GRID_MIN_DET) {
      vec2 k = vec2(u_gridSize - 1);
      vec2 g = (q + u_gridRest) / (2.0 * u_gridRest) * k;
      vec2 grad = k / (2.0 * u_gridRest) * vec2(length(vec2(d, b)), length(vec2(c, a))) / abs(det);
      vec2 near = abs(g - clamp(floor(g + 0.5), vec2(0.0), k));
      float dist = min(near.x / grad.x, near.y / grad.y);
      float hwid = 0.5 * mix(GRID_LINE_WIDTH_MIN, GRID_LINE_WIDTH_MAX, u_gridLines);
      float pixel = 1.0 / float(u_outputSize.y);
      float line = 1.0 - smoothstep(hwid - pixel, hwid + pixel, dist);
      float dir = clamp((GRID_LINE_PIVOT - lab.x) * GRID_LINE_PIVOT_SLOPE, -1.0, 1.0);
      lab.x += GRID_LINE_PUSH * min(1.0, u_gridLines / GRID_LINE_OPACITY_AT) * line * dir;
    }
  }
  return lab;
}
#endif
