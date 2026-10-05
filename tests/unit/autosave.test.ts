import { describe, expect, it } from 'vitest';
import { defaultDesign } from '../../src/design/design';
import { saveDesign } from '../../src/design/schema';
import { AUTOSAVE_KEY, LEGACY_AUTOSAVE_KEY, readAutosave, writeAutosave } from '../../src/ui/autosave';
import { memoryStorage } from './support/storage';

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
