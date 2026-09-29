// Full-screen triangle from gl_VertexID; no vertex buffers needed.
// Vertices: (-1,-1), (3,-1), (-1,3).
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
