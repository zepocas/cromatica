import { describe, expect, it } from 'vitest';
import type { Oklch } from '../../src/color/types';
import { EditorState } from '../../src/ui/state/editor.svelte';
import { SAVED_PALETTES_KEY, SAVED_PALETTES_LIMIT, SavedPalettes } from '../../src/ui/state/saved-palettes.svelte';
import { memoryStorage } from './support/storage';

const fresh = () => new EditorState({ shuffle: false });
const gray = (l: number): Oklch => [l, 0, 0];
const five: Oklch[] = [0.1, 0.3, 0.5, 0.7, 0.9].map(gray);

describe('SavedPalettes', () => {
  it('survives a reload, newest first, and finds a palette whatever its order', () => {
    const storage = memoryStorage();
    const saved = new SavedPalettes(storage);
    saved.add([gray(0.2), gray(0.4)]);
    saved.add(five);
    saved.add([...five].reverse());
    const reloaded = new SavedPalettes(storage);
    expect(reloaded.items.map((p) => p.colors)).toEqual([five, [gray(0.2), gray(0.4)]]);
    expect(reloaded.find([gray(0.4), gray(0.2), gray(0.4)])).toBe(reloaded.items[1]);
    expect(reloaded.find([gray(0.3)])).toBeUndefined();
  });

  it('keeps the newest past the limit, toggles off, and skips bad entries', () => {
    const storage = memoryStorage();
    const saved = new SavedPalettes(storage);
    for (let i = 0; i <= SAVED_PALETTES_LIMIT; i++) saved.add([gray(i / 100), gray(0.9)]);
    expect(saved.items).toHaveLength(SAVED_PALETTES_LIMIT);
    expect(saved.find([gray(0), gray(0.9)])).toBeUndefined();
    expect(saved.notice).not.toBe('');
    saved.toggle([gray(0.01), gray(0.9)]);
    expect(saved.items).toHaveLength(SAVED_PALETTES_LIMIT - 1);
    const entries = JSON.parse(storage.getItem(SAVED_PALETTES_KEY)!);
    storage.setItem(SAVED_PALETTES_KEY, JSON.stringify([{ id: 'x', colors: [[1, 'a', 0]] }, ...entries]));
    expect(new SavedPalettes(storage).items).toHaveLength(SAVED_PALETTES_LIMIT - 1);
    storage.setItem(SAVED_PALETTES_KEY, 'not json');
    expect(new SavedPalettes(storage).items).toEqual([]);
  });
});

describe('EditorState.applyPalette', () => {
  it('gives a pattern its own colors back exactly, in every kind', () => {
    for (const kind of ['mesh', 'grid', 'linear', 'planes'] as const) {
      const e = fresh();
      e.kind = kind;
      const before = e.paletteColors;
      const design = JSON.stringify(e.design);
      e.applyPalette(five);
      e.applyPalette(before);
      expect(JSON.stringify(e.design), kind).toBe(design);
    }
  });

  it('follows the palette size on a mesh and keeps the points it has', () => {
    const e = fresh();
    e.kind = 'mesh';
    const first = { ...e.mesh.points[0] };
    e.applyPalette(five);
    expect(e.paletteColors).toEqual(five);
    expect(e.mesh.points[0]).toMatchObject({ x: first.x, y: first.y, radius: first.radius });
    e.applyPalette(five.slice(0, 2));
    expect(e.mesh.points).toHaveLength(2);
  });

  it('respaces stops by position and deals a grid without changing its nodes', () => {
    const e = fresh();
    e.kind = 'linear';
    e.applyPalette(five);
    expect(e.ramp.stops.map((s) => s.position)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(e.paletteColors).toEqual(five);
    e.kind = 'grid';
    const nodes = e.grid.nodes.length;
    e.applyPalette(five.slice(0, 3));
    expect(e.grid.nodes).toHaveLength(nodes);
    expect(new Set(e.paletteColors.map((c) => c[0]))).toEqual(new Set([0.1, 0.3, 0.5]));
  });

  it('makes the palette custom', () => {
    const e = new EditorState();
    e.applyPalette(five);
    expect(e.palette.info).toBeNull();
  });
});
