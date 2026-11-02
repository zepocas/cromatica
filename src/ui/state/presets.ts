export interface SizePreset {
  id: string;
  group: 'desktop' | 'mobile' | 'tablet';
  width: number;
  height: number;
  /** The shape for the label; rounded the way the screens are sold, so 3456 × 2234 is 16:10. */
  ratio: string;
}

const preset = (group: SizePreset['group'], width: number, height: number, ratio: string): SizePreset => ({
  id: `${width}x${height}`,
  group,
  width,
  height,
  ratio,
});

// High-resolution native panels only, one or two per shape; the custom size covers the rest (D114).
export const SIZE_PRESETS: SizePreset[] = [
  preset('desktop', 5120, 2880, '16:9'),
  preset('desktop', 3840, 2400, '16:10'),
  preset('desktop', 5120, 2160, '21:9'),
  preset('mobile', 1440, 3120, '9:19.5'),
  preset('mobile', 1440, 2560, '9:16'),
  preset('tablet', 2064, 2752, '3:4'),
];

export const PRESET_GROUPS = ['desktop', 'mobile', 'tablet'] as const;
export const DEFAULT_PRESET_ID = '5120x2880';
export const CUSTOM_PRESET_ID = 'custom';
/** The device's own screen in pixels; only offered where the page can read it (not with `?default`). */
export const SCREEN_PRESET_ID = 'screen';

export const presetLabel = (p: SizePreset) => `${p.width} × ${p.height} (${p.ratio})`;
