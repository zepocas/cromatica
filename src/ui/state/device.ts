import { MAX_SIZE } from './export-settings.svelte';

export interface Size {
  width: number;
  height: number;
}

/** A phone or tablet: the screen is what it is and may be held either way, unlike a desk monitor. */
export function isTouchDevice(platform: string, userAgent: string, touchPoints: number): boolean {
  return /Android|iPhone|iPad|iPod|Mobi/i.test(userAgent) || (/Mac/.test(platform) && touchPoints > 1);
}

/** The screen in device pixels: what a wallpaper for it has to measure. */
export function deviceSize(screen: Size, pixelRatio: number): Size {
  const px = (v: number) => Math.min(MAX_SIZE, Math.max(1, Math.round(v * (pixelRatio || 1))));
  return { width: px(screen.width), height: px(screen.height) };
}

/**
 * The OS context that fits a canvas: a wide one is a desktop screen, a tall one a phone's. The platform picks
 * between the two of each (an iPhone or Mac gets Apple's, anything else Windows or Android).
 */
export function contextForSize(size: Size, platform: string): string {
  const apple = /Mac|iPhone|iPad/.test(platform);
  if (size.width >= size.height) return apple ? 'macos' : 'windows';
  return /iPhone|iPad/.test(platform) || (apple && !/Android/.test(platform)) ? 'ios-home' : 'android-home';
}
