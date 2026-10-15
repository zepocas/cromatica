import { describe, expect, it } from 'vitest';
import { ExportSettings, MAX_SIZE } from '../../src/ui/state/export-settings.svelte';
import { CUSTOM_PRESET_ID, DEFAULT_PRESET_ID } from '../../src/ui/state/presets';

describe('export settings', () => {
  it('starts on the default preset', () => {
    const s = new ExportSettings();
    expect([s.presetId, s.size, s.format]).toEqual([DEFAULT_PRESET_ID, { width: 3840, height: 2160 }, 'png']);
  });

  it('starts "custom" from the size shown, not from the last custom one', () => {
    const s = new ExportSettings();
    s.choosePreset(CUSTOM_PRESET_ID);
    expect(s.size).toEqual({ width: 3840, height: 2160 });
  });

  it('typing one side keeps the other, rounds and clamps, and switches to custom', () => {
    const s = new ExportSettings();
    s.setCustom('width', 1000.4);
    expect([s.presetId, s.size]).toEqual([CUSTOM_PRESET_ID, { width: 1000, height: 2160 }]);
    s.setCustom('height', 10 * MAX_SIZE);
    expect(s.size.height).toBe(MAX_SIZE);
    s.setCustom('width', Number.NaN);
    expect(s.size.width).toBe(1);
  });

  it('reopening a size picks its preset, or becomes the custom size', () => {
    const s = new ExportSettings();
    s.open({ width: 2560, height: 1440 });
    expect([s.presetId, s.size]).toEqual(['2560x1440', { width: 2560, height: 1440 }]);
    s.open({ width: 1234, height: 567 });
    expect([s.presetId, s.size]).toEqual([CUSTOM_PRESET_ID, { width: 1234, height: 567 }]);
  });

  it('previews a preset only while one is under the pointer', () => {
    const s = new ExportSettings();
    expect(s.previewPreset).toBeUndefined();
    s.presetPreview = '1080x1920';
    expect(s.previewPreset).toMatchObject({ width: 1080, height: 1920 });
  });
});
