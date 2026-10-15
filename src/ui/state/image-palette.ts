import { clusterImage, pickPalette, type ColorCluster } from '../../color/extract';
import { createRng } from '../../design/random';

/** Long side the image is reduced to before clustering: plenty for color, and k-means stays instant. */
const SAMPLE_SIZE = 256;
export const IMAGE_PALETTE_MAX = 6;

export interface ImageSource {
  file: Blob;
  /** The downscaled pixels the colors are sampled from (RGBA8, sRGB). */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ImagePalette {
  /** In pick order: the largest area first. */
  palette: ColorCluster[];
  aspect: number;
  /** Set when the palette comes from a file; absent for a palette made elsewhere. */
  source?: ImageSource;
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
    return {
      palette: pickPalette(clusters, { max: IMAGE_PALETTE_MAX }),
      aspect: bitmap.width / bitmap.height,
      source: { file, data, width: w, height: h },
    };
  } finally {
    bitmap.close();
  }
}
