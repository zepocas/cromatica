import type { ExportOptions, ExportProgress, ExportRequest } from './types';

/** Main → worker. */
export interface StartMessage {
  type: 'start';
  req: ExportRequest;
}

/** Worker → main. */
export type WorkerMessage =
  ({ type: 'progress' } & ExportProgress) | { type: 'done'; blob: Blob } | { type: 'error'; message: string };

function abortError(): DOMException {
  return new DOMException('Export aborted', 'AbortError');
}

/**
 * Render and encode `req` in a worker (D3), tile by tile. Rejects with a
 * DOMException 'AbortError' when opts.signal aborts.
 */
export function exportImage(req: ExportRequest, opts: ExportOptions = {}): Promise<Blob> {
  const { onProgress, signal } = opts;
  if (signal?.aborted) return Promise.reject(abortError());

  return new Promise<Blob>((resolve, reject) => {
    const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      fn();
    };

    function onAbort() {
      finish(() => reject(abortError()));
    }
    signal?.addEventListener('abort', onAbort);

    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        if (!settled) onProgress?.({ tilesDone: msg.tilesDone, tilesTotal: msg.tilesTotal });
      } else if (msg.type === 'done') {
        finish(() => resolve(msg.blob));
      } else {
        finish(() => reject(new Error(`Export failed: ${msg.message}`)));
      }
    };
    // Fires for uncaught errors, including failure to load the worker module.
    worker.onerror = (e: ErrorEvent) => {
      e.preventDefault();
      finish(() => reject(new Error(`Export worker error: ${e.message || 'failed to load or crashed'}`)));
    };
    worker.onmessageerror = () => {
      finish(() => reject(new Error('Export worker sent an unreadable message')));
    };

    const start: StartMessage = { type: 'start', req };
    worker.postMessage(start);
  });
}
