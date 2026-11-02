import { describe, expect, it } from 'vitest';
import { contextForSize, deviceSize } from '../../src/ui/state/device';

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
