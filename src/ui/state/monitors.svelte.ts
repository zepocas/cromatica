import {
  addMonitor,
  layoutRow,
  placeMonitor,
  removeMonitor,
  resizeMonitor,
  type Bounds,
  blockBounds,
  type Monitor,
  type Size,
} from './monitor-layout';
import { CONTEXT_SCREENS } from '../../context/screens';
import type { PanelUi } from './panel-ui.svelte';
import { coverNear, coverRect, stretchRect, type Fit, type WallpaperRect } from './monitor-view';

export const ASPECTS = [
  { value: '16:9', ratio: 16 / 9 },
  { value: '16:10', ratio: 16 / 10 },
  { value: '21:9', ratio: 43 / 18 },
  { value: '32:9', ratio: 32 / 9 },
  { value: '3:2', ratio: 3 / 2 },
  { value: '4:3', ratio: 4 / 3 },
  { value: '16:18', ratio: 16 / 18 },
] as const;
export type Aspect = (typeof ASPECTS)[number]['value'];

export const MIN_DIAGONAL = 5;
export const MAX_DIAGONAL = 100;
export const MAX_MONITORS = 6;

/** A monitor: its screen (shape and diagonal) and where it sits, in hundredths of an inch. */
export interface Screen extends Monitor {
  aspect: Aspect;
  /** Inches. */
  diagonal: number;
  portrait: boolean;
}

type Spec = Pick<Screen, 'aspect' | 'diagonal' | 'portrait'>;
const DEFAULT_SPEC: Spec = { aspect: '16:9', diagonal: 27, portrait: false };

/** Width and height in hundredths of an inch. */
export function screenSize({ aspect, diagonal, portrait }: Spec): Size {
  const ratio = ASPECTS.find((a) => a.value === aspect)!.ratio;
  const h = diagonal / Math.sqrt(1 + ratio * ratio);
  const size = { w: Math.round(ratio * h * 100), h: Math.round(h * 100) };
  return portrait ? { w: size.h, h: size.w } : size;
}

const withSize = (spec: Spec) => ({ ...spec, ...screenSize(spec) });
const defaultScreens = (): Screen[] => layoutRow([withSize(DEFAULT_SPEC), withSize(DEFAULT_SPEC)]);

/**
 * The multi-monitor preview: a view setting, never part of the design, the export or the autosave.
 * A class instance (not proxied), like the editor.
 */
export class MonitorsState {
  on = $state(false);
  #fit = $state<Fit>('span');
  screens = $state.raw<Screen[]>(defaultScreens());
  /**
   * Where the wallpaper sits in span, once set: moving a monitor never moves it, so the layout can be dragged
   * without the image re-centring. Cleared (re-fitted to the block) when the block's size changes.
   */
  placement = $state.raw<WallpaperRect | null>(null);

  get fit(): Fit {
    return this.#fit;
  }

  /** A phone's screen has no place beside monitors, so turning them on drops a mobile OS context. */
  toggle(ui: PanelUi): void {
    this.on = !this.on;
    if (this.on && CONTEXT_SCREENS.find((s) => s.id === ui.contextId)?.group === 'mobile') ui.contextId = '';
  }

  set fit(fit: Fit) {
    this.#fit = fit;
    this.placement = null;
  }

  rect(wallpaper: Size): WallpaperRect {
    if (this.#fit === 'stretch') return stretchRect(this.screens);
    const p = this.placement;
    return p && Math.abs(p.w / p.h - wallpaper.w / wallpaper.h) < 1e-6 ? p : coverRect(this.screens, wallpaper);
  }

  get canAdd(): boolean {
    return this.screens.length < MAX_MONITORS;
  }

  /** Monitor 1 is the primary: it gets the whole OS context, the others what a secondary screen has. */
  isPrimary(id: number): boolean {
    return this.screens[0]?.id === id;
  }

  place(id: number, x: number, y: number, snap: number, bounds?: Bounds): void {
    this.screens = placeMonitor(this.screens, id, x, y, snap, bounds);
  }

  /**
   * After a move: a block that no longer fits inside the wallpaper (span, e.g. stacked monitors) gets the wallpaper
   * re-fitted to cover it, staying near where it was; otherwise the wallpaper stays put.
   */
  settle(wallpaper: Size): void {
    const p = this.placement;
    if (this.#fit !== 'span' || !p) return;
    const b = blockBounds(this.screens);
    const slack = 0.5;
    const inside =
      b.left >= p.left - slack &&
      b.top >= p.top - slack &&
      b.left + b.w <= p.left + p.w + slack &&
      b.top + b.h <= p.top + p.h + slack;
    if (!inside) this.placement = coverNear(this.screens, wallpaper, p);
  }

  change(id: number, patch: Partial<Spec>): void {
    const current = this.screens.find((s) => s.id === id);
    if (!current) return;
    const spec = { ...current, ...patch };
    this.screens = resizeMonitor(this.screens, id, { ...patch, ...screenSize(spec) });
    this.placement = null;
  }

  add(): void {
    if (!this.canAdd) return;
    this.screens = addMonitor(this.screens, withSize(DEFAULT_SPEC));
    this.placement = null;
  }

  remove(id: number): void {
    if (this.screens.length < 2) return;
    this.screens = removeMonitor(this.screens, id);
    this.placement = null;
  }

  reset(): void {
    this.screens = defaultScreens();
    this.placement = null;
  }
}
