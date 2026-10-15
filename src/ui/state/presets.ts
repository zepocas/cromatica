export interface SizePreset {
  id: string;
  group: 'desktop' | 'mobile' | 'tablet';
  width: number;
  height: number;
}

const preset = (group: SizePreset['group'], width: number, height: number): SizePreset => ({
  id: `${width}x${height}`,
  group,
  width,
  height,
});

// Native panel resolutions (docs/PLAN.md, "Device presets"); labeled by resolution only.
export const SIZE_PRESETS: SizePreset[] = [
  preset('desktop', 1920, 1080),
  preset('desktop', 2560, 1440),
  preset('desktop', 2560, 1664),
  preset('desktop', 2880, 1864),
  preset('desktop', 3024, 1964),
  preset('desktop', 3440, 1440),
  preset('desktop', 3456, 2234),
  preset('desktop', 3840, 2160),
  preset('desktop', 5120, 2160),
  preset('desktop', 5120, 2880),
  preset('desktop', 6016, 3384),
  preset('mobile', 1080, 1920),
  preset('mobile', 1080, 2340),
  preset('mobile', 1080, 2400),
  preset('mobile', 1170, 2532),
  preset('mobile', 1179, 2556),
  preset('mobile', 1206, 2622),
  preset('mobile', 1290, 2796),
  preset('mobile', 1320, 2868),
  preset('mobile', 1440, 3120),
  preset('mobile', 1440, 3200),
  preset('tablet', 1640, 2360),
  preset('tablet', 2048, 2732),
  preset('tablet', 2064, 2752),
];

export const PRESET_GROUPS = ['desktop', 'mobile', 'tablet'] as const;
export const DEFAULT_PRESET_ID = '3840x2160';
export const CUSTOM_PRESET_ID = 'custom';

export const presetLabel = (p: SizePreset) => `${p.width} × ${p.height}`;
