import { noFinish, type Design } from '../design/design';
import { createRenderer } from '../engine/renderer';
import type { OutputSize, Renderer } from '../engine/types';
import type { PreviewLayout } from './layout';
import { describeDesign, type PerfSample } from './perf';

const IDLE_MS = 150;
const MIN_SCALE = 0.5;
/** Resolution steps while editing, in eighths, so the drawing buffer is not resized on every wobble in the timing. */
const SCALE_STEPS = 8;
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

/** Frame callbacks where the page has them; a worker without them draws on a timer. */
const requestFrame = (cb: () => void): number =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : (setTimeout(cb, 16) as unknown as number);
const cancelFrame = (id: number): void =>
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id);

export interface PreviewState {
  /** The full-resolution frame for the current design is on screen with nothing pending. */
  settled: boolean;
  /** The design's shader is still compiling; the last frame stays up meanwhile. */
  compiling: boolean;
}

export interface PreviewCoreOptions {
  /** Render at exactly this drawing-buffer size, ignoring the layout. */
  fixedSize?: OutputSize;
  onState?: (state: PreviewState) => void;
  /** Every drawn frame and every shader wait, for the ?perf recorder. */
  onSample?: (sample: PerfSample) => void;
}

export interface PreviewCore {
  setDesign(design: Design): void;
  setLayout(layout: PreviewLayout): void;
  setPaused(paused: boolean): void;
  /** Draw synchronously now, compiling on the spot if the shader is not ready. */
  renderNow(): void;
  /** Read back the last drawn frame (RGBA8, top-down). */
  readPixels(): Uint8Array;
  readonly state: PreviewState;
  readonly size: OutputSize;
  dispose(): void;
}

/**
 * The preview's drawing loop with no page in it: it sizes the buffer from a layout it is given, so it runs
 * the same on the main thread and in a worker (D91).
 */
export function createPreviewCore(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  gl: WebGL2RenderingContext,
  initialDesign: Design,
  opts: PreviewCoreOptions = {},
): PreviewCore {
  const events = canvas as EventTarget;
  let design = initialDesign;
  let layout: PreviewLayout | null = null;
  let renderer: Renderer | null = createRenderer(gl);
  let scale = 1;
  /** Cost of the last full-resolution frame, GPU included; Infinity until measured. */
  let fullFrameMs = Infinity;
  const syncPixel = new Uint8Array(4);
  let paused = false;
  let dirty = true;
  let frameId = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let sharpenPending = false;
  let disposed = false;
  const state: PreviewState = { settled: false, compiling: false };
  /** The design whose shader the driver is still compiling, and since when; only kept for ?perf. */
  let shaderWait: { design: Design; since: number } | null = null;

  function publish(next: Partial<PreviewState>): void {
    if ((next.settled ?? state.settled) === state.settled && (next.compiling ?? state.compiling) === state.compiling) {
      return;
    }
    Object.assign(state, next);
    opts.onState?.({ ...state });
  }

  function applyLayout(): void {
    if (opts.fixedSize) {
      canvas.width = opts.fixedSize.width;
      canvas.height = opts.fixedSize.height;
      return;
    }
    if (!layout) return;
    const dpr = layout.dpr * scale;
    const w = Math.max(1, Math.round(layout.cssWidth * dpr));
    // Stretched, the picture keeps its own shape in the buffer and the browser bends it.
    const h = Math.max(
      1,
      Math.round((layout.displayAspect ? layout.cssWidth / layout.aspect : layout.cssHeight) * dpr),
    );
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }

  /**
   * Draws the design, or returns false when its shader is still compiling: the last frame stays on screen
   * and the caller tries again. `wait` draws regardless, blocking on the compile.
   */
  function draw(wait = false): boolean {
    if (!renderer || gl.isContextLost()) return true;
    const compiledBefore = renderer.compiled;
    if (!wait && !renderer.ready(design)) {
      publish({ compiling: true });
      if (opts.onSample && shaderWait?.design !== design) shaderWait = { design, since: performance.now() };
      return false;
    }
    const waited = opts.onSample && shaderWait?.design === design ? performance.now() - shaderWait.since : null;
    if (waited !== null) opts.onSample?.({ label: describeDesign(design), ms: waited, compiled: true });
    shaderWait = null;
    applyLayout();
    const output = { width: canvas.width, height: canvas.height };
    const t0 = performance.now();
    renderer.render(design, output, { x: 0, y: 0, ...output }, { dither: true });
    // A 1-pixel read waits for the GPU, so the time covers the whole frame. Cost follows the pixel
    // count, so a reduced frame still says what a full one would cost.
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPixel);
    const compiled = renderer.compiled !== compiledBefore;
    opts.onSample?.({
      label: describeDesign(design),
      ms: performance.now() - t0,
      compiled: compiled && waited === null,
    });
    // A frame that compiled a shader says nothing about the cost of drawing.
    if (!compiled) {
      const full = (performance.now() - t0) / (scale * scale);
      fullFrameMs = Number.isFinite(fullFrameMs) ? fullFrameMs + COST_SMOOTHING * (full - fullFrameMs) : full;
    }
    dirty = false;
    publish({ compiling: false, settled: scale === 1 && !sharpenPending });
    return true;
  }

  function schedule(): void {
    dirty = true;
    publish({ settled: false });
    if (frameId || paused || disposed) return;
    frameId = requestFrame(() => {
      frameId = 0;
      if (dirty && !paused && !draw()) schedule();
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
  events.addEventListener('webglcontextlost', onLost);
  events.addEventListener('webglcontextrestored', onRestored);

  schedule();

  return {
    setDesign(next) {
      if (next === design) return;
      // Edits to the noise, and any edit while a noise is on, stay at full resolution.
      const keepFull = withoutTextures(next) === withoutTextures(design) || hasTexture(next);
      design = next;
      interact(keepFull);
    },
    setLayout(next) {
      if (layout && JSON.stringify(next) === JSON.stringify(layout)) return;
      layout = next;
      schedule();
    },
    setPaused(next) {
      paused = next;
      if (!paused && dirty) schedule();
    },
    renderNow() {
      draw(true);
    },
    readPixels() {
      if (!renderer) throw new Error('WebGL context lost');
      draw(true);
      return renderer.readPixels(canvas.width, canvas.height);
    },
    get state() {
      return { ...state };
    },
    get size() {
      return { width: canvas.width, height: canvas.height };
    },
    dispose() {
      disposed = true;
      cancelFrame(frameId);
      clearTimeout(idleTimer);
      events.removeEventListener('webglcontextlost', onLost);
      events.removeEventListener('webglcontextrestored', onRestored);
      renderer?.dispose();
      renderer = null;
    },
  };
}
