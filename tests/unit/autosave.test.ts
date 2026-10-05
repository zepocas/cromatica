import { describe, expect, it } from 'vitest';
import { defaultDesign } from '../../src/design/design';
import { saveDesign } from '../../src/design/schema';
import { AUTOSAVE_KEY, LEGACY_AUTOSAVE_KEY, readAutosave, writeAutosave } from '../../src/ui/autosave';

function memoryStorage(entries: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('autosave', () => {
  const saved = JSON.stringify(saveDesign(defaultDesign));

  it('reads a save left under the key from before the rename, and moves it on the next write', () => {
    const storage = memoryStorage({ [LEGACY_AUTOSAVE_KEY]: saved });
    expect(readAutosave(storage)).toEqual(saveDesign(defaultDesign).design);
    writeAutosave(defaultDesign, storage);
    expect(storage.getItem(AUTOSAVE_KEY)).toBe(saved);
    expect(storage.getItem(LEGACY_AUTOSAVE_KEY)).toBeNull();
  });

  it('prefers the current key', () => {
    const storage = memoryStorage({ [LEGACY_AUTOSAVE_KEY]: '{"version":99}', [AUTOSAVE_KEY]: saved });
    expect(readAutosave(storage)).toEqual(saveDesign(defaultDesign).design);
  });
});
