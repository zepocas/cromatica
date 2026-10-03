import type { Rng } from './shuffle.types';

// splitmix32: one step of a strong integer mixer, used to spread the user seed
// across sfc32's 128-bit state so that adjacent seeds give unrelated sequences.
function splitmix32(state: number): [value: number, next: number] {
  const next = (state + 0x9e3779b9) | 0;
  let z = next;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  z ^= z >>> 15;
  return [z >>> 0, next];
}

/** sfc32 seeded through splitmix32. Pure 32-bit integer math, so identical everywhere. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const state: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [v, n] = splitmix32(s);
    state.push(v);
    s = n;
  }
  let [a, b, c, d] = state;

  const uint32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  // Warm-up discards the weakly mixed first outputs.
  for (let i = 0; i < 12; i++) uint32();

  const next = () => uint32() / 4294967296;
  return {
    next,
    uint32,
    range: (min, max) => min + (max - min) * next(),
    int: (n) => Math.floor(next() * n),
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}
