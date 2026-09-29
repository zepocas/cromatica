import type { Design } from '../design/design';

/** Full output image size in pixels. */
export interface OutputSize {
  width: number;
  height: number;
}

/**
 * A pixel rectangle inside the output image. Origin is the TOP-LEFT of the
 * output image; x grows right, y grows down (image/PNG convention).
 */
export interface Tile {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Composition-space convention (see docs/DECISIONS.md D2, D4):
 * - Image height is 1 unit; origin at the image center; +y is UP.
 * - For output pixel (px, py) (top-left origin, pixel centers at +0.5):
 *     u = (px + 0.5 - width / 2) / height
 *     v = (height / 2 - (py + 0.5)) / height
 * - The rendered value of a pixel depends only on (design, output size, px, py),
 *   never on which tile it was rendered in.
 */
export interface Renderer {
  /**
   * Draw `tile` of an image of size `output` into the default framebuffer of
   * the renderer's context. The caller must have sized the drawing buffer to
   * exactly tile.width × tile.height. The renderer sets viewport itself.
   */
  render(design: Design, output: OutputSize, tile: Tile): void;
  /**
   * Read back what was just drawn, as tightly packed RGBA8, rows TOP-DOWN
   * (already flipped from GL's bottom-up order). Length = w*h*4.
   */
  readPixels(width: number, height: number): Uint8Array;
  dispose(): void;
}

/**
 * Implemented in src/engine/renderer.ts:
 *   export function createRenderer(gl: WebGL2RenderingContext): Renderer
 * Context must be created with { alpha: false, premultipliedAlpha: false,
 * antialias: false, preserveDrawingBuffer: true } — use CONTEXT_ATTRIBUTES.
 */
export const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  premultipliedAlpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
};
