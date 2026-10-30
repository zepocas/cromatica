#if BASE_GRID
// Grid mesh (D43): pull the pixel back onto the rest grid by Newton steps on
// F(q) = q + D(q), then blend the node colors there. Same math as
// src/engine/grid.ts (Catmull-Rom in both directions, clamped indices). Nodes are in the
// padded layout of padNodes, so the clamps are already in the data.

uniform ivec2 u_gridSize;                       // cols, rows
uniform vec2 u_gridRest;                        // rest half width, half height
uniform vec2 u_gridOffset[PADDED_GRID_NODES];   // node offset from its rest spot
uniform vec3 u_gridColor[PADDED_GRID_NODES];    // Oklab, gamut-mapped on the CPU
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

// Padded index of node (cell - 1) in each axis, the first of the cell's 4x4 neighbourhood.
int gridCorner(int cx, int cy) {
  return cy * GRID_STRIDE + cx;
}

// The 4x4 sums are written as matrix products, with no loop and no vector indexed by a loop counter: on D3D,
// ANGLE turns each such index into a switch, which only vanishes if the compiler unrolls every loop (#98).
mat4x2 gridOffsetRow(int i) {
  return mat4x2(u_gridOffset[i], u_gridOffset[i + 1], u_gridOffset[i + 2], u_gridOffset[i + 3]);
}

mat4x3 gridColorRow(int i) {
  return mat4x3(u_gridColor[i], u_gridColor[i + 1], u_gridColor[i + 2], u_gridColor[i + 3]);
}

// Offset D(q) in .xy; Jacobian columns in jx (d/dx) and jy (d/dy). The weights are separable, so each row
// is summed once along x and then weighted along y.
vec2 gridOffset(vec2 q, out vec2 jx, out vec2 jy) {
  int cx, cy;
  float fx, fy, sx, sy;
  gridAxis(q.x, u_gridRest.x, u_gridSize.x, cx, fx, sx);
  gridAxis(q.y, u_gridRest.y, u_gridSize.y, cy, fy, sy);
  vec4 wx, dx, wy, dy;
  gridWeights(fx, wx, dx);
  gridWeights(fy, wy, dy);
  int base = gridCorner(cx, cy);
  mat4x2 r0 = gridOffsetRow(base);
  mat4x2 r1 = gridOffsetRow(base + GRID_STRIDE);
  mat4x2 r2 = gridOffsetRow(base + 2 * GRID_STRIDE);
  mat4x2 r3 = gridOffsetRow(base + 3 * GRID_STRIDE);
  mat4x2 rw = mat4x2(r0 * wx, r1 * wx, r2 * wx, r3 * wx);
  mat4x2 rd = mat4x2(r0 * dx, r1 * dx, r2 * dx, r3 * dx);
  jx = sx * (rd * wy);
  jy = sy * (rw * dy);
  return rw * wy;
}

// Rest-grid point q with F(q) = p, by Newton steps. jx, jy: the Jacobian of the last step, which the
// lines use as the one at q (the last step moves q by far less than a pixel).
vec2 gridPull(vec2 p, out vec2 jx, out vec2 jy) {
  vec2 q = p;
  for (int k = 0; k < GRID_STEPS; k++) {
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
  return q;
}

// p: the warped point, for the colors; pl: where the lines are drawn (part-way back to the unwarped point).
vec3 gridColor(vec2 p, vec2 pl) {
  vec2 jx, jy;
  vec2 q = gridPull(p, jx, jy);
  int cx, cy;
  float fx, fy, sx, sy;
  gridAxis(q.x, u_gridRest.x, u_gridSize.x, cx, fx, sx);
  gridAxis(q.y, u_gridRest.y, u_gridSize.y, cy, fy, sy);
  vec4 wx, dx, wy, dy;
  gridWeights(fx, wx, dx);
  gridWeights(fy, wy, dy);
  int base = gridCorner(cx, cy);
  vec3 lab = mat4x3(
    gridColorRow(base) * wx,
    gridColorRow(base + GRID_STRIDE) * wx,
    gridColorRow(base + 2 * GRID_STRIDE) * wx,
    gridColorRow(base + 3 * GRID_STRIDE) * wx
  ) * wy;
  if (u_gridLines > 0.0) {
    // Distance to the nearest grid line in pattern units: its distance in grid
    // parameters over the pixel gradient of that parameter (inverse Jacobian).
    vec2 ql = q;
#ifdef WARP_ANY
    // Without a warp pl == p, but only at run time: the compiler would keep a second, unused pull.
    if (pl != p) ql = gridPull(pl, jx, jy);
#endif
    float a = 1.0 + jx.x;
    float b = jy.x;
    float c = jx.y;
    float d = 1.0 + jy.y;
    float det = a * d - b * c;
    if (abs(det) >= GRID_MIN_DET) {
      vec2 k = vec2(u_gridSize - 1);
      vec2 g = (ql + u_gridRest) / (2.0 * u_gridRest) * k;
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
