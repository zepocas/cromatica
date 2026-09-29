export interface DevicePreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

// Native panel resolutions (docs/PLAN.md, "Device presets").
export const DEVICE_PRESETS: DevicePreset[] = [
  { id: 'mba13', label: 'MacBook Air 13"', width: 2560, height: 1664 },
  { id: 'mba15', label: 'MacBook Air 15"', width: 2880, height: 1864 },
  { id: 'mbp14', label: 'MacBook Pro 14"', width: 3024, height: 1964 },
  { id: 'mbp16', label: 'MacBook Pro 16"', width: 3456, height: 2234 },
  { id: 'studio', label: 'Studio Display', width: 5120, height: 2880 },
  { id: 'xdr', label: 'Pro Display XDR', width: 6016, height: 3384 },
  { id: '1080p', label: '1080p', width: 1920, height: 1080 },
  { id: '1440p', label: '1440p', width: 2560, height: 1440 },
  { id: '4k', label: '4K UHD', width: 3840, height: 2160 },
  { id: 'ultrawide', label: 'Ultrawide', width: 3440, height: 1440 },
  { id: '5k2k', label: '5K2K', width: 5120, height: 2160 },
];

export const CUSTOM_PRESET_ID = 'custom';
