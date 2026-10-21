import type { Design } from '../design/design';
import type { PreviewLayout } from './layout';
import type { PerfSample } from './perf';

/**
 * Every message that changes what the preview should show carries a `seq`, and the worker's `state`
 * replies echo the last one it has handled. The page marks the frame unsettled when it sends, and
 * believes a `settled: true` only if it is for the latest `seq`, so a late reply about an older design
 * cannot mark a newer one as drawn.
 */
export type ToPreviewWorker =
  | { type: 'init'; canvas: OffscreenCanvas; design: Design; layout: PreviewLayout | null; perf: boolean; seq: number }
  | { type: 'design'; design: Design; seq: number }
  | { type: 'layout'; layout: PreviewLayout; seq: number }
  | { type: 'paused'; paused: boolean; seq: number }
  | { type: 'debug'; action: 'loseContext' | 'restoreContext' };

export type FromPreviewWorker =
  | { type: 'ready'; renderer: string }
  | { type: 'state'; seq: number; settled: boolean; compiling: boolean }
  | { type: 'sample'; sample: PerfSample; width: number; height: number }
  | { type: 'error'; message: string };
