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

describe('autoScale (screen width in CSS px, pixel ratio)', () => {
  it('leaves laptops and 1080p to 1', () => {
    expect(autoScale(1920, 1)).toBe(1);
    expect(autoScale(1280, 1)).toBe(1);
    expect(autoScale(1512, 2)).toBe(1);
    expect(autoScale(1920, 1.25)).toBe(1);
    expect(autoScale(1280, 1.5)).toBe(1);
  });

  it('leaves phones and tablets at 1', () => {
    expect(autoScale(390, 3)).toBe(1);
    expect(autoScale(1366, 2)).toBe(1);
  });

  it('a 4K screen: 1.5 at 100%, 1.15 at 125%, and 1 once the OS scales it to 1080p or less', () => {
    expect(autoScale(3840, 1)).toBe(1.5);
    expect(autoScale(3072, 1.25)).toBe(1.15);
    expect(autoScale(2560, 1.5)).toBe(1);
    expect(autoScale(1920, 2)).toBe(1);
  });

  it('a 1440p screen at 100% gets a small step up', () => {
    expect(autoScale(2560, 1)).toBe(1.15);
  });

  it('is 1 for values that mean nothing', () => {
    expect(autoScale(NaN, 1)).toBe(1);
    expect(autoScale(1920, 0)).toBe(1);
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

  it('keeps the 115% step', () => {
    const storage = memoryStorage();
    writeScaleChoice(1.15, storage);
    expect(readScaleChoice(storage)).toBe(1.15);
  });

  it('ignores a value that is not one of the sizes', () => {
    expect(readScaleChoice(memoryStorage({ [UI_SCALE_KEY]: '7' }))).toBeNull();
    // 200% was dropped: a browser that saved it goes back to auto.
    expect(readScaleChoice(memoryStorage({ [UI_SCALE_KEY]: '2' }))).toBeNull();
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
