import { createRenderer } from '../engine/renderer';
import { CONTEXT_ATTRIBUTES, type Renderer } from '../engine/types';
import type { StartMessage, WorkerMessage } from './exporter';
import { createPngEncoder } from './png';
import { planTiles } from './tiles';
import { DEFAULT_TILE_SIZE, type ExportRequest, type PngEncoder } from './types';

function post(msg: WorkerMessage): void {
  self.postMessage(msg);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function runExport(req: ExportRequest): Promise<Blob> {
  const { output, design, format } = req;
  const { width, height } = output;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`Invalid output size ${width}×${height}`);
  }

  const canvas = new OffscreenCanvas(1, 1);
  const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
  if (!gl) throw new Error('WebGL2 is not available in this worker (OffscreenCanvas)');

  // Never ask for tiles larger than the context can draw into.
  const maxDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const maxEdge = Math.min(maxDims[0], maxDims[1], gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
  const tileSize = Math.max(1, Math.min(req.tileSize ?? DEFAULT_TILE_SIZE, maxEdge));

  const bands = planTiles(output, tileSize);
  const tilesTotal = bands.reduce((n, band) => n + band.length, 0);
  const maxBandHeight = bands.reduce((h, band) => Math.max(h, band[0]?.height ?? 0), 0);
  const bandBuffer = new Uint8Array(width * maxBandHeight * 4);

  let renderer: Renderer | undefined;
  let encoder: PngEncoder | undefined;
  let jpegCtx: OffscreenCanvasRenderingContext2D | undefined;
  let jpegCanvas: OffscreenCanvas | undefined;

  try {
    renderer = createRenderer(gl);
    if (format === 'png') {
      encoder = createPngEncoder(output);
    } else {
      jpegCanvas = new OffscreenCanvas(width, height);
      const ctx = jpegCanvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Could not create a 2D OffscreenCanvas for JPEG encoding');
      jpegCtx = ctx;
    }

    let tilesDone = 0;
    for (const band of bands) {
      const bandY = band[0].y;
      const bandHeight = band[0].height;
      const rowBytes = width * 4;

      for (const tile of band) {
        if (canvas.width !== tile.width) canvas.width = tile.width;
        if (canvas.height !== tile.height) canvas.height = tile.height;
        // Dither is always on for exports (D7); it is indexed by output pixel, so tiles still match.
        renderer.render(design, output, tile, { dither: true });
        // Synchronous readback doubles as the per-tile GPU sync.
        const pixels = renderer.readPixels(tile.width, tile.height);
        const tileRowBytes = tile.width * 4;
        for (let row = 0; row < tile.height; row++) {
          const src = row * tileRowBytes;
          bandBuffer.set(pixels.subarray(src, src + tileRowBytes), row * rowBytes + tile.x * 4);
        }
        tilesDone++;
        post({ type: 'progress', tilesDone, tilesTotal });
      }

      const bandBytes = bandBuffer.subarray(0, rowBytes * bandHeight);
      if (encoder) {
        await encoder.writeRows(bandBytes, bandHeight);
      } else if (jpegCtx) {
        const clamped = new Uint8ClampedArray(bandBuffer.buffer, 0, rowBytes * bandHeight);
        jpegCtx.putImageData(new ImageData(clamped, width, bandHeight), 0, bandY);
      }
    }

    if (encoder) return await encoder.finish();
    return await jpegCanvas!.convertToBlob({ type: 'image/jpeg', quality: req.quality ?? 0.95 });
  } catch (err) {
    encoder?.abort();
    throw err;
  } finally {
    renderer?.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

self.addEventListener('message', (e: MessageEvent<StartMessage>) => {
  if (e.data?.type !== 'start') return;
  runExport(e.data.req).then(
    (blob) => post({ type: 'done', blob }),
    (err: unknown) => post({ type: 'error', message: errorMessage(err) }),
  );
});
