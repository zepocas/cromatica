// Test harness for the renderer. On the page it exposes `window.engineHarness`
// (called by tests/e2e/engine.spec.ts); the same module also runs as a Worker
// to render on an OffscreenCanvas.
import type { Design, Rgb } from '../../../src/design/design';
import { createRenderer } from '../../../src/engine/renderer';
import { CONTEXT_ATTRIBUTES, type OutputSize, type Tile } from '../../../src/engine/types';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** Renders the full image, in tiles of at most `tileSize` px (0 = single pass). */
function renderImage(canvas: AnyCanvas, design: Design, output: OutputSize, tileSize: number) {
  const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('no webgl2');
  const renderer = createRenderer(gl);
  const size = tileSize > 0 ? tileSize : Math.max(output.width, output.height);
  const image = new Uint8Array(output.width * output.height * 4);
  let tiles = 0;
  try {
    for (let y = 0; y < output.height; y += size) {
      for (let x = 0; x < output.width; x += size) {
        const tile: Tile = {
          x,
          y,
          width: Math.min(size, output.width - x),
          height: Math.min(size, output.height - y),
        };
        canvas.width = tile.width;
        canvas.height = tile.height;
        renderer.render(design, output, tile);
        const px = renderer.readPixels(tile.width, tile.height);
        for (let row = 0; row < tile.height; row++) {
          const src = row * tile.width * 4;
          image.set(px.subarray(src, src + tile.width * 4), ((y + row) * output.width + x) * 4);
        }
        tiles++;
      }
    }
  } finally {
    renderer.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return { image, tiles };
}

function diffImages(a: Uint8Array, b: Uint8Array, width: number) {
  let mismatches = 0;
  let first: { x: number; y: number; a: number[]; b: number[] } | null = null;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
      if (!first) {
        const p = i / 4;
        first = {
          x: p % width,
          y: Math.floor(p / width),
          a: Array.from(a.subarray(i, i + 4)),
          b: Array.from(b.subarray(i, i + 4)),
        };
      }
      mismatches++;
    }
  }
  return { identical: mismatches === 0 && a.length === b.length, mismatches, first };
}

/** CPU reference of the M0 linear gradient, in doubles. */
function referencePixel(design: Design, output: OutputSize, px: number, py: number): Rgb {
  const { width: w, height: h } = output;
  const u = (px + 0.5 - w / 2) / h;
  const v = (h / 2 - (py + 0.5)) / h;
  const a = (design.base.angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const extent = Math.abs(dx) * (w / h) + Math.abs(dy);
  const t = Math.min(1, Math.max(0, (u * dx + v * dy) / extent + 0.5));
  const stops = design.base.stops;
  let c = stops[0].color;
  for (let i = 1; i < stops.length; i++) {
    const p0 = stops[i - 1].position;
    const p1 = stops[i].position;
    if (t > p0) {
      const span = p1 - p0;
      const f = span > 0 ? Math.min(1, Math.max(0, (t - p0) / span)) : 1;
      const c0 = stops[i - 1].color;
      const c1 = stops[i].color;
      c = [0, 1, 2].map((k) => c0[k] + (c1[k] - c0[k]) * f) as Rgb;
    }
  }
  return c.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255)) as Rgb;
}

function renderInWorker(design: Design, output: OutputSize, tileSize: number) {
  return new Promise<{ image: Uint8Array; tiles: number; ms: number }>((resolve, reject) => {
    const worker = new Worker(new URL('./engine.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve({ image: new Uint8Array(e.data.buffer), tiles: e.data.tiles, ms: e.data.ms });
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage({ design, output, tileSize });
  });
}

const harness = {
  /** Single pass vs tiled render of the same output, compared byte-for-byte. */
  compareTiled(design: Design, width: number, height: number, tileSize: number) {
    const output = { width, height };
    let t0 = performance.now();
    const single = renderImage(document.createElement('canvas'), design, output, 0);
    const singleMs = performance.now() - t0;
    t0 = performance.now();
    const tiled = renderImage(document.createElement('canvas'), design, output, tileSize);
    const tiledMs = performance.now() - t0;
    return { ...diffImages(single.image, tiled.image, width), tiles: tiled.tiles, singleMs, tiledMs };
  },

  /** Main-thread single pass vs tiled render in a Worker on an OffscreenCanvas. */
  async compareWorker(design: Design, width: number, height: number, tileSize: number) {
    const output = { width, height };
    const single = renderImage(document.createElement('canvas'), design, output, 0);
    const worker = await renderInWorker(design, output, tileSize);
    return { ...diffImages(single.image, worker.image, width), tiles: worker.tiles };
  },

  /** Every pixel vs the CPU reference; returns the max per-channel difference. */
  compareReference(design: Design, width: number, height: number) {
    const output = { width, height };
    const { image } = renderImage(document.createElement('canvas'), design, output, 0);
    let maxDiff = 0;
    let worst: { x: number; y: number; gpu: number[]; ref: number[] } | null = null;
    let alphaOk = true;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const ref = referencePixel(design, output, x, y);
        if (image[i + 3] !== 255) alphaOk = false;
        for (let k = 0; k < 3; k++) {
          const d = Math.abs(image[i + k] - ref[k]);
          if (d > maxDiff) {
            maxDiff = d;
            worst = { x, y, gpu: Array.from(image.subarray(i, i + 3)), ref };
          }
        }
      }
    }
    return { maxDiff, worst, alphaOk };
  },

  /** Max per-channel difference of the left/right edge columns vs the first/last stop. */
  edgeColumns(design: Design, width: number, height: number) {
    const { image } = renderImage(document.createElement('canvas'), design, { width, height }, 0);
    const stops = design.base.stops;
    const to8 = (c: Rgb) => c.map((x) => Math.round(x * 255));
    const first = to8(stops[0].color);
    const last = to8(stops[stops.length - 1].color);
    const columnDiff = (x: number, target: number[]) => {
      let max = 0;
      for (let y = 0; y < height; y++) {
        const i = (y * width + x) * 4;
        for (let k = 0; k < 3; k++) max = Math.max(max, Math.abs(image[i + k] - target[k]));
      }
      return max;
    };
    return { left: columnDiff(0, first), right: columnDiff(width - 1, last) };
  },
};

export type EngineHarness = typeof harness;

if (typeof window !== 'undefined') {
  (window as unknown as { engineHarness: EngineHarness }).engineHarness = harness;
} else {
  addEventListener('message', (e: MessageEvent) => {
    const { design, output, tileSize } = e.data as { design: Design; output: OutputSize; tileSize: number };
    try {
      const t0 = performance.now();
      const { image, tiles } = renderImage(new OffscreenCanvas(1, 1), design, output, tileSize);
      postMessage({ buffer: image.buffer, tiles, ms: performance.now() - t0 }, { transfer: [image.buffer] });
    } catch (err) {
      postMessage({ error: String(err) });
    }
  });
}
