import { CONTEXT_ATTRIBUTES } from '../engine/types';
import { createPreviewCore, type PreviewCore } from './core';
import { describeRenderer } from './perf';
import type { FromPreviewWorker, ToPreviewWorker } from './preview-messages';

let core: PreviewCore | null = null;
let loseContext: WEBGL_lose_context | null = null;
/** The `seq` of the last message handled, echoed in every state reply. */
let seq = 0;

function post(msg: FromPreviewWorker): void {
  self.postMessage(msg);
}

function init(m: Extract<ToPreviewWorker, { type: 'init' }>): void {
  const canvas = m.canvas;
  const gl = canvas.getContext('webgl2', { ...CONTEXT_ATTRIBUTES, preserveDrawingBuffer: false });
  if (!gl) {
    post({ type: 'error', message: 'WebGL2 is not available in the preview worker' });
    return;
  }
  loseContext = gl.getExtension('WEBGL_lose_context');
  core = createPreviewCore(canvas, gl, m.design, {
    onState: (state) => post({ type: 'state', seq, ...state }),
    onSample: m.perf
      ? (sample) => post({ type: 'sample', sample, width: canvas.width, height: canvas.height })
      : undefined,
  });
  post({ type: 'ready', renderer: describeRenderer(gl) });
  if (m.layout) core.setLayout(m.layout);
}

self.addEventListener('message', (e: MessageEvent<ToPreviewWorker>) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      seq = m.seq;
      init(m);
    } else if (m.type === 'debug') {
      loseContext?.[m.action]();
      return;
    } else if (core) {
      seq = m.seq;
      if (m.type === 'design') core.setDesign(m.design);
      else if (m.type === 'layout') core.setLayout(m.layout);
      else core.setPaused(m.paused);
    }
    // Answer every message, so a change that needs no redraw still lets the page settle.
    if (core) post({ type: 'state', seq, ...core.state });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});
