export interface CropRatio {
  label: string;
  /** Width / height. */
  aspect: number;
}

// One per kind of screen in the size presets; phones and tablets in portrait.
export const CROP_RATIOS: CropRatio[] = [
  { label: '21:9', aspect: 3440 / 1440 },
  { label: '16:9', aspect: 16 / 9 },
  { label: '16:10', aspect: 1512 / 982 },
  { label: 'tablet', aspect: 2064 / 2752 },
  { label: 'phone', aspect: 1206 / 2622 },
];

/**
 * The crops that fit inside the frame, as centered fractions of its width. The
 * image height is fixed (D4), so a narrower screen shows a centered strip and a
 * wider one shows more at the sides, which the preview can't draw.
 */
export function visibleCrops(frameAspect: number, ratios = CROP_RATIOS): (CropRatio & { width: number })[] {
  return ratios.filter((r) => r.aspect < frameAspect * 0.98).map((r) => ({ ...r, width: r.aspect / frameAspect }));
}
