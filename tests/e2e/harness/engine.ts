// Test harness for the renderer. On the page it exposes `window.engineHarness`
// (called by tests/e2e/engine.spec.ts); the same module also runs as a Worker
// to render on an OffscreenCanvas.
import { bakeRamp } from '../../../src/color/ramp';
import { RAMP_SIZE } from '../../../src/color/types';
import type { Design } from '../../../src/design/design';
import { createRenderer } from '../../../src/engine/renderer';
import {
  CONTEXT_ATTRIBUTES,
  type OutputSize,
  type RenderOptions,
  type Tile,
} from '../../../src/engine/types';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Triple = [number, number, number];

/** Renders the full image, in tiles of at most `tileSize` px (0 = single pass). */
function renderImage(
  canvas: AnyCanvas,
  design: Design,
  output: OutputSize,
  tileSize: number,
  opts: RenderOptions = {},
) {
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
        renderer.render(design, output, tile, opts);
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

const newCanvas = () => document.createElement('canvas');
const render = (design: Design, output: OutputSize, dither: boolean) =>
  renderImage(newCanvas(), design, output, 0, { dither }).image;

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

function srgbEncode(x: number): number {
  x = Math.min(1, Math.max(0, x));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

// Math.f16round (ES2025) where available, to model the RGBA16F upload.
const f16round = (Math as unknown as { f16round?: (x: number) => number }).f16round;

/**
 * CPU reference of the linear gradient, in doubles: t per pixel, then the
 * baked ramp with the texture's linear filtering, then the sRGB transfer.
 * Returns ENCODED values scaled to 0..255, unrounded.
 */
function createReference(design: Design, output: OutputSize, halfFloat = false) {
  const ramp = bakeRamp(design.base.stops, RAMP_SIZE);
  if (halfFloat && f16round) for (let i = 0; i < ramp.length; i++) ramp[i] = f16round(ramp[i]);
  const n = RAMP_SIZE;
  const { width: w, height: h } = output;
  const a = (design.base.angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const extent = Math.abs(dx) * (w / h) + Math.abs(dy);
  return (px: number, py: number): Triple => {
    const u = (px + 0.5 - w / 2) / h;
    const v = (h / 2 - (py + 0.5)) / h;
    const t = Math.min(1, Math.max(0, (u * dx + v * dy) / extent + 0.5));
    // Sampling at (t·(n-1) + 0.5) / n with LINEAR filtering = lerp at t·(n-1).
    const s = t * (n - 1);
    const i0 = Math.min(n - 1, Math.floor(s));
    const i1 = Math.min(n - 1, i0 + 1);
    const f = s - i0;
    const out: Triple = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const c = ramp[i0 * 4 + k] * (1 - f) + ramp[i1 * 4 + k] * f;
      out[k] = srgbEncode(c) * 255;
    }
    return out;
  };
}

function compareToReference(image: Uint8Array, ref: (x: number, y: number) => Triple, w: number, h: number) {
  let maxDiff = 0;
  let worst: { x: number; y: number; gpu: number[]; ref: number[] } | null = null;
  let alphaOk = true;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = ref(x, y).map(Math.round);
      if (image[i + 3] !== 255) alphaOk = false;
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(image[i + k] - r[k]);
        if (d > maxDiff) {
          maxDiff = d;
          worst = { x, y, gpu: Array.from(image.subarray(i, i + 3)), ref: r };
        }
      }
    }
  }
  return { maxDiff, worst, alphaOk };
}

/** Longest run of identical values of channel k along each row, max over rows. */
function longestRowRun(image: Uint8Array, w: number, h: number, k: number) {
  let longest = 0;
  for (let y = 0; y < h; y++) {
    let run = 1;
    for (let x = 1; x < w; x++) {
      const i = (y * w + x) * 4 + k;
      run = image[i] === image[i - 4] ? run + 1 : 1;
      if (run > longest) longest = run;
    }
  }
  return longest;
}

/** Number of runs of identical values of channel k in row y. */
function runCount(image: Uint8Array, w: number, y: number, k: number) {
  let runs = 1;
  for (let x = 1; x < w; x++) {
    const i = (y * w + x) * 4 + k;
    if (image[i] !== image[i - 4]) runs++;
  }
  return runs;
}

/** RMS and max error of block-averaged values vs the ideal block averages, over all channels. */
function blockError(image: Uint8Array, ideal: Float64Array, w: number, h: number, block: number) {
  let sumSq = 0;
  let max = 0;
  let count = 0;
  for (let by = 0; by + block <= h; by += block) {
    for (let bx = 0; bx + block <= w; bx += block) {
      for (let k = 0; k < 3; k++) {
        let got = 0;
        let want = 0;
        for (let y = by; y < by + block; y++) {
          for (let x = bx; x < bx + block; x++) {
            const i = (y * w + x) * 4 + k;
            got += image[i];
            want += ideal[i];
          }
        }
        const e = Math.abs(got - want) / (block * block);
        sumSq += e * e;
        max = Math.max(max, e);
        count++;
      }
    }
  }
  return { rms: Math.sqrt(sumSq / count), max };
}

function renderInWorker(design: Design, output: OutputSize, tileSize: number, opts: RenderOptions) {
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
    worker.postMessage({ design, output, tileSize, opts });
  });
}

const harness = {
  /** Single pass vs tiled render of the same output, compared byte-for-byte. */
  compareTiled(design: Design, width: number, height: number, tileSize: number, dither: boolean) {
    const output = { width, height };
    let t0 = performance.now();
    const single = renderImage(newCanvas(), design, output, 0, { dither });
    const singleMs = performance.now() - t0;
    t0 = performance.now();
    const tiled = renderImage(newCanvas(), design, output, tileSize, { dither });
    const tiledMs = performance.now() - t0;
    return { ...diffImages(single.image, tiled.image, width), tiles: tiled.tiles, singleMs, tiledMs };
  },

  /** Main-thread single pass vs tiled render in a Worker on an OffscreenCanvas. */
  async compareWorker(design: Design, width: number, height: number, tileSize: number, dither: boolean) {
    const output = { width, height };
    const single = renderImage(newCanvas(), design, output, 0, { dither });
    const worker = await renderInWorker(design, output, tileSize, { dither });
    return { ...diffImages(single.image, worker.image, width), tiles: worker.tiles };
  },

  /**
   * Dither-off render vs the CPU reference. `maxDiff` uses the float32 ramp;
   * `maxDiffHalf` models the RGBA16F rounding of the upload (if supported).
   */
  compareReference(design: Design, width: number, height: number) {
    const output = { width, height };
    const image = render(design, output, false);
    const full = compareToReference(image, createReference(design, output), width, height);
    const half = f16round
      ? compareToReference(image, createReference(design, output, true), width, height).maxDiff
      : null;
    return { ...full, maxDiffHalf: half };
  },

  /**
   * One renderer draws designs a, b (different stops), then a again with a
   * mutated-in-place copy of b's stops, and each frame is compared to a fresh
   * renderer: the cached ramp must follow the stops.
   */
  rampCache(a: Design, b: Design, width: number, height: number) {
    const output = { width, height };
    const tile = { x: 0, y: 0, width, height };
    const canvas = newCanvas();
    canvas.width = width;
    canvas.height = height;
    const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES) as WebGL2RenderingContext;
    const renderer = createRenderer(gl);
    const mutated = structuredClone(b);
    const frames: Uint8Array[] = [];
    try {
      for (const d of [a, b, a, mutated]) {
        if (d === mutated) mutated.base.stops[0].color[0] += 0.2;
        renderer.render(d, output, tile, { dither: false });
        frames.push(renderer.readPixels(width, height));
      }
    } finally {
      renderer.dispose();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    const expected = [a, b, a, mutated].map((d) => render(d, output, false));
    return frames.map((f, i) => diffImages(f, expected[i], width).identical);
  },

  /** Dither-on vs dither-off: per-pixel bound and mean bias, per channel. */
  ditherStats(design: Design, width: number, height: number) {
    const output = { width, height };
    const on = render(design, output, true);
    const off = render(design, output, false);
    const ref = createReference(design, output);
    let maxDiff = 0;
    const sumOn = [0, 0, 0];
    const sumOff = [0, 0, 0];
    const sumIdeal = [0, 0, 0];
    const range = [255, 0];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const ideal = ref(x, y);
        for (let k = 0; k < 3; k++) {
          maxDiff = Math.max(maxDiff, Math.abs(on[i + k] - off[i + k]));
          sumOn[k] += on[i + k];
          sumOff[k] += off[i + k];
          sumIdeal[k] += ideal[k];
          range[0] = Math.min(range[0], off[i + k]);
          range[1] = Math.max(range[1], off[i + k]);
        }
      }
    }
    const n = width * height;
    return {
      maxDiff,
      meanBias: sumOn.map((s, k) => (s - sumOff[k]) / n),
      meanBiasIdeal: sumOn.map((s, k) => (s - sumIdeal[k]) / n),
      meanBiasIdealOff: sumOff.map((s, k) => (s - sumIdeal[k]) / n),
      range,
    };
  },

  /** Banding metrics for a horizontal (angle 0) gradient, dither off and on. */
  banding(design: Design, width: number, height: number, block: number) {
    const output = { width, height };
    const off = render(design, output, false);
    const on = render(design, output, true);
    const ref = createReference(design, output);
    const ideal = new Float64Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) ideal.set(ref(x, y), (y * width + x) * 4);
    }
    const mid = height >> 1;
    const stats = (image: Uint8Array) => ({
      longestRun: [0, 1, 2].map((k) => longestRowRun(image, width, height, k)),
      runsInRow: [0, 1, 2].map((k) => runCount(image, width, mid, k)),
      block: blockError(image, ideal, width, height, block),
    });
    const lo = ideal.subarray(0, 3);
    const hi = ideal.subarray((width - 1) * 4, (width - 1) * 4 + 3);
    return { off: stats(off), on: stats(on), idealRange: [Array.from(lo), Array.from(hi)] };
  },

  /**
   * Max per-channel difference of the left/right edge columns of an angle-0
   * gradient vs the ramp at the ideal t of those pixel centers (0.5 / W and
   * 1 - 0.5 / W): checks that t = 0..1 spans exactly the frame width.
   */
  edgeColumns(design: Design, width: number, height: number) {
    const image = render(design, { width, height }, false);
    const ramp = bakeRamp(design.base.stops, RAMP_SIZE);
    const at = (t: number) => {
      const s = t * (RAMP_SIZE - 1);
      const i0 = Math.floor(s);
      const f = s - i0;
      return [0, 1, 2].map((k) => {
        const c = ramp[i0 * 4 + k] * (1 - f) + ramp[(i0 + 1) * 4 + k] * f;
        return Math.round(srgbEncode(c) * 255);
      });
    };
    const columnDiff = (x: number, target: number[]) => {
      let max = 0;
      for (let y = 0; y < height; y++) {
        const i = (y * width + x) * 4;
        for (let k = 0; k < 3; k++) max = Math.max(max, Math.abs(image[i + k] - target[k]));
      }
      return max;
    };
    return {
      left: columnDiff(0, at(0.5 / width)),
      right: columnDiff(width - 1, at(1 - 0.5 / width)),
    };
  },
};

export type EngineHarness = typeof harness;

if (typeof window !== 'undefined') {
  (window as unknown as { engineHarness: EngineHarness }).engineHarness = harness;
} else {
  addEventListener('message', (e: MessageEvent) => {
    const { design, output, tileSize, opts } = e.data as {
      design: Design;
      output: OutputSize;
      tileSize: number;
      opts: RenderOptions;
    };
    try {
      const t0 = performance.now();
      const { image, tiles } = renderImage(new OffscreenCanvas(1, 1), design, output, tileSize, opts);
      postMessage({ buffer: image.buffer, tiles, ms: performance.now() - t0 }, { transfer: [image.buffer] });
    } catch (err) {
      postMessage({ error: String(err) });
    }
  });
}
