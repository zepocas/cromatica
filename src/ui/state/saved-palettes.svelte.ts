import type { Oklch } from '../../color/types';

// Colors only, local and small (D13, D116): a palette is a few numbers, not a design.
export const SAVED_PALETTES_KEY = 'cromatica.palettes';
export const SAVED_PALETTES_LIMIT = 12;
const MAX_COLORS = 25;

export interface SavedPalette {
  id: string;
  colors: Oklch[];
}

const round = (v: number) => Math.round(v * 1e4) / 1e4;
const tidy = (colors: readonly Oklch[]): Oklch[] => colors.map((c) => [round(c[0]), round(c[1]), round(c[2])]);

/** The same set of colors, whatever their order or repeats, so a grid's dealt nodes still match. */
const keyOf = (colors: readonly Oklch[]) => [...new Set(tidy(colors).map((c) => c.join(',')))].sort().join('|');

const isColor = (c: unknown): c is Oklch =>
  Array.isArray(c) && c.length === 3 && c.every((v) => typeof v === 'number' && Number.isFinite(v));

export class SavedPalettes {
  items = $state.raw<SavedPalette[]>([]);
  /** Set when adding pushed the oldest out; '' otherwise. */
  notice = $state('');

  constructor(private readonly storage: Storage = localStorage) {
    this.items = this.read();
  }

  find(colors: readonly Oklch[]): SavedPalette | undefined {
    const key = keyOf(colors);
    return this.items.find((p) => keyOf(p.colors) === key);
  }

  toggle(colors: readonly Oklch[]): void {
    const found = this.find(colors);
    if (found) this.remove(found.id);
    else this.add(colors);
  }

  /** Newest first; past the limit the oldest goes. */
  add(colors: readonly Oklch[]): void {
    if (colors.length === 0 || this.find(colors)) return;
    const items = [{ id: crypto.randomUUID(), colors: tidy(colors.slice(0, MAX_COLORS)) }, ...this.items];
    this.notice =
      items.length > SAVED_PALETTES_LIMIT ? `kept the newest ${SAVED_PALETTES_LIMIT}; the oldest was dropped` : '';
    this.items = items.slice(0, SAVED_PALETTES_LIMIT);
    this.write();
  }

  remove(id: string): void {
    this.items = this.items.filter((p) => p.id !== id);
    this.notice = '';
    this.write();
  }

  restore(items: SavedPalette[]): void {
    this.items = items;
    this.notice = '';
    this.write();
  }

  private read(): SavedPalette[] {
    try {
      const raw = this.storage.getItem(SAVED_PALETTES_KEY);
      if (raw === null) return [];
      const saved: unknown = JSON.parse(raw);
      if (!Array.isArray(saved)) throw new Error('not a list');
      return saved.flatMap((entry: { id?: unknown; colors?: unknown }) => {
        const colors = entry?.colors;
        if (!Array.isArray(colors) || colors.length === 0 || !colors.every(isColor)) return [];
        return [{ id: String(entry.id), colors: tidy(colors.slice(0, MAX_COLORS)) }];
      });
    } catch (err) {
      console.warn('saved palettes: ignoring the saved list', err);
      return [];
    }
  }

  private write(): void {
    try {
      this.storage.setItem(SAVED_PALETTES_KEY, JSON.stringify(this.items));
    } catch (err) {
      console.warn('saved palettes: could not save', err);
    }
  }
}
