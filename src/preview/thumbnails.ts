import type { Design } from '../design/design';
import { createRenderer } from '../engine/renderer';
import { CONTEXT_ATTRIBUTES, type Renderer } from '../engine/types';

/**
 * Small renders of designs into 2D canvases, from one shared offscreen WebGL
 * context. One thumbnail is drawn per animation frame, so a grid of them never
 * holds up the main preview or a drag.
 */
export interface Thumbnails {
  /** Draw `design` into `target` at its drawing-buffer size, replacing any pending draw for it. */
  draw(target: HTMLCanvasElement, design: Design): void;
  /** Drop the pending draw for `target`, if any. */
  cancel(target: HTMLCanvasElement): void;
  dispose(): void;
}

export function createThumbnails(): Thumbnails {
  const canvas = new OffscreenCanvas(1, 1);
  const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
  if (!gl) throw new Error('WebGL2 is not available');
  let renderer: Renderer | null = createRenderer(gl);
  // Insertion order is draw order; a redraw request moves to the back.
  const pending = new Map<HTMLCanvasElement, Design>();
  let frame = 0;

  function drawNext() {
    frame = 0;
    const next = pending.entries().next();
    if (next.done || !renderer) return;
    const [target, design] = next.value;
    pending.delete(target);
    const output = { width: target.width, height: target.height };
    if (output.width > 0 && output.height > 0 && target.isConnected) {
      canvas.width = output.width;
      canvas.height = output.height;
      renderer.render(design, output, { x: 0, y: 0, ...output }, { dither: true });
      target.getContext('2d')?.drawImage(canvas, 0, 0);
    }
    schedule();
  }

  function schedule() {
    if (!frame && pending.size > 0) frame = requestAnimationFrame(drawNext);
  }

  return {
    draw(target, design) {
      pending.delete(target);
      pending.set(target, design);
      schedule();
    },
    cancel(target) {
      pending.delete(target);
    },
    dispose() {
      cancelAnimationFrame(frame);
      pending.clear();
      renderer?.dispose();
      renderer = null;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

let shared: Thumbnails | null = null;

/** The app's one thumbnail renderer, created on first use. */
export function thumbnails(): Thumbnails {
  shared ??= createThumbnails();
  return shared;
}
