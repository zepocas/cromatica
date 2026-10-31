// The panel's size, like browser zoom but remembered by the app (best-effort, D13).
export const UI_SCALE_KEY = 'cromatica.ui-scale';

export const UI_SCALES = [0.75, 1, 1.25, 1.5, 2] as const;
export type UiScale = (typeof UI_SCALES)[number];

/** `null` = follow the window width. */
export type UiScaleChoice = UiScale | null;

/**
 * Width in CSS px, so browser zoom and the OS scale are already in it: a 4K screen the OS scales to 1080p
 * stays at 1, and only one drawn 1:1 (a 3840 window) gets bigger. Laptops and 1080p are below the first step.
 */
export function autoScale(innerWidth: number): UiScale {
  if (innerWidth >= 3200) return 1.5;
  if (innerWidth >= 2400) return 1.25;
  return 1;
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

/** Auto reads the window width, which element zoom leaves unchanged. */
export function chooseScale(choice: UiScaleChoice, storage: Storage = localStorage): void {
  writeScaleChoice(choice, storage);
  applyScale(choice ?? autoScale(innerWidth));
}

export function applyScale(scale: number, root: HTMLElement = document.documentElement): void {
  root.dataset.uiScale = String(scale);
  root.style.zoom = scale === 1 ? '' : String(scale);
  root.style.setProperty('--ui-scale', String(scale));
}
