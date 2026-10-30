import { describe, expect, it } from 'vitest';
import {
  applyScale,
  autoScale,
  currentScale,
  readScaleChoice,
  UI_SCALE_KEY,
  writeScaleChoice,
} from '../../src/ui/state/ui-scale';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  } as Storage;
}

describe('autoScale', () => {
  it('leaves laptops and 1080p to 1', () => {
    for (const w of [800, 1280, 1512, 1920, 2399]) expect(autoScale(w)).toBe(1);
  });

  it('steps up for a window that is drawn 1:1 on a big screen', () => {
    expect(autoScale(2560)).toBe(1.25);
    expect(autoScale(3199)).toBe(1.25);
    expect(autoScale(3840)).toBe(1.5);
  });
});

describe('the saved choice', () => {
  it('round-trips, and null clears it', () => {
    const storage = memoryStorage();
    writeScaleChoice(0.75, storage);
    expect(readScaleChoice(storage)).toBe(0.75);
    writeScaleChoice(null, storage);
    expect(storage.getItem(UI_SCALE_KEY)).toBeNull();
    expect(readScaleChoice(storage)).toBeNull();
  });

  it('ignores a value that is not one of the sizes', () => {
    expect(readScaleChoice(memoryStorage({ [UI_SCALE_KEY]: '7' }))).toBeNull();
    expect(readScaleChoice(memoryStorage({ [UI_SCALE_KEY]: 'big' }))).toBeNull();
  });
});

describe('applyScale', () => {
  it('sets zoom, the css variable and the value the preview reads; 1 leaves no zoom', () => {
    const root = {
      dataset: {} as Record<string, string>,
      style: {
        zoom: '',
        setProperty(k: string, v: string) {
          this[k as 'zoom'] = v;
        },
      },
    } as unknown as HTMLElement;
    applyScale(1.5, root);
    expect(root.style.zoom).toBe('1.5');
    expect(currentScale(root)).toBe(1.5);
    applyScale(1, root);
    expect(root.style.zoom).toBe('');
    expect(currentScale(root)).toBe(1);
  });
});
