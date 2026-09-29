import type { Design } from '../design/design';
import type { OutputSize, Tile } from '../engine/types';

export type ExportFormat = 'png' | 'jpeg';

export interface ExportRequest {
  design: Design;
  output: OutputSize;
  format: ExportFormat;
  /** JPEG only, in [0, 1]. Default 0.95. */
  quality?: number;
  /** Max tile edge in px. Default DEFAULT_TILE_SIZE. */
  tileSize?: number;
}

export interface ExportProgress {
  tilesDone: number;
  tilesTotal: number;
}

export interface ExportOptions {
  onProgress?: (p: ExportProgress) => void;
  signal?: AbortSignal;
}

export const DEFAULT_TILE_SIZE = 2048;

/**
 * Implemented in src/export/tiles.ts:
 *   export function planTiles(output: OutputSize, tileSize: number): Tile[][]
 * Returns bands (tile rows) top→bottom; each band's tiles left→right.
 * All tiles in a band share y and height. Tiles cover the output exactly,
 * no overlap. Edge tiles are smaller.
 */
export type TileBands = Tile[][];

/**
 * Implemented in src/export/png.ts — streaming PNG encoder.
 *   export function createPngEncoder(size: OutputSize): PngEncoder
 * Output: 8-bit RGB (color type 2, alpha dropped), sRGB chunk
 * (rendering intent 0), zlib IDAT via CompressionStream('deflate').
 */
export interface PngEncoder {
  /**
   * Append `rowCount` full-width rows, top-down, as tightly packed RGBA8
   * (length = width * rowCount * 4). Must be called in order until all
   * `height` rows are written. Resolves once the rows are queued; the caller
   * must not mutate `rgba` before then, and may reuse it afterwards.
   */
  writeRows(rgba: Uint8Array, rowCount: number): Promise<void>;
  /** Finish and return the PNG. Throws if not all rows were written. */
  finish(): Promise<Blob>;
  /** Abort and release resources. */
  abort(): void;
}

/**
 * Implemented in src/export/exporter.ts (main-thread API, runs work in
 * src/export/export.worker.ts):
 *   export function exportImage(req: ExportRequest, opts?: ExportOptions): Promise<Blob>
 * Rejects with DOMException 'AbortError' when opts.signal aborts.
 */
