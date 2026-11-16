import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from '../../src/ui/state/id';

describe('newId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is unique', () => {
    expect(newId()).not.toBe(newId());
  });

  it('still works when randomUUID is missing (plain HTTP)', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const id = newId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(newId()).not.toBe(id);
  });
});
