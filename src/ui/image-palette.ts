import { clusterImage, pickPalette, type ColorCluster } from '../color/extract';
import { createRng } from '../design/random';

/** Long side the image is reduced to before clustering: plenty for color, and k-means stays instant. */
const SAMPLE_SIZE = 256;
/** Most colors taken from an image. */
export const IMAGE_PALETTE_MAX = 6;

export interface ImagePalette {
  /** In pick order: the largest area first. */
  palette: ColorCluster[];
  /** Width / height of the image. */
  aspect: number;
}

/** Decode an image file and take its palette. Fully local: the image never leaves the browser. */
export async function paletteFromImage(file: Blob): Promise<ImagePalette> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, SAMPLE_SIZE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h, { colorSpace: 'srgb' });
    // Fixed seed: the same image always gives the same palette.
    const clusters = clusterImage(data, w, h, createRng(1));
    return { palette: pickPalette(clusters, { max: IMAGE_PALETTE_MAX }), aspect: bitmap.width / bitmap.height };
  } finally {
    bitmap.close();
  }
}
