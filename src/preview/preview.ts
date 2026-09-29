import type { Design } from '../design/design';
import { createRenderer } from '../engine/renderer';
import { CONTEXT_ATTRIBUTES, type OutputSize, type Renderer } from '../engine/types';

export interface PreviewOptions {
  /** Element whose box the canvas is letterboxed into. Defaults to the canvas parent. */
  container?: HTMLElement;
  /** Width / height of the frame. Default 16 / 9. */
  aspect?: number;
  /**
   * Render at exactly this drawing-buffer size, ignoring layout and DPR
   * (tests, and later the 1:1 loupe).
   */
  fixedSize?: OutputSize;
}

export interface PreviewController {
  setDesign(design: Design): void;
  setAspect(aspect: number): void;
  /** Stop drawing while paused (e.g. during an export); resumes with one redraw. */
  setPaused(paused: boolean): void;
  /** Draw synchronously now at the current drawing-buffer size. */
  renderNow(): void;
  /** Read back the last drawn frame (RGBA8, top-down). */
  readPixels(): Uint8Array;
  readonly size: OutputSize;
  dispose(): void;
}

const IDLE_MS = 150;
const INTERACTIVE_SCALE = 0.5;
const MAX_DPR = 2;

export function createPreview(
  canvas: HTMLCanvasElement,
  initialDesign: Design,
  opts: PreviewOptions = {},
): PreviewController {
  // The preview never needs its buffer to survive compositing; skipping
  // preservation avoids a per-frame copy. readPixels() redraws first instead.
  const gl = canvas.getContext('webgl2', { ...CONTEXT_ATTRIBUTES, preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL2 is not available');

  const container = opts.container ?? canvas.parentElement;
  let design = initialDesign;
  let aspect = opts.aspect ?? 16 / 9;
  let renderer: Renderer | null = createRenderer(gl);
  let scale = 1;
  let paused = false;
  let dirty = true;
  let rafId = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  function applyLayout(): void {
    if (opts.fixedSize) {
      canvas.width = opts.fixedSize.width;
      canvas.height = opts.fixedSize.height;
      return;
    }
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0) return;
    // Letterbox: fit the export aspect inside the container.
    const cssW = cw / ch > aspect ? ch * aspect : cw;
    const cssH = cssW / aspect;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR) * scale;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }

  function draw(): void {
    if (!renderer || gl!.isContextLost()) return;
    applyLayout();
    const output = { width: canvas.width, height: canvas.height };
    renderer.render(design, output, { x: 0, y: 0, ...output });
    dirty = false;
  }

  function schedule(): void {
    dirty = true;
    if (rafId || paused || disposed) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (dirty && !paused) draw();
    });
  }

  // Drop to low resolution while changes keep arriving; sharpen once idle.
  function interact(): void {
    if (!opts.fixedSize) {
      scale = INTERACTIVE_SCALE;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        scale = 1;
        schedule();
      }, IDLE_MS);
    }
    schedule();
  }

  const onLost = (e: Event) => {
    e.preventDefault();
    renderer = null;
  };
  const onRestored = () => {
    renderer = createRenderer(gl);
    schedule();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  const resizeObserver = new ResizeObserver(() => schedule());
  if (container && !opts.fixedSize) resizeObserver.observe(container);

  schedule();

  return {
    setDesign(next) {
      if (next === design) return;
      design = next;
      interact();
    },
    setAspect(next) {
      if (next === aspect || !(next > 0)) return;
      aspect = next;
      schedule();
    },
    setPaused(next) {
      paused = next;
      if (!paused && dirty) schedule();
    },
    renderNow() {
      draw();
    },
    readPixels() {
      if (!renderer) throw new Error('WebGL context lost');
      draw();
      return renderer.readPixels(canvas.width, canvas.height);
    },
    get size() {
      return { width: canvas.width, height: canvas.height };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(idleTimer);
      resizeObserver.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      renderer?.dispose();
      renderer = null;
    },
  };
}
