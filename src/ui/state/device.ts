import { MAX_SIZE } from './export-settings.svelte';
import { SIZE_PRESETS } from './presets';

const DESKTOP_PRESETS = SIZE_PRESETS.filter((p) => p.group === 'desktop');

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
 * Where a first visit starts. A phone or tablet gets its own screen, as held. A computer gets the smallest
 * desktop preset that covers its screen in both directions, always landscape: rounding up keeps the wallpaper sharp, so a screen
 * between two presets gets the bigger one (the browser reports the screen the window is on). Past the largest
 * preset it gets the largest.
 */
export function startSize(screen: Size, pixelRatio: number, touch: boolean): Size {
  const own = deviceSize(screen, pixelRatio);
  if (touch) return own;
  const covers = DESKTOP_PRESETS.filter((p) => p.width >= own.width && p.height >= own.height);
  const pick = covers.length
    ? covers.reduce((a, b) => (b.width * b.height < a.width * a.height ? b : a))
    : DESKTOP_PRESETS.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  return { width: pick.width, height: pick.height };
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
