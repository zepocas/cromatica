// Test harness for the renderer. On the page it exposes `window.engineHarness`
// (called by tests/e2e/engine.spec.ts); the same module also runs as a Worker
// to render on an OffscreenCanvas.
import { createMeshEvaluator, meshGamutClip } from '../../../src/color/mesh';
import {
  gamutMapToLinearSrgb,
  linearSrgbToOklab,
  oklabToLinearSrgb,
  oklabToOklch,
  srgbDecode,
} from '../../../src/color/oklab';
import { bakeRamp } from '../../../src/color/ramp';
import { RAMP_SIZE, type Rgb } from '../../../src/color/types';
import { noGrain, noWarp, type Design, type LinearGradient, type PointMesh } from '../../../src/design/design';
import { createRenderer } from '../../../src/engine/renderer';
import { applyMat2, orientationMatrix, transformMatrix } from '../../../src/engine/transform';
import { createWarp } from '../../../src/engine/warp';
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
 * CPU reference of the (warped) linear gradient, in doubles: warped composition
 * coords per pixel, t, then the baked ramp with the texture's linear filtering,
 * then the sRGB transfer. Returns ENCODED values scaled to 0..255, unrounded.
 * Grain is not modeled (render references with grain off).
 */
function createReference(design: Design, output: OutputSize, halfFloat = false) {
  const warp = createWarp(design.warp ?? noWarp);
  const m = transformMatrix(design.transform);
  const { width: w, height: h } = output;
  const at = (px: number, py: number) => warp(...applyMat2(m, ...compositionCoord(px, py, w, h)));
  if (design.base.kind === 'mesh') return createMeshReference(design.base, at);
  const base = design.base;
  const ramp = bakeRamp(base.stops, RAMP_SIZE);
  if (halfFloat && f16round) for (let i = 0; i < ramp.length; i++) ramp[i] = f16round(ramp[i]);
  const n = RAMP_SIZE;
  const a = (base.angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  // The ramp spans the rotated/flipped frame (see linearGradientUniforms).
  const o = orientationMatrix(design.transform);
  const [ex, ey] = applyMat2([o[0], o[2], o[1], o[3]], dx, dy);
  const extent = Math.abs(ex) * (w / h) + Math.abs(ey);
  return (px: number, py: number): Triple => {
    const [u, v] = at(px, py);
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

/** Composition coords of an output pixel center (src/engine/types.ts). */
const compositionCoord = (px: number, py: number, w: number, h: number) =>
  [(px + 0.5 - w / 2) / h, (h / 2 - (py + 0.5)) / h] as const;

/** CPU reference of the mesh: Oklab blend → the shader's gamut clip → sRGB, 0..255 unrounded. */
function createMeshReference(mesh: PointMesh, at: (px: number, py: number) => readonly [number, number]) {
  const evaluate = createMeshEvaluator(mesh);
  return (px: number, py: number): Triple => {
    const rgb = meshGamutClip(evaluate(...at(px, py)));
    return [srgbEncode(rgb[0]) * 255, srgbEncode(rgb[1]) * 255, srgbEncode(rgb[2]) * 255];
  };
}

const deltaEOK = (a: Rgb, b: Rgb) => {
  const p = linearSrgbToOklab(a);
  const q = linearSrgbToOklab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

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

/** Output pixel of the untransformed image that a transformed pixel must equal. */
export type PixelMap = 'flipX' | 'flipY' | 'rotate180' | 'rotate90';

const PIXEL_MAPS: Record<PixelMap, (x: number, y: number, w: number, h: number) => [number, number]> = {
  flipX: (x, y, w) => [w - 1 - x, y],
  flipY: (x, y, _w, h) => [x, h - 1 - y],
  rotate180: (x, y, w, h) => [w - 1 - x, h - 1 - y],
  // Square outputs only: composition (u, v) → (v, -u).
  rotate90: (x, y, w) => [w - 1 - y, x],
};

const harness = {
  /**
   * Renders `plain` and `transformed` (dither off) and checks that each
   * pixel of `transformed` equals the pixel of `plain` given by `map`.
   * Quarter turns and flips only permute exact composition coords, so the
   * match must be byte-exact.
   */
  compareRemapped(plain: Design, transformed: Design, width: number, height: number, map: PixelMap) {
    const output = { width, height };
    const a = render(plain, output, false);
    const b = render(transformed, output, false);
    const expected = new Uint8Array(a.length);
    const f = PIXEL_MAPS[map];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [sx, sy] = f(x, y, width, height);
        const i = (sy * width + sx) * 4;
        expected.set(a.subarray(i, i + 4), (y * width + x) * 4);
      }
    }
    return { ...diffImages(expected, b, width), different: !diffImages(a, b, width).identical };
  },

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
        if (d === mutated) (mutated.base as LinearGradient).stops[0].color[0] += 0.2;
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
    const ramp = bakeRamp((design.base as LinearGradient).stops, RAMP_SIZE);
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

  /**
   * Mesh gamut clip vs the CSS Color 4 gamut mapping (gamutMapToLinearSrgb),
   * as ΔE_OK, on the CPU (`clip`) and for the rendered, dither-off 8-bit
   * pixels (`gpu`, includes quantization). `outOfGamut` = share of pixels
   * whose blend needed clipping.
   */
  meshGamutVsCss(design: Design, width: number, height: number) {
    const mesh = design.base as PointMesh;
    const image = render(design, { width, height }, false);
    const evaluate = createMeshEvaluator(mesh);
    let clip = 0;
    let gpu = 0;
    let outOfGamut = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const lab = evaluate(...compositionCoord(x, y, width, height));
        const css = gamutMapToLinearSrgb(oklabToOklch(lab));
        const ours = meshGamutClip(lab);
        const raw = oklabToLinearSrgb(lab);
        if (raw.some((v) => v < 0 || v > 1)) outOfGamut++;
        clip = Math.max(clip, deltaEOK(ours, css));
        const i = (y * width + x) * 4;
        const px: Rgb = [0, 1, 2].map((k) => srgbDecode(image[i + k] / 255)) as Rgb;
        gpu = Math.max(gpu, deltaEOK(px, css));
      }
    }
    return { clip, gpu, outOfGamut: outOfGamut / (width * height) };
  },

  /**
   * Channel range, black pixels, and the largest step between neighboring
   * pixels (max over channels, horizontal and vertical) of a render.
   */
  imageStats(design: Design, width: number, height: number, dither: boolean) {
    const image = render(design, { width, height }, dither);
    let min = 255;
    let max = 0;
    let black = 0;
    let maxStep = 0;
    let alphaOk = true;
    const stride = width * 4;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * stride + x * 4;
        if (image[i] === 0 && image[i + 1] === 0 && image[i + 2] === 0) black++;
        if (image[i + 3] !== 255) alphaOk = false;
        for (let k = 0; k < 3; k++) {
          const v = image[i + k];
          min = Math.min(min, v);
          max = Math.max(max, v);
          if (x > 0) maxStep = Math.max(maxStep, Math.abs(v - image[i - 4 + k]));
          if (y > 0) maxStep = Math.max(maxStep, Math.abs(v - image[i - stride + k]));
        }
      }
    }
    return { min, max, black, maxStep, alphaOk };
  },

  /** Median GPU time (draw + finish, no readback) of a single-pass render. */
  timeRender(design: Design, width: number, height: number, reps: number) {
    const canvas = newCanvas();
    canvas.width = width;
    canvas.height = height;
    const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES) as WebGL2RenderingContext;
    const renderer = createRenderer(gl);
    const output = { width, height };
    const tile = { x: 0, y: 0, width, height };
    const times: number[] = [];
    try {
      // Warm-up compiles the program.
      renderer.render(design, output, tile);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      for (let r = 0; r < reps; r++) {
        const t0 = performance.now();
        renderer.render(design, output, tile);
        // A 1-pixel readback forces the draw to complete (finish() may not block).
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        times.push(performance.now() - t0);
      }
    } finally {
      renderer.dispose();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    times.sort((a, b) => a - b);
    return times[times.length >> 1];
  },

  /** Two designs rendered with dither on, compared byte-for-byte. */
  compareDesigns(a: Design, b: Design, width: number, height: number) {
    const output = { width, height };
    return diffImages(render(a, output, true), render(b, output, true), width);
  },

  // ---- M3: warp and grain ----------------------------------------------------

  /**
   * Dither-off, grain-off render of a warped design vs the CPU reference
   * (warpPoint → base pattern). Pixels within 1 px of a warp discontinuity
   * (a step of rows/columns/voronoi: the warp jumps by > 4 px between
   * neighbors) are counted separately.
   */
  compareWarpReference(design: Design, width: number, height: number, tolerance: number) {
    const output = { width, height };
    const d: Design = { ...design, grain: noGrain };
    const image = render(d, output, false);
    const ref = createReference(d, output);
    const warp = createWarp(d.warp ?? noWarp);
    const m = transformMatrix(d.transform);
    const warped = new Float64Array(width * height * 2);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = warp(...applyMat2(m, ...compositionCoord(x, y, width, height)));
        warped[(y * width + x) * 2] = p[0];
        warped[(y * width + x) * 2 + 1] = p[1];
      }
    }
    const jump = 4 / height;
    const nearStep = (x: number, y: number) => {
      const i = (y * width + x) * 2;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = (ny * width + nx) * 2;
          const moved = Math.hypot(warped[i] - warped[j], warped[i + 1] - warped[j + 1]);
          if (moved > jump) return true;
        }
      }
      return false;
    };
    let maxDiff = 0;
    let maxDiffOffStep = 0;
    let over = 0;
    let overOffStep = 0;
    let stepPixels = 0;
    type Worst = { x: number; y: number; gpu: number[]; ref: number[] } | null;
    let worst: Worst = null;
    let worstAny: Worst = null;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = ref(x, y).map(Math.round);
        let diff = 0;
        for (let k = 0; k < 3; k++) diff = Math.max(diff, Math.abs(image[i + k] - r[k]));
        const step = nearStep(x, y);
        if (step) stepPixels++;
        if (diff > maxDiff) {
          maxDiff = diff;
          worstAny = { x, y, gpu: Array.from(image.subarray(i, i + 3)), ref: r };
        }
        if (diff > tolerance) over++;
        if (!step) {
          if (diff > maxDiffOffStep) {
            maxDiffOffStep = diff;
            worst = { x, y, gpu: Array.from(image.subarray(i, i + 3)), ref: r };
          }
          if (diff > tolerance) overOffStep++;
        }
      }
    }
    return { maxDiff, maxDiffOffStep, over, overOffStep, stepPixels, worst, worstAny };
  },

  /**
   * Grain on vs off (dither on in both) over the whole image: mean difference
   * per channel, σ of the luma-ish (channel-mean) difference, its horizontal
   * autocorrelation at lags 1..4, and how many pixels that are exactly 0 or
   * 255 without grain changed with it.
   */
  grainStats(design: Design, width: number, height: number) {
    const output = { width, height };
    const on = render(design, output, true);
    const off = render({ ...design, grain: noGrain }, output, true);
    const n = width * height;
    const mean = [0, 0, 0];
    const diff = new Float64Array(n);
    let changedAtEnds = 0;
    let maxChangeAtEnds = 0;
    let ends = 0;
    for (let p = 0; p < n; p++) {
      let dsum = 0;
      for (let k = 0; k < 3; k++) {
        const a = on[p * 4 + k];
        const b = off[p * 4 + k];
        mean[k] += a - b;
        dsum += a - b;
        if (b === 0 || b === 255) {
          ends++;
          if (a !== b) changedAtEnds++;
          maxChangeAtEnds = Math.max(maxChangeAtEnds, Math.abs(a - b));
        }
      }
      diff[p] = dsum / 3;
    }
    const m = diff.reduce((a, b) => a + b, 0) / n;
    let v = 0;
    for (let p = 0; p < n; p++) v += (diff[p] - m) ** 2;
    v /= n;
    const autocorr = [1, 2, 3, 4].map((lag) => {
      let c = 0;
      let count = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x + lag < width; x++) {
          c += (diff[y * width + x] - m) * (diff[y * width + x + lag] - m);
          count++;
        }
      }
      return c / count / v;
    });
    return { meanDiff: mean.map((s) => s / n), sigma: Math.sqrt(v), autocorr, ends, changedAtEnds, maxChangeAtEnds };
  },

  /**
   * Contact sheet: rows × columns of designs, each rendered at cellW × cellH
   * with dither on, labeled, as a PNG data URL.
   */
  async contactSheet(rows: { label: string; designs: Design[] }[], columns: string[], cellW: number, cellH: number) {
    const labelW = 110;
    const headerH = 28;
    const gap = 4;
    const sheet = document.createElement('canvas');
    sheet.width = labelW + columns.length * (cellW + gap);
    sheet.height = headerH + rows.length * (cellH + gap);
    const ctx = sheet.getContext('2d')!;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    ctx.fillStyle = '#eee';
    ctx.font = '16px sans-serif';
    ctx.textBaseline = 'middle';
    columns.forEach((c, i) => ctx.fillText(c, labelW + i * (cellW + gap) + 8, headerH / 2));
    rows.forEach((row, r) => {
      const y0 = headerH + r * (cellH + gap);
      ctx.fillStyle = '#eee';
      ctx.fillText(row.label, 8, y0 + cellH / 2);
      row.designs.forEach((d, c) => {
        const px = render(d, { width: cellW, height: cellH }, true);
        const img = new ImageData(new Uint8ClampedArray(px.buffer as ArrayBuffer), cellW, cellH);
        ctx.putImageData(img, labelW + c * (cellW + gap), y0);
      });
    });
    const blob = await new Promise<Blob>((resolve) => sheet.toBlob((b) => resolve(b!), 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(bin);
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
