import type { EncodeOptions } from '@jsquash/jpeg/meta';

/** Quality for an export, 0 to 100: the point where the file is a fraction of the PNG and nothing is visibly lost (D115). */
export const DEFAULT_MOZJPEG_QUALITY = 95;

/**
 * Past this many pixels the full-image copy (plus the encoder's) would not fit the WASM heap comfortably, so the
 * export falls back to the browser's encoder.
 */
export const MOZJPEG_MAX_PIXELS = 64_000_000;

/**
 * Encodes with mozjpeg: 4:4:4 (the browser's encoder halves the color detail below quality 100), progressive and
 * with optimised tables. Chroma is pinned instead of left to `auto_subsample`, which only picks 4:4:4 at high quality.
 */
export async function encodeMozjpeg(
  rgba: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  quality: number = DEFAULT_MOZJPEG_QUALITY,
): Promise<Blob> {
  const { default: encode } = await import('@jsquash/jpeg/encode');
  const options: Partial<EncodeOptions> = { quality, auto_subsample: false, chroma_subsample: 1 };
  const bytes = await encode({ data: rgba, width, height, colorSpace: 'srgb' } as ImageData, options);
  return new Blob([bytes], { type: 'image/jpeg' });
}
