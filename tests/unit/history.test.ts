import { describe, expect, it } from 'vitest';
import { History } from '../../src/ui/history.svelte';

describe('history', () => {
  it('undoes and redoes committed steps', () => {
    const h = new History({ v: 0 });
    h.record({ v: 1 });
    h.commit();
    h.record({ v: 2 });
    h.commit();
    expect(h.undo()).toEqual({ v: 1 });
    expect(h.undo()).toEqual({ v: 0 });
    expect(h.undo()).toBeNull();
    expect(h.redo()).toEqual({ v: 1 });
    expect(h.redo()).toEqual({ v: 2 });
    expect(h.redo()).toBeNull();
  });

  it('collects every change before a commit into one step', () => {
    const h = new History({ v: 0 });
    for (let v = 1; v <= 10; v++) h.record({ v });
    h.commit();
    expect(h.undo()).toEqual({ v: 0 });
    expect(h.canUndo).toBe(false);
  });

  it('undo closes a pending step first', () => {
    const h = new History({ v: 0 });
    h.record({ v: 1 });
    expect(h.canUndo).toBe(true);
    expect(h.undo()).toEqual({ v: 0 });
    expect(h.redo()).toEqual({ v: 1 });
  });

  it('ignores records that change nothing', () => {
    const h = new History({ v: 0 });
    h.record({ v: 1 });
    h.record({ v: 0 });
    h.commit();
    expect(h.canUndo).toBe(false);
  });

  it('a new change drops the redo steps', () => {
    const h = new History({ v: 0 });
    h.record({ v: 1 });
    h.undo();
    expect(h.canRedo).toBe(true);
    h.record({ v: 5 });
    expect(h.canRedo).toBe(false);
    expect(h.redo()).toBeNull();
    expect(h.undo()).toEqual({ v: 0 });
  });

  it('keeps at most the limit of undo steps', () => {
    const h = new History({ v: 0 }, 3);
    for (let v = 1; v <= 5; v++) {
      h.record({ v });
      h.commit();
    }
    expect([h.undo(), h.undo(), h.undo(), h.undo()]).toEqual([{ v: 4 }, { v: 3 }, { v: 2 }, null]);
  });
});
