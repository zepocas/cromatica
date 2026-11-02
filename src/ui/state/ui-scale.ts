// The panel's size, like browser zoom but remembered by the app (best-effort, D13).
export const UI_SCALE_KEY = 'cromatica.ui-scale';

export const UI_SCALES = [0.75, 1, 1.15, 1.25, 1.5] as const;
export type UiScale = (typeof UI_SCALES)[number];

/** `null` = follow the window width. */
export type UiScaleChoice = UiScale | null;

/** The screen width the UI was drawn for: 1080p at an OS scale of 1. */
const REFERENCE_WIDTH = 1920;
/** What auto may pick; 75% is for a hand pick. */
const AUTO_STEPS = [1, 1.15, 1.25, 1.5] as const;

/**
 * From the screen, not the window, so un-maximizing it doesn't change the size. The apparent size grows with the
 * screen's physical width like the square root of it (a bigger monitor is seen from about the same distance, so
 * more pixels need larger controls, but less than in proportion); the OS scale (and browser zoom) already
 * supplies part of that, so it is divided out. Snapped to the nearest step and never below 1: 1080p and laptops
 * stay at 1, a 4K at 125% gets 1.15, a 4K at 100% gets 1.5, and a 4K the OS scales to 1080p stays at 1.
 * `screenWidth` is in CSS px (`screen.width`), so with the pixel ratio it gives the physical width.
 */
export function autoScale(screenWidth: number, pixelRatio: number): UiScale {
  const target = Math.sqrt((screenWidth * pixelRatio) / REFERENCE_WIDTH) / pixelRatio;
  if (!(target > 1)) return 1;
  return AUTO_STEPS.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best));
}

export function readScaleChoice(storage: Storage = localStorage): UiScaleChoice {
  try {
    const n = Number(storage.getItem(UI_SCALE_KEY));
    return UI_SCALES.find((s) => s === n) ?? null;
  } catch {
    return null;
  }
}

export function writeScaleChoice(choice: UiScaleChoice, storage: Storage = localStorage): void {
  try {
    if (choice === null) storage.removeItem(UI_SCALE_KEY);
    else storage.setItem(UI_SCALE_KEY, String(choice));
  } catch {
    // Back to auto next visit; nothing else is lost.
  }
}

/**
 * The scale in effect, set on the root element as CSS `zoom`. Under it pointer events and `getBoundingClientRect`
 * stay in screen px while layout, `left`/`top` and vw/vh scale with it, so a screen position that is applied as a
 * length, and a pointer delta that moves something, is divided by this; ratios of two screen values need nothing.
 * The preview also reads it to keep its buffer sharp.
 */
export function currentScale(root: HTMLElement = document.documentElement): number {
  return Number(root.dataset.uiScale) || 1;
}

/** Auto reads the screen, which element zoom leaves unchanged. */
export function chooseScale(choice: UiScaleChoice, storage: Storage = localStorage): void {
  writeScaleChoice(choice, storage);
  applyScale(choice ?? autoScale(screen.width, devicePixelRatio));
}

export function applyScale(scale: number, root: HTMLElement = document.documentElement): void {
  root.dataset.uiScale = String(scale);
  root.style.zoom = scale === 1 ? '' : String(scale);
  root.style.setProperty('--ui-scale', String(scale));
}
