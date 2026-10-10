import { noFinish, type Design } from '../design/design';
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
const MIN_SCALE = 0.5;
/** Resolution steps while editing, in eighths, so the drawing buffer is not resized on every wobble in the timing. */
const SCALE_STEPS = 8;
const MAX_DPR = 2;
/**
 * Full-resolution frames cheaper than this stay at full resolution while
 * editing. Dropping resolution changes how noise looks (it is per output
 * pixel), so it is only worth it on GPUs that can't keep up.
 */
const FRAME_BUDGET_MS = 20;
/** The frame time the reduced resolution aims for; cost grows with the pixel count, so scale = sqrt(target / cost). */
const TARGET_FRAME_MS = 16;
/** Weight of the newest timing in the running estimate of a full-resolution frame. */
const COST_SMOOTHING = 0.5;

/** The design without the fine texture (noise), to tell texture-only edits apart. */
function withoutTextures(d: Design): string {
  return JSON.stringify({ ...d, finish: d.finish && { ...d.finish, noise: noFinish.noise } });
}

/** A noise is on: its texture is per output pixel, so it must be drawn at full resolution to look the same as at rest. */
function hasTexture(d: Design): boolean {
  return (d.finish?.noise.amount ?? 0) > 0;
}

/** The resolution to edit at when a full-resolution frame costs `cost` ms: 1 when cheap enough, else down to MIN_SCALE. */
export function editingScale(cost: number): number {
  if (!(cost > FRAME_BUDGET_MS)) return 1;
  const ideal = Math.sqrt(TARGET_FRAME_MS / cost);
  return Math.min(1, Math.max(MIN_SCALE, Math.floor(ideal * SCALE_STEPS) / SCALE_STEPS));
}

export function createPreview(
  canvas: HTMLCanvasElement,
  initialDesign: Design,
  opts: PreviewOptions = {},
): PreviewController {
  // The preview never needs its buffer to survive compositing; skipping
  // preservation avoids a per-frame copy. readPixels() redraws first instead.
  const context = canvas.getContext('webgl2', { ...CONTEXT_ATTRIBUTES, preserveDrawingBuffer: false });
  if (!context) throw new Error('WebGL2 is not available');
  const gl: WebGL2RenderingContext = context;

  const container = opts.container ?? canvas.parentElement;
  let design = initialDesign;
  let aspect = opts.aspect ?? 16 / 9;
  let renderer: Renderer | null = createRenderer(gl);
  let scale = 1;
  /** Cost of the last full-resolution frame, GPU included; Infinity until measured. */
  let fullFrameMs = Infinity;
  const syncPixel = new Uint8Array(4);
  let paused = false;
  let dirty = true;
  let rafId = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let sharpenPending = false;
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
    if (!renderer || gl.isContextLost()) return;
    applyLayout();
    const output = { width: canvas.width, height: canvas.height };
    const t0 = performance.now();
    const compiledBefore = renderer.compiled;
    renderer.render(design, output, { x: 0, y: 0, ...output }, { dither: true });
    // A 1-pixel read waits for the GPU, so the time covers the whole frame. Cost follows the pixel
    // count, so a reduced frame still says what a full one would cost.
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPixel);
    // A frame that compiled a shader says nothing about the cost of drawing.
    if (renderer.compiled === compiledBefore) {
      const full = (performance.now() - t0) / (scale * scale);
      fullFrameMs = Number.isFinite(fullFrameMs) ? fullFrameMs + COST_SMOOTHING * (full - fullFrameMs) : full;
    }
    dirty = false;
    setSettled(scale === 1 && !sharpenPending);
  }

  /**
   * data-settled="true" once the full-resolution frame for the current design
   * is on screen with nothing pending; tests wait on it instead of sleeping.
   */
  function setSettled(settled: boolean): void {
    canvas.dataset.settled = String(settled);
  }

  function schedule(): void {
    dirty = true;
    setSettled(false);
    if (rafId || paused || disposed) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (dirty && !paused) draw();
    });
  }

  // On slow GPUs, drop the resolution (down to half, as far as the frame cost calls for) while changes
  // keep arriving; sharpen once idle. A noise on, or an edit to it, stays at full resolution: those
  // textures are a few pixels fine, so a reduced frame would show a different texture, then snap.
  function interact(keepFull: boolean): void {
    const reduced = opts.fixedSize || keepFull ? 1 : editingScale(fullFrameMs);
    if (keepFull && scale < 1) {
      // A frame is already waiting at the reduced resolution: draw it sharp instead.
      clearTimeout(idleTimer);
      sharpenPending = false;
      scale = 1;
    } else if (reduced < 1) {
      scale = reduced;
      clearTimeout(idleTimer);
      sharpenPending = true;
      idleTimer = setTimeout(() => {
        sharpenPending = false;
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
      // Edits to the noise, and any edit while a noise is on, stay at full resolution.
      const keepFull = withoutTextures(next) === withoutTextures(design) || hasTexture(next);
      design = next;
      interact(keepFull);
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
