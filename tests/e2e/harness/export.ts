// Test harness: exposes window.harness for tests/e2e/export.spec.ts. All
// pixel comparisons happen in-page; only small summaries go back to Node.
import { decode } from 'fast-png';
import { defaultDesign, type Design, type WarpShape } from '../../../src/design/design';
import { createRenderer } from '../../../src/engine/renderer';
import { CONTEXT_ATTRIBUTES, type OutputSize } from '../../../src/engine/types';
import { exportImage } from '../../../src/export/exporter';
import type { ExportRequest } from '../../../src/export/types';
import { createPreview } from '../../../src/preview/preview';

export interface CompareSummary {
  width: number;
  height: number;
  channels: number;
  mismatches: number;
  firstMismatch: { x: number; y: number; got: number[]; want: number[] } | null;
  exportMs: number;
  referenceMs: number;
  tiles: number;
}

// A 4-stop design at an awkward angle so tile seams would show up; every
// blend mode and one out-of-sRGB color are exercised. Dither stays on (the
// default), so parity also proves the dither is tile-independent. Warp and
// grain are on too: both must be tile-independent as well.
const testDesign: Design = {
  engineVersion: 1,
  warp: { shape: 'waves', amount: 0.45, size: 0.4, seed: 7 },
  grain: { amount: 0.5, size: 0.6 },
  base: {
    kind: 'linear',
    angle: 37,
    stops: [
      { position: 0, color: [0.25, 0.12, 265], blend: 'oklab-chroma' },
      { position: 0.3, color: [0.68, 0.33, 350], blend: 'oklch-long' },
      { position: 0.7, color: [0.8, 0.2, 150], blend: 'oklch-short' },
      { position: 1, color: [0.88, 0.14, 80], blend: 'oklab' },
    ],
  },
};

// A mesh with a point outside the frame, an out-of-sRGB color and uneven
// radii, so tile seams, clipping and far-field blending would all show up.
const meshDesign: Design = {
  engineVersion: 1,
  warp: { shape: 'domain', amount: 0.5, size: 0.35, seed: 0x9e3779b9 },
  grain: { amount: 0.35, size: 0.2 },
  base: {
    kind: 'mesh',
    sharpness: 0.6,
    points: [
      { x: -0.6, y: 0.25, color: [0.3, 0.13, 272], radius: 0.45 },
      { x: 0.12, y: 0.3, color: [0.62, 0.3, 350], radius: 0.3 },
      { x: 0.75, y: 0.1, color: [0.8, 0.15, 60], radius: 0.4 },
      { x: -0.2, y: -0.33, color: [0.66, 0.11, 190], radius: 0.25 },
      { x: 1.1, y: -0.45, color: [0.93, 0.05, 90], radius: 0.5 },
    ],
  },
};

export type TestPattern = 'linear' | 'mesh';
const designs: Record<TestPattern, Design> = { linear: testDesign, mesh: meshDesign };

/** Single-pass reference: one tile covering the whole output. RGBA, top-down. */
function renderReference(design: Design, size: OutputSize): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
  if (!gl) throw new Error('WebGL2 unavailable');
  const renderer = createRenderer(gl);
  try {
    renderer.render(design, size, { x: 0, y: 0, ...size }, { dither: true });
    return renderer.readPixels(size.width, size.height);
  } finally {
    renderer.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** Compare decoded PNG pixels (RGB or RGBA) against an RGBA reference, RGB only. */
function compareRgb(
  png: { width: number; height: number; channels: number; data: ArrayLike<number> },
  ref: Uint8Array,
): Pick<CompareSummary, 'mismatches' | 'firstMismatch'> {
  const { width, height, channels, data } = png;
  let mismatches = 0;
  let firstMismatch: CompareSummary['firstMismatch'] = null;
  for (let i = 0, n = width * height; i < n; i++) {
    const s = i * channels;
    const r = i * 4;
    if (data[s] !== ref[r] || data[s + 1] !== ref[r + 1] || data[s + 2] !== ref[r + 2]) {
      if (!firstMismatch) {
        firstMismatch = {
          x: i % width,
          y: Math.floor(i / width),
          got: [data[s], data[s + 1], data[s + 2]],
          want: [ref[r], ref[r + 1], ref[r + 2]],
        };
      }
      mismatches++;
    }
  }
  return { mismatches, firstMismatch };
}

async function exportPng(design: Design, size: OutputSize, tileSize?: number) {
  let tiles = 0;
  const t0 = performance.now();
  const blob = await exportImage(
    { design, output: size, format: 'png', tileSize },
    { onProgress: (p) => (tiles = p.tilesTotal) },
  );
  const exportMs = performance.now() - t0;
  const png = decode(new Uint8Array(await blob.arrayBuffer()));
  return { blob, png, exportMs, tiles };
}

async function exportVsSinglePass(
  width: number,
  height: number,
  tileSize?: number,
  pattern: TestPattern = 'linear',
  warpShape?: WarpShape,
): Promise<CompareSummary> {
  const size = { width, height };
  const design = warpShape
    ? { ...designs[pattern], warp: { ...designs[pattern].warp, shape: warpShape } }
    : designs[pattern];
  const { png, exportMs, tiles } = await exportPng(design, size, tileSize);
  const t1 = performance.now();
  const ref = renderReference(design, size);
  const referenceMs = performance.now() - t1;
  return {
    width: png.width,
    height: png.height,
    channels: png.channels,
    ...compareRgb(png, ref),
    exportMs,
    referenceMs,
    tiles,
  };
}

async function previewVsExport(
  width: number,
  height: number,
  pattern: TestPattern = 'linear',
): Promise<CompareSummary> {
  const size = { width, height };
  const design = designs[pattern];
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const t1 = performance.now();
  const preview = createPreview(canvas, design, { fixedSize: size });
  let ref: Uint8Array;
  try {
    preview.renderNow();
    ref = preview.readPixels();
  } finally {
    preview.dispose();
    canvas.remove();
  }
  const referenceMs = performance.now() - t1;
  const { png, exportMs, tiles } = await exportPng(design, size);
  return {
    width: png.width,
    height: png.height,
    channels: png.channels,
    ...compareRgb(png, ref),
    exportMs,
    referenceMs,
    tiles,
  };
}

/** Export while watching main-thread responsiveness (rAF gaps + long tasks). */
async function responsiveness(width: number, height: number) {
  const longtasks: number[] = [];
  const observer = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) longtasks.push(e.duration);
  });
  observer.observe({ type: 'longtask', buffered: false });

  let maxGap = 0;
  let frames = 0;
  let last = 0;
  let running = true;
  const tick = (t: number) => {
    if (last) maxGap = Math.max(maxGap, t - last);
    last = t;
    frames++;
    if (running) requestAnimationFrame(tick);
  };
  // Let the loop settle before starting.
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  requestAnimationFrame(tick);

  const t0 = performance.now();
  const blob = await exportImage({ design: testDesign, output: { width, height }, format: 'png' });
  const exportMs = performance.now() - t0;
  // One more frame so a stall right at completion is counted too.
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  running = false;
  observer.disconnect();
  return {
    exportMs,
    bytes: blob.size,
    frames,
    maxGap,
    longtaskCount: longtasks.length,
    longestLongtask: longtasks.length ? Math.max(...longtasks) : 0,
    totalLongtaskMs: longtasks.reduce((a, b) => a + b, 0),
  };
}

/** Abort after the first tile; then check a fresh export still works. */
async function cancelThenExport() {
  const ac = new AbortController();
  let tilesAtAbort = 0;
  let tilesTotal = 0;
  let errorName: string;
  let errorMessage = '';
  const req: ExportRequest = {
    design: testDesign,
    output: { width: 5120, height: 2880 },
    format: 'png',
    tileSize: 1024,
  };
  try {
    await exportImage(req, {
      signal: ac.signal,
      onProgress: (p) => {
        tilesTotal = p.tilesTotal;
        if (!ac.signal.aborted) {
          tilesAtAbort = p.tilesDone;
          ac.abort();
        }
      },
    });
    errorName = 'none';
  } catch (err) {
    errorName = err instanceof DOMException || err instanceof Error ? err.name : String(err);
    errorMessage = err instanceof Error || err instanceof DOMException ? err.message : '';
  }

  // Already-aborted signals reject immediately.
  let preAborted = '';
  try {
    await exportImage(req, { signal: AbortSignal.abort() });
  } catch (err) {
    preAborted = (err as DOMException).name;
  }

  const after = await exportImage({ design: testDesign, output: { width: 320, height: 200 }, format: 'png' });
  const png = decode(new Uint8Array(await after.arrayBuffer()));
  return {
    errorName,
    errorMessage,
    tilesAtAbort,
    tilesTotal,
    preAborted,
    after: { type: after.type, width: png.width, height: png.height },
  };
}

async function exportJpeg(width: number, height: number) {
  const blob = await exportImage({ design: defaultDesign, output: { width, height }, format: 'jpeg', quality: 0.9 });
  const bmp = await createImageBitmap(blob);
  const result = { type: blob.type, bytes: blob.size, width: bmp.width, height: bmp.height };
  bmp.close();
  return result;
}

const harness = { exportVsSinglePass, previewVsExport, responsiveness, cancelThenExport, exportJpeg };
export type Harness = typeof harness;

declare global {
  interface Window {
    harness: Harness;
    harnessReady: boolean;
  }
}

window.harness = harness;
window.harnessReady = true;
