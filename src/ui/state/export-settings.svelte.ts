import type { ExportFormat } from '../../export/types';
import { clamp } from '../../math';
import type { Size } from './device';
import { CUSTOM_PRESET_ID, DEFAULT_PRESET_ID, SCREEN_PRESET_ID, SIZE_PRESETS } from './presets';

/** Largest width or height the custom size accepts. */
export const MAX_SIZE = 16384;

/** What Download writes: the output size (a preset or a custom size) and the file format. */
export class ExportSettings {
  /** The device's screen in pixels, when it is known: it is the starting size and the first option of the list. */
  readonly screen: Size | null;
  presetId = $state(DEFAULT_PRESET_ID);
  /** The size preset under the arrow keys or pointer while its list is open; only the preview's frame changes. */
  presetPreview = $state<string | null>(null);
  customWidth = $state(1920);
  customHeight = $state(1080);
  /** JPEG: a file a fraction of the PNG's size, and wallpapers rarely need more. */
  format = $state<ExportFormat>('jpeg');

  constructor(opts: { screen?: Size } = {}) {
    this.screen = opts.screen ?? null;
    if (this.screen) this.presetId = SCREEN_PRESET_ID;
  }

  /** Export size in pixels, from the preset or the custom size. */
  get size(): { width: number; height: number } {
    if (this.presetId === SCREEN_PRESET_ID && this.screen) return this.screen;
    const preset = SIZE_PRESETS.find((p) => p.id === this.presetId);
    return this.presetId === CUSTOM_PRESET_ID || !preset
      ? { width: this.customWidth, height: this.customHeight }
      : { width: preset.width, height: preset.height };
  }

  /** The size under the pointer or arrow keys in the open list, as a frame shape. */
  get previewPreset(): Size | undefined {
    if (this.presetPreview === SCREEN_PRESET_ID) return this.screen ?? undefined;
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

  /** Select the preset with exactly this size (or this screen), else make it the custom size. */
  open(size: { width: number; height: number }) {
    const preset = SIZE_PRESETS.find((p) => p.width === size.width && p.height === size.height);
    if (preset) {
      this.presetId = preset.id;
    } else if (this.screen && this.screen.width === size.width && this.screen.height === size.height) {
      this.presetId = SCREEN_PRESET_ID;
    } else {
      this.presetId = CUSTOM_PRESET_ID;
      this.customWidth = size.width;
      this.customHeight = size.height;
    }
  }
}
