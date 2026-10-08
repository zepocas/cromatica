import type { ZoneRect } from './legibility';

/** `area`: no fill, for text drawn straight on the wallpaper (the macOS menu bar since 26). */
export type ZoneKind = 'area' | 'bar' | 'cutout' | 'clock' | 'text' | 'icons' | 'widget' | 'dock' | 'indicator';

/** A rectangle in the device's points, measured from the anchored edges. */
export interface Zone {
  kind: ZoneKind;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** `stretch` spans the frame's width and ignores x and w. */
  anchorX?: 'left' | 'center' | 'right' | 'stretch';
  anchorY?: 'top' | 'bottom';
  radius?: number;
  /** An icon grid: `icon`-point squares on an even cols × rows layout filling the rect. */
  grid?: { cols: number; rows: number; icon: number };
  /** Sample text filling the zone's height, one line per `\n`, e.g. a clock. */
  text?: string;
  align?: 'left' | 'center' | 'right';
  /** Text sits on the wallpaper here, so the legibility check reads this zone. */
  check?: boolean;
}

export interface ContextScreen {
  id: string;
  label: string;
  group: 'desktop' | 'mobile';
  /** Where the zones were measured; they change between OS releases (D48). */
  os: string;
  device: string;
  /** Screen size in points. */
  width: number;
  height: number;
  zones: Zone[];
}

/**
 * A zone's rect as fractions of a frame of `aspect` (width / height). The
 * device's height fills the frame's, like the image (D4); a wider or narrower
 * frame moves zones with their anchored edges.
 */
export function placeZone(screen: ContextScreen, zone: Zone, aspect: number): ZoneRect {
  const width = aspect * screen.height;
  const top = zone.anchorY === 'bottom' ? screen.height - zone.y - zone.h : zone.y;
  if (zone.anchorX === 'stretch') return { x: 0, y: top / screen.height, w: 1, h: zone.h / screen.height };
  const left =
    zone.anchorX === 'right'
      ? width - zone.x - zone.w
      : zone.anchorX === 'center'
        ? width / 2 + zone.x - zone.w / 2
        : zone.x;
  return { x: left / width, y: top / screen.height, w: zone.w / width, h: zone.h / screen.height };
}
