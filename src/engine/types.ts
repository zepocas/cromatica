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
export interface RenderOptions {
  /**
   * Blue-noise TPDF dither (±1 LSB, D7) before 8-bit quantization; tests turn it off to compare
   * against exact references. Default true. Indexed by OUTPUT pixel, so it is tile-independent.
   */
  dither?: boolean;
  /**
   * Lighting reads the pattern 5 times (central differences) instead of 3 (D108): exports turn it on, the
   * preview keeps the faster reads. Default false.
   */
  preciseLighting?: boolean;
}

export interface Renderer {
  /**
   * Draw `tile` of an image of size `output` into the default framebuffer. The caller must have
   * sized the drawing buffer to exactly tile.width × tile.height. GL state must not be changed
   * between render() and readPixels().
   */
  render(design: Design, output: OutputSize, tile: Tile, opts?: RenderOptions): void;
  /**
   * Read back what was just drawn, as tightly packed RGBA8, rows TOP-DOWN
   * (already flipped from GL's bottom-up order). Length = w*h*4.
   */
  readPixels(width: number, height: number): Uint8Array;
  /**
   * Start compiling the shader this design needs and say whether it can be drawn without a stall. Call it
   * again later while it returns false. Always true where the browser can't compile in parallel.
   * render() works either way, but blocks on a shader that is not ready.
   */
  ready(design: Design): boolean;
  /** How many shader programs have been compiled so far; a frame that raises it paid for a compile. */
  readonly compiled: number;
  dispose(): void;
}

/** Attributes every renderer context is created with (createRenderer expects them). */
export const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  premultipliedAlpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
};
