import type { Design } from '../design/design';
import { createPerfLog, perfEnabled } from './perf';
import type { FromPreviewWorker, ToPreviewWorker } from './preview-messages';
import { createFrameLayout, createPreview, showState, type PreviewHandle, type PreviewOptions } from './preview';

export interface AutoPreviewOptions extends PreviewOptions {
  /** A failure after the preview was created: the worker could not start WebGL, or a shader failed. */
  onError?: (message: string) => void;
}

/** Whether the preview can draw in a worker: `?mainthread` opts out, and a probe checks WebGL2 on an OffscreenCanvas. */
function workerPreviewSupported(canvas: HTMLCanvasElement, opts: PreviewOptions): boolean {
  if (opts.fixedSize || new URLSearchParams(location.search).has('mainthread')) return false;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return false;
  if (!('transferControlToOffscreen' in canvas)) return false;
  try {
    const probe = new OffscreenCanvas(1, 1).getContext('webgl2');
    probe?.getExtension('WEBGL_lose_context')?.loseContext();
    return probe !== null;
  } catch {
    return false;
  }
}

/** The design as a message can carry it; a reactive proxy cannot be cloned, but a design is plain JSON. */
function post(worker: Worker, msg: ToPreviewWorker, transfer: Transferable[] = []): void {
  try {
    worker.postMessage(msg, transfer);
  } catch {
    if (msg.type !== 'design' && msg.type !== 'init') throw new Error('The preview message could not be sent');
    worker.postMessage({ ...msg, design: JSON.parse(JSON.stringify(msg.design)) }, transfer);
  }
}

/**
 * The preview with its WebGL in a worker, so a shader compile (seconds on some Windows drivers) stalls the
 * worker and not the page (D93). The page keeps measuring the frame and sizing the canvas; the worker draws.
 */
function createWorkerPreview(
  canvas: HTMLCanvasElement,
  initialDesign: Design,
  opts: AutoPreviewOptions,
): PreviewHandle {
  const frame = createFrameLayout(canvas, opts);
  const worker = new Worker(new URL('./preview.worker.ts', import.meta.url), { type: 'module' });
  let seq = 0;
  let info = '';
  let size = '';
  const perf = perfEnabled ? createPerfLog(() => `${info}\n${size}`) : null;
  let lastLayout = '';

  /** Marks the frame unsettled until the worker has answered for this message. */
  const next = () => {
    canvas.dataset.settled = 'false';
    return ++seq;
  };

  worker.addEventListener('message', (e: MessageEvent<FromPreviewWorker>) => {
    const m = e.data;
    if (m.type === 'ready') info = m.renderer;
    else if (m.type === 'sample') {
      size = `${m.width}x${m.height}`;
      perf?.record(m.sample);
    } else if (m.type === 'state') {
      // An unsettled reply is always true to tell; a settled one only if nothing newer was sent since.
      if (!m.settled || m.seq === seq)
        showState(canvas, { settled: m.settled && m.seq === seq, compiling: m.compiling });
    } else {
      console.error(m.message);
      opts.onError?.(m.message);
    }
  });
  worker.addEventListener('error', (e) => {
    console.error(e.message);
    opts.onError?.(e.message);
  });

  function sync(): void {
    const layout = frame.measure();
    if (!layout) return;
    const text = JSON.stringify(layout);
    if (text === lastLayout) return;
    lastLayout = text;
    post(worker, { type: 'layout', layout, seq: next() });
  }

  const offscreen = canvas.transferControlToOffscreen();
  const first = frame.measure();
  lastLayout = JSON.stringify(first);
  showState(canvas, { settled: false, compiling: false });
  post(
    worker,
    { type: 'init', canvas: offscreen, design: initialDesign, layout: first, perf: perfEnabled, seq: next() },
    [offscreen],
  );

  const resizeObserver = new ResizeObserver(sync);
  if (frame.container) resizeObserver.observe(frame.container);

  // Same test hook as the main-thread preview: take the context away and give it back.
  const onDebug = (e: Event) =>
    post(worker, { type: 'debug', action: (e as CustomEvent<'loseContext' | 'restoreContext'>).detail });
  canvas.addEventListener('preview-debug', onDebug);

  return {
    setDesign(design) {
      sync();
      post(worker, { type: 'design', design, seq: next() });
    },
    setAspect(aspect) {
      if (frame.setAspect(aspect)) sync();
    },
    setDisplayAspect(aspect) {
      if (frame.setDisplayAspect(aspect)) sync();
    },
    setPaused(paused) {
      post(worker, { type: 'paused', paused, seq: next() });
    },
    dispose() {
      resizeObserver.disconnect();
      canvas.removeEventListener('preview-debug', onDebug);
      worker.terminate();
    },
  };
}

/** The preview the page uses: in a worker where the browser can, else on the main thread. */
export function createAutoPreview(
  canvas: HTMLCanvasElement,
  initialDesign: Design,
  opts: AutoPreviewOptions = {},
): PreviewHandle {
  return workerPreviewSupported(canvas, opts)
    ? createWorkerPreview(canvas, initialDesign, opts)
    : createPreview(canvas, initialDesign, opts);
}
