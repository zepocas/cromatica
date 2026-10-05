import { describe, expect, it } from 'vitest';
import { defaultDesign, defaultMesh, type Design } from '../../src/design/design';
import { saveDesign } from '../../src/design/schema';
import { shuffleDesign } from '../../src/design/shuffle';
import { FAVOURITES_KEY, FAVOURITES_LIMIT, Favourites, swatchesOf } from '../../src/ui/favourites.svelte';
import { memoryStorage } from './support/storage';

const designs = (n: number): Design[] => {
  const out: Design[] = [];
  let d: Design = { ...defaultDesign, base: defaultMesh };
  for (let seed = 1; out.length < n; seed++) {
    d = shuffleDesign(d, { colors: true, layout: true, style: true, seed }).design;
    out.push(d);
  }
  return out;
};

describe('Favourites', () => {
  it('survives a reload, newest first, and finds the current design', () => {
    const storage = memoryStorage();
    const [a, b] = designs(2);
    const favs = new Favourites(storage);
    favs.add(a);
    favs.add(b);
    favs.add(b);
    const reloaded = new Favourites(storage);
    expect(reloaded.items.map((f) => f.design)).toEqual([saveDesign(b).design, saveDesign(a).design]);
    expect(reloaded.find(a)).toBe(reloaded.items[1]);
    expect(reloaded.find(defaultDesign)).toBeUndefined();
  });

  it('keeps the newest ones past the limit and says so', () => {
    const favs = new Favourites(memoryStorage());
    const all = designs(FAVOURITES_LIMIT + 1);
    for (const d of all) favs.add(d);
    expect(favs.items).toHaveLength(FAVOURITES_LIMIT);
    expect(favs.find(all[0])).toBeUndefined();
    expect(favs.notice).not.toBe('');
  });

  it('removes one and skips unreadable entries', () => {
    const storage = memoryStorage();
    const favs = new Favourites(storage);
    const [a, b] = designs(2);
    favs.add(a);
    favs.add(b);
    favs.remove(favs.items[0].id);
    const entries = JSON.parse(storage.getItem(FAVOURITES_KEY)!);
    storage.setItem(FAVOURITES_KEY, JSON.stringify([{ id: 'x', save: { version: 99 } }, ...entries]));
    expect(new Favourites(storage).items.map((f) => f.design)).toEqual([saveDesign(a).design]);
    storage.setItem(FAVOURITES_KEY, 'not json');
    expect(new Favourites(storage).items).toEqual([]);
  });

  it('gives every kind of design a swatch strip', () => {
    for (const d of designs(40)) expect(swatchesOf(d).length).toBeGreaterThan(0);
  });
});
