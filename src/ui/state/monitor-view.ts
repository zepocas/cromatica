import { blockBounds, type Monitor, type Size } from './monitor-layout';

/**
 * How the wallpaper sits under the monitors, which keep their true shape:
 * `span` covers the block at the image's own proportions, cropped on one axis
 * (what the OS "fill" or "span" does); `stretch` bends the image to exactly the
 * block (the preview draws it stretched).
 */
export type Fit = 'span' | 'stretch';

export interface WallpaperRect {
  left: number;
  top: number;
  w: number;
  h: number;
}

export interface Fractions {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function coverRect(monitors: readonly Monitor[], wallpaper: Size): WallpaperRect {
  const b = blockBounds(monitors);
  const scale = Math.max(b.w / wallpaper.w, b.h / wallpaper.h);
  const w = wallpaper.w * scale;
  const h = wallpaper.h * scale;
  return { left: b.left - (w - b.w) / 2, top: b.top - (h - b.h) / 2, w, h };
}

export function stretchRect(monitors: readonly Monitor[]): WallpaperRect {
  return { ...blockBounds(monitors) };
}

/** A monitor as fractions of the wallpaper, which is what the overlay draws. */
export function onWallpaper(m: Monitor, r: WallpaperRect): Fractions {
  return { x: (m.x - r.left) / r.w, y: (m.y - r.top) / r.h, w: m.w / r.w, h: m.h / r.h };
}

/**
 * The wallpaper after the block moved by (dx, dy) over it. It keeps covering the block (or stays inside it when
 * smaller), so the monitors never show a gap the image could fill.
 */
export function slid(monitors: readonly Monitor[], r: WallpaperRect, dx: number, dy: number): WallpaperRect {
  const b = blockBounds(monitors);
  const axis = (start: number, size: number, b0: number, bSize: number, d: number) => {
    const [lo, hi] = size >= bSize ? [b0 + bSize - size, b0] : [b0, b0 + bSize - size];
    return Math.min(hi, Math.max(lo, start - d));
  };
  return { ...r, left: axis(r.left, r.w, b.left, b.w, dx), top: axis(r.top, r.h, b.top, b.h, dy) };
}

/**
 * The wallpaper re-fitted to cover a block it no longer covers: scaled about its own centre, then pushed only
 * as far as covering takes, so the image does not jump to a centre.
 */
export function coverNear(monitors: readonly Monitor[], wallpaper: Size, prev: WallpaperRect): WallpaperRect {
  const b = blockBounds(monitors);
  const scale = Math.max(b.w / wallpaper.w, b.h / wallpaper.h);
  const w = wallpaper.w * scale;
  const h = wallpaper.h * scale;
  const axis = (centre: number, size: number, b0: number, bSize: number) =>
    Math.min(b0, Math.max(b0 + bSize - size, centre - size / 2));
  return {
    left: axis(prev.left + prev.w / 2, w, b.left, b.w),
    top: axis(prev.top + prev.h / 2, h, b.top, b.h),
    w,
    h,
  };
}
