import { describe, expect, it } from 'vitest';
import { ExportSettings, MAX_SIZE } from '../../src/ui/state/export-settings.svelte';
import { CUSTOM_PRESET_ID, DEFAULT_PRESET_ID, SCREEN_PRESET_ID } from '../../src/ui/state/presets';

describe('export settings', () => {
  it('starts on the default preset', () => {
    const s = new ExportSettings();
    expect([s.presetId, s.size, s.format]).toEqual([DEFAULT_PRESET_ID, { width: 5120, height: 2880 }, 'jpeg']);
  });

  it('starts on this screen when the device is known, and can come back to it', () => {
    const s = new ExportSettings({ screen: { width: 2880, height: 1864 } });
    expect([s.presetId, s.size]).toEqual([SCREEN_PRESET_ID, { width: 2880, height: 1864 }]);
    s.choosePreset(DEFAULT_PRESET_ID);
    expect(s.size).toEqual({ width: 5120, height: 2880 });
    s.open({ width: 2880, height: 1864 });
    expect(s.presetId).toBe(SCREEN_PRESET_ID);
    s.presetPreview = SCREEN_PRESET_ID;
    expect(s.previewPreset).toEqual({ width: 2880, height: 1864 });
  });

  it('has no screen option where the device is not read', () => {
    const s = new ExportSettings();
    expect(s.screen).toBeNull();
    s.presetPreview = SCREEN_PRESET_ID;
    expect(s.previewPreset).toBeUndefined();
  });

  it('starts "custom" from the size shown, not from the last custom one', () => {
    const s = new ExportSettings();
    s.choosePreset(CUSTOM_PRESET_ID);
    expect(s.size).toEqual({ width: 5120, height: 2880 });
  });

  it('typing one side keeps the other, rounds and clamps, and switches to custom', () => {
    const s = new ExportSettings();
    s.setCustom('width', 1000.4);
    expect([s.presetId, s.size]).toEqual([CUSTOM_PRESET_ID, { width: 1000, height: 2880 }]);
    s.setCustom('height', 10 * MAX_SIZE);
    expect(s.size.height).toBe(MAX_SIZE);
    s.setCustom('width', Number.NaN);
    expect(s.size.width).toBe(1);
  });

  it('reopening a size picks its preset, or becomes the custom size', () => {
    const s = new ExportSettings();
    s.open({ width: 3840, height: 2400 });
    expect([s.presetId, s.size]).toEqual(['3840x2400', { width: 3840, height: 2400 }]);
    s.open({ width: 1234, height: 567 });
    expect([s.presetId, s.size]).toEqual([CUSTOM_PRESET_ID, { width: 1234, height: 567 }]);
  });

  it('previews a preset only while one is under the pointer', () => {
    const s = new ExportSettings();
    expect(s.previewPreset).toBeUndefined();
    s.presetPreview = '1440x2560';
    expect(s.previewPreset).toMatchObject({ width: 1440, height: 2560 });
  });
});
