import { describe, expect, it } from 'vitest';
import { createRng, randomSeed } from '../../src/design/random';

const take = (seed: number, n: number) => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.uint32());
};

describe('createRng', () => {
  it('is deterministic for a seed', () => {
    expect(take(42, 50)).toEqual(take(42, 50));
  });

  it('pins the sequence (cross-platform regression)', () => {
    expect(take(1, 4)).toEqual([1130556604, 2591592147, 3014952990, 960850752]);
  });

  it('decorrelates adjacent seeds', () => {
    const a = take(1000, 64);
    const b = take(1001, 64);
    expect(a.filter((x, i) => x === b[i])).toHaveLength(0);
    // First outputs of consecutive seeds should look independent.
    const firsts = Array.from({ length: 1000 }, (_, s) => createRng(s).next());
    const mean = firsts.reduce((s, x) => s + x, 0) / firsts.length;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.04);
  });

  it('produces uniform values in range', () => {
    const rng = createRng(7);
    const bins = new Array(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      bins[Math.floor(x * 10)]++;
    }
    for (const b of bins) expect(Math.abs(b - n / 10)).toBeLessThan(n / 100);
    const mean = Array.from({ length: 20_000 }, () => rng.range(-2, 4)).reduce((s, x) => s + x, 0) / 20_000;
    expect(Math.abs(mean - 1)).toBeLessThan(0.05);
  });

  it('int, pick and range stay in bounds', () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const k = rng.int(7);
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(7);
      seen.add(k);
      expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']));
      const r = rng.range(5, 6);
      expect(r).toBeGreaterThanOrEqual(5);
      expect(r).toBeLessThan(6);
    }
    expect(seen.size).toBe(7);
  });

  it('uint32 returns unsigned 32-bit integers', () => {
    const rng = createRng(0);
    for (let i = 0; i < 1000; i++) {
      const u = rng.uint32();
      expect(Number.isInteger(u)).toBe(true);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('randomSeed', () => {
  it('returns varying uint32 values', () => {
    const seeds = Array.from({ length: 8 }, randomSeed);
    for (const s of seeds) expect(s >>> 0).toBe(s);
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });
});
