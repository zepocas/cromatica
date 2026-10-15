import type { ExportFormat } from '../../export/types';
import { clamp } from '../../math';
import { CUSTOM_PRESET_ID, DEFAULT_PRESET_ID, SIZE_PRESETS } from './presets';

/** Largest width or height the custom size accepts. */
export const MAX_SIZE = 16384;

/** What Download writes: the output size (a preset or a custom size) and the file format. */
export class ExportSettings {
  presetId = $state(DEFAULT_PRESET_ID);
  /** The size preset under the arrow keys or pointer while its list is open; only the preview's frame changes. */
  presetPreview = $state<string | null>(null);
  customWidth = $state(1920);
  customHeight = $state(1080);
  format = $state<ExportFormat>('png');

  /** Export size in pixels, from the preset or the custom size. */
  get size(): { width: number; height: number } {
    const preset = SIZE_PRESETS.find((p) => p.id === this.presetId);
    return this.presetId === CUSTOM_PRESET_ID || !preset
      ? { width: this.customWidth, height: this.customHeight }
      : { width: preset.width, height: preset.height };
  }

  get previewPreset() {
    return this.presetPreview ? SIZE_PRESETS.find((p) => p.id === this.presetPreview) : undefined;
  }

  /** Picking "custom" starts from the size shown, not from the last custom one. */
  choosePreset(id: string) {
    if (id === CUSTOM_PRESET_ID && this.presetId !== CUSTOM_PRESET_ID) {
      const { width, height } = this.size;
      this.customWidth = width;
      this.customHeight = height;
    }
    this.presetId = id;
  }

  setCustom(axis: 'width' | 'height', v: number) {
    const value = clamp(Math.round(Number.isFinite(v) ? v : 1), 1, MAX_SIZE);
    const { width, height } = this.size;
    this.customWidth = axis === 'width' ? value : width;
    this.customHeight = axis === 'height' ? value : height;
    this.presetId = CUSTOM_PRESET_ID;
  }

  /** Select the preset with exactly this size, else make it the custom size. */
  open(size: { width: number; height: number }) {
    const preset = SIZE_PRESETS.find((p) => p.width === size.width && p.height === size.height);
    if (preset) {
      this.presetId = preset.id;
    } else {
      this.presetId = CUSTOM_PRESET_ID;
      this.customWidth = size.width;
      this.customHeight = size.height;
    }
  }
}
