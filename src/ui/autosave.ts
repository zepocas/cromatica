import type { Design } from '../design/design';
import { loadDesign, saveDesign, type SavedDesign } from '../design/schema';

// Best-effort (D13): a failed read or write only costs the saved copy.
export const AUTOSAVE_KEY = 'cromatica.design';
// The key before the rename (D49); read when there's no save under the new one.
export const LEGACY_AUTOSAVE_KEY = 'wallpaper.design';

/** The autosaved design, or null on a first visit or when it can't be read. */
export function readAutosave(storage: Storage = localStorage): SavedDesign | null {
  try {
    const raw = storage.getItem(AUTOSAVE_KEY) ?? storage.getItem(LEGACY_AUTOSAVE_KEY);
    return raw === null ? null : loadDesign(JSON.parse(raw));
  } catch (err) {
    console.warn('autosave: ignoring the saved design', err);
    return null;
  }
}

export function writeAutosave(design: Design, storage: Storage = localStorage): void {
  try {
    storage.setItem(AUTOSAVE_KEY, JSON.stringify(saveDesign(design)));
    storage.removeItem(LEGACY_AUTOSAVE_KEY);
  } catch (err) {
    console.warn('autosave: could not save the design', err);
  }
}
