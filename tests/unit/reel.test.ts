import { describe, expect, it } from 'vitest';
import { Reel } from '../../src/ui/reel.svelte';

describe('Reel', () => {
  it('steps back to the state before the first shuffle and forward again', () => {
    const reel = new Reel<string>();
    reel.push('start', 'a');
    reel.push('a', 'b');
    expect([reel.position, reel.length]).toEqual([2, 3]);
    expect(reel.step(1, 'b')).toBeNull();
    expect(reel.step(-1, 'b')).toBe('a');
    expect(reel.step(-1, 'a')).toBe('start');
    expect(reel.canBack).toBe(false);
    expect(reel.step(-1, 'start')).toBeNull();
    expect(reel.step(1, 'start')).toBe('a');
  });

  it('keeps edits in the slot being left', () => {
    const reel = new Reel<string>();
    reel.push('start', 'a');
    expect(reel.step(-1, 'a edited')).toBe('start');
    expect(reel.step(1, 'start')).toBe('a edited');
  });

  it('puts a shuffle made from an earlier slot at the end, keeping the rest', () => {
    const reel = new Reel<string>();
    reel.push('start', 'a');
    reel.push('a', 'b');
    reel.step(-1, 'b');
    reel.push('a edited', 'c');
    expect([reel.position, reel.length]).toEqual([3, 4]);
    expect(reel.step(-1, 'c')).toBe('b');
    expect(reel.step(-1, 'b')).toBe('a edited');
  });

  it('drops the oldest past the limit', () => {
    const reel = new Reel<number>(3);
    for (let i = 0; i < 5; i++) reel.push(i, i + 1);
    expect(reel.length).toBe(3);
    expect(reel.step(-1, 5)).toBe(4);
    expect(reel.step(-1, 4)).toBe(3);
    expect(reel.step(-1, 3)).toBeNull();
  });
});
