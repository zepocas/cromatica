import { type Design } from '../design/design';
import { CONTEXT_ATTRIBUTES, type OutputSize } from '../engine/types';
import { createPreviewCore, editingScale, type PreviewState } from './core';
import { fitFrame, MAX_DPR } from './layout';
import { createPerfLog, describeRenderer, perfEnabled } from './perf';

export { editingScale };

export interface PreviewOptions {
  /** Element whose box the canvas is letterboxed into. Defaults to the canvas parent. */
  container?: HTMLElement;
  /** Width / height of the frame. Default 16 / 9. */
  aspect?: number;
  /** Render at exactly this drawing-buffer size, ignoring layout and DPR. */
  fixedSize?: OutputSize;
}

/** What the page needs from a preview, wherever its drawing runs. */
export interface PreviewHandle {
  setDesign(design: Design): void;
  setAspect(aspect: number): void;
  /** Show the frame at this shape instead, stretching the picture to it; null shows it as drawn. Screen only. */
  setDisplayAspect(aspect: number | null): void;
  /** Stop drawing while paused (e.g. during an export); resumes with one redraw. */
  setPaused(paused: boolean): void;
  dispose(): void;
}

export interface PreviewController extends PreviewHandle {
  /** Draw synchronously now at the current drawing-buffer size. */
  renderNow(): void;
  /** Read back the last drawn frame (RGBA8, top-down). */
  readPixels(): Uint8Array;
  readonly size: OutputSize;
}

/** The data-settled and data-compiling attributes tests and the page wait on. */
export function showState(canvas: HTMLCanvasElement, state: PreviewState): void {
  canvas.dataset.settled = String(state.settled);
  canvas.dataset.compiling = String(state.compiling);
}

/** Measures the frame the canvas is shown in; shared by the main-thread and worker previews. */
export function createFrameLayout(canvas: HTMLCanvasElement, opts: PreviewOptions) {
  const container = opts.container ?? canvas.parentElement;
  let aspect = opts.aspect ?? 16 / 9;
  let displayAspect: number | null = null;
  return {
    container,
    setAspect: (next: number) => {
      if (!(next > 0) || next === aspect) return false;
      aspect = next;
      return true;
    },
    setDisplayAspect: (next: number | null) => {
      const shown = next && next > 0 ? next : null;
      if (shown === displayAspect) return false;
      displayAspect = shown;
      return true;
    },
    /** Sizes the canvas on the page and returns the layout for the drawing buffer; null while the container has no size. */
    measure() {
      if (!container) return null;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return null;
      const { cssWidth, cssHeight } = fitFrame(cw, ch, aspect, displayAspect);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      return { cssWidth, cssHeight, dpr: Math.min(window.devicePixelRatio || 1, MAX_DPR), aspect, displayAspect };
    },
  };
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

  const perf = perfEnabled ? createPerfLog(() => `${describeRenderer(gl)}\n${canvas.width}x${canvas.height}`) : null;
  const core = createPreviewCore(canvas, gl, initialDesign, {
    fixedSize: opts.fixedSize,
    onState: (state) => showState(canvas, state),
    onSample: perf?.record,
  });
  showState(canvas, core.state);
  const frame = createFrameLayout(canvas, opts);

  function sync(): void {
    if (opts.fixedSize) return;
    const layout = frame.measure();
    if (layout) core.setLayout(layout);
  }

  const resizeObserver = new ResizeObserver(sync);
  if (frame.container && !opts.fixedSize) resizeObserver.observe(frame.container);
  sync();

  // Lets a test take the context away and give it back (the canvas has no other way in once it is drawn on).
  const loseContext = gl.getExtension('WEBGL_lose_context');
  const onDebug = (e: Event) => loseContext?.[(e as CustomEvent<'loseContext' | 'restoreContext'>).detail]();
  canvas.addEventListener('preview-debug', onDebug);

  return {
    setDesign(next) {
      sync();
      core.setDesign(next);
    },
    setAspect(next) {
      if (frame.setAspect(next)) sync();
    },
    setDisplayAspect(next) {
      if (frame.setDisplayAspect(next)) sync();
    },
    setPaused: core.setPaused,
    renderNow: core.renderNow,
    readPixels: core.readPixels,
    get size() {
      return core.size;
    },
    dispose() {
      resizeObserver.disconnect();
      canvas.removeEventListener('preview-debug', onDebug);
      core.dispose();
    },
  };
}
