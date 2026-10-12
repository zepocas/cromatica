import type { Oklch } from '../color/types';
import type { Design } from '../design/design';
import { loadDesign, saveDesign, type SavedDesign } from '../design/schema';

// Best-effort like the autosave (D13); each entry is a full save, so the
// schema's migrations apply to favourites too (D45).
export const FAVOURITES_KEY = 'cromatica.favourites';
export const FAVOURITES_LIMIT = 12;

export interface Favourite {
  id: string;
  design: SavedDesign;
}

/** The colors of a design in pattern order, for its swatch strip. */
export function swatchesOf(design: Design): Oklch[] {
  const base = design.base;
  if (base.kind === 'mesh') return base.points.map((p) => p.color);
  if (base.kind === 'grid') return base.nodes.map((n) => n.color);
  if (base.kind === 'planes' || base.kind === 'aurora') return base.colors;
  return base.stops.map((s) => s.color);
}

const keyOf = (design: Design) => JSON.stringify(saveDesign(design).design);

export class Favourites {
  items = $state.raw<Favourite[]>([]);
  /** Set when adding pushed the oldest out; '' otherwise. */
  notice = $state('');

  constructor(private readonly storage: Storage = localStorage) {
    this.items = this.read();
  }

  /** The favourite that is exactly `design`, if any. */
  find(design: Design): Favourite | undefined {
    let key: string;
    try {
      key = keyOf(design);
    } catch {
      return undefined;
    }
    return this.items.find((f) => JSON.stringify(f.design) === key);
  }

  /** The heart: keeps `design`, or lets it go when it is already kept. */
  toggle(design: Design): void {
    const found = this.find(design);
    if (found) this.remove(found.id);
    else this.add(design);
  }

  /** Newest first; past the limit the oldest goes. */
  add(design: Design): void {
    if (this.find(design)) return;
    const item = { id: crypto.randomUUID(), design: saveDesign(design).design };
    const items = [item, ...this.items];
    this.notice = items.length > FAVOURITES_LIMIT ? `kept the newest ${FAVOURITES_LIMIT}; the oldest was dropped` : '';
    this.items = items.slice(0, FAVOURITES_LIMIT);
    this.write();
  }

  remove(id: string): void {
    this.items = this.items.filter((f) => f.id !== id);
    this.notice = '';
    this.write();
  }

  /** Puts back an earlier list, for undo and redo. */
  restore(items: Favourite[]): void {
    this.items = items;
    this.notice = '';
    this.write();
  }

  private read(): Favourite[] {
    try {
      const raw = this.storage.getItem(FAVOURITES_KEY);
      if (raw === null) return [];
      const saved: unknown = JSON.parse(raw);
      if (!Array.isArray(saved)) throw new Error('not a list');
      // One unreadable entry shouldn't cost the others.
      return saved.flatMap((entry: { id?: unknown; save?: unknown }) => {
        try {
          return [{ id: String(entry.id), design: loadDesign(entry.save) }];
        } catch (err) {
          console.warn('favourites: skipping an entry', err);
          return [];
        }
      });
    } catch (err) {
      console.warn('favourites: ignoring the saved list', err);
      return [];
    }
  }

  private write(): void {
    try {
      const entries = this.items.map((f) => ({ id: f.id, save: saveDesign(f.design) }));
      this.storage.setItem(FAVOURITES_KEY, JSON.stringify(entries));
    } catch (err) {
      console.warn('favourites: could not save', err);
    }
  }
}
