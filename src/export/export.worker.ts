import { createRenderer } from '../engine/renderer';
import { CONTEXT_ATTRIBUTES, type OutputSize, type Renderer, type Tile } from '../engine/types';
import type { StartMessage, WorkerMessage } from './exporter';
import { designText, DESIGN_KEYWORD } from './design-png';
import { embedJpegDesign } from './jpeg';
import { createPngEncoder } from './png';
import { assertOutputSize, planTiles } from './tiles';
import { DEFAULT_TILE_SIZE, type ExportRequest } from './types';

const DEFAULT_JPEG_QUALITY = 0.95;

/** Where finished bands of rows go: a streaming PNG encoder or a JPEG canvas. */
interface BandSink {
  /** `rows` full-width RGBA8 rows starting at output row `y`, top-down. */
  writeBand(rgba: Uint8Array<ArrayBuffer>, y: number, rows: number): Promise<void>;
  finish(): Promise<Blob>;
  abort(): void;
}

/** The design's text entries, or none if it doesn't validate: the image is still worth having. */
function embeddedDesign(design: ExportRequest['design']): Record<string, string> {
  try {
    return designText(design);
  } catch (err) {
    console.warn('export: the design could not be embedded', err);
    return {};
  }
}

function pngSink(output: OutputSize, text: Record<string, string>): BandSink {
  const encoder = createPngEncoder(output, text);
  return {
    writeBand: (rgba, _y, rows) => encoder.writeRows(rgba, rows),
    finish: () => encoder.finish(),
    abort: () => encoder.abort(),
  };
}

function jpegSink(output: OutputSize, quality: number, text: Record<string, string>): BandSink {
  const canvas = new OffscreenCanvas(output.width, output.height);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not create a 2D OffscreenCanvas for JPEG encoding');
  return {
    writeBand: async (rgba, y, rows) => {
      const pixels = new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, output.width * rows * 4);
      ctx.putImageData(new ImageData(pixels, output.width, rows), 0, y);
    },
    finish: async () => {
      const jpeg = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      const design = text[DESIGN_KEYWORD];
      return design === undefined ? jpeg : embedJpegDesign(jpeg, design);
    },
    abort: () => {},
  };
}

/** The largest tile edge this context can draw into. */
function maxTileEdge(gl: WebGL2RenderingContext): number {
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  return Math.min(viewport[0], viewport[1], gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
}

/** Render one tile and copy it into its place in the band buffer (full output width). */
function renderTileInto(
  renderer: Renderer,
  canvas: OffscreenCanvas,
  req: ExportRequest,
  tile: Tile,
  band: Uint8Array,
): void {
  if (canvas.width !== tile.width) canvas.width = tile.width;
  if (canvas.height !== tile.height) canvas.height = tile.height;
  // Dither is always on for exports (D7); it is indexed by output pixel, so tiles still match.
  renderer.render(req.design, req.output, tile, { dither: true });
  // Synchronous readback doubles as the per-tile GPU sync.
  const pixels = renderer.readPixels(tile.width, tile.height);
  const tileRowBytes = tile.width * 4;
  const rowBytes = req.output.width * 4;
  for (let row = 0; row < tile.height; row++) {
    const src = row * tileRowBytes;
    band.set(pixels.subarray(src, src + tileRowBytes), row * rowBytes + tile.x * 4);
  }
}

async function runExport(req: ExportRequest): Promise<Blob> {
  const { output } = req;
  assertOutputSize(output);

  const canvas = new OffscreenCanvas(1, 1);
  const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
  if (!gl) throw new Error('WebGL2 is not available in this worker (OffscreenCanvas)');

  const tileSize = Math.max(1, Math.min(req.tileSize ?? DEFAULT_TILE_SIZE, maxTileEdge(gl)));
  const bands = planTiles(output, tileSize);
  const tilesTotal = bands.reduce((n, band) => n + band.length, 0);
  const bandBuffer = new Uint8Array(output.width * Math.min(tileSize, output.height) * 4);

  let renderer: Renderer | undefined;
  let sink: BandSink | undefined;
  try {
    renderer = createRenderer(gl);
    const text = embeddedDesign(req.design);
    sink = req.format === 'png' ? pngSink(output, text) : jpegSink(output, req.quality ?? DEFAULT_JPEG_QUALITY, text);
    let tilesDone = 0;
    for (const band of bands) {
      for (const tile of band) {
        renderTileInto(renderer, canvas, req, tile, bandBuffer);
        post({ type: 'progress', tilesDone: ++tilesDone, tilesTotal });
      }
      const { y, height } = band[0];
      await sink.writeBand(bandBuffer.subarray(0, output.width * height * 4), y, height);
    }
    return await sink.finish();
  } catch (err) {
    sink?.abort();
    throw err;
  } finally {
    renderer?.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

function post(msg: WorkerMessage): void {
  self.postMessage(msg);
}

self.addEventListener('message', (e: MessageEvent<StartMessage>) => {
  if (e.data?.type !== 'start') return;
  runExport(e.data.req).then(
    (blob) => post({ type: 'done', blob }),
    (err: unknown) => post({ type: 'error', message: err instanceof Error ? err.message : String(err) }),
  );
});
