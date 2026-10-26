import { describe, expect, it } from 'vitest';
import { contextForSize, deviceSize, isTouchDevice, startSize } from '../../src/ui/state/device';

describe('deviceSize', () => {
  it('scales the screen by the pixel ratio', () => {
    expect(deviceSize({ width: 1512, height: 982 }, 2)).toEqual({ width: 3024, height: 1964 });
  });

  it('treats a missing ratio as 1 and stays inside the export limit', () => {
    expect(deviceSize({ width: 1920, height: 1080 }, 0)).toEqual({ width: 1920, height: 1080 });
    expect(deviceSize({ width: 9000, height: 9000 }, 3)).toEqual({ width: 16384, height: 16384 });
  });
});

describe('contextForSize', () => {
  it('gives wide canvases a desktop screen for the platform', () => {
    expect(contextForSize({ width: 3024, height: 1964 }, 'MacIntel')).toBe('macos');
    expect(contextForSize({ width: 1920, height: 1080 }, 'Win32')).toBe('windows');
    expect(contextForSize({ width: 1080, height: 1080 }, 'Linux x86_64')).toBe('windows');
  });

  it('gives tall canvases a phone screen for the platform', () => {
    expect(contextForSize({ width: 1170, height: 2532 }, 'iPhone')).toBe('ios-home');
    expect(contextForSize({ width: 1080, height: 2400 }, 'Linux armv8l')).toBe('android-home');
  });
});

describe('startSize', () => {
  it('rounds a screen between two presets up, never down', () => {
    expect(startSize({ width: 2304, height: 1296 }, 1, false)).toEqual({ width: 2560, height: 1440 });
    expect(startSize({ width: 1366, height: 768 }, 1, false)).toEqual({ width: 1920, height: 1080 });
    expect(startSize({ width: 3200, height: 1800 }, 1, false)).toEqual({ width: 3456, height: 2234 });
    expect(startSize({ width: 7680, height: 4320 }, 1, false)).toEqual({ width: 6016, height: 3384 });
  });

  it('gives a computer the desktop preset that matches its screen, always landscape', () => {
    expect(startSize({ width: 1512, height: 982 }, 2, false)).toEqual({ width: 3024, height: 1964 });
    expect(startSize({ width: 1920, height: 1080 }, 1, false)).toEqual({ width: 1920, height: 1080 });
    expect(startSize({ width: 3840, height: 2160 }, 1, false)).toEqual({ width: 3840, height: 2160 });
    expect(startSize({ width: 1080, height: 1920 }, 1, false).width).toBeGreaterThan(1080);
  });

  it('gives a phone or tablet its own screen, as held', () => {
    expect(startSize({ width: 390, height: 844 }, 3, true)).toEqual({ width: 1170, height: 2532 });
  });
});

describe('isTouchDevice', () => {
  it('knows phones, Android tablets and iPads that pose as Macs', () => {
    expect(isTouchDevice('iPhone', 'Mozilla/5.0 (iPhone)', 5)).toBe(true);
    expect(isTouchDevice('Linux armv8l', 'Mozilla/5.0 (Linux; Android 14)', 5)).toBe(true);
    expect(isTouchDevice('MacIntel', 'Mozilla/5.0 (Macintosh)', 5)).toBe(true);
    expect(isTouchDevice('MacIntel', 'Mozilla/5.0 (Macintosh)', 0)).toBe(false);
    expect(isTouchDevice('Win32', 'Mozilla/5.0 (Windows NT 10.0)', 10)).toBe(false);
  });
});
