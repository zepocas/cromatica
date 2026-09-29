import { describe, expect, it } from 'vitest';
import { BLUE_NOISE_SIZE, DITHER_CHANNEL_OFFSETS, blueNoiseRanks } from '../../src/engine/blue-noise';

const N = BLUE_NOISE_SIZE;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Zero-mean values in [-0.5, 0.5) from ranks. */
function centered(ranks: ArrayLike<number>): Float64Array {
  const n = ranks.length;
  return Float64Array.from({ length: n }, (_, i) => (ranks[i] + 0.5) / n - 0.5);
}

/** Power spectrum of a periodic N×N signal (separable DFT). */
function powerSpectrum(values: Float64Array): Float64Array {
  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);
  const cos = Float64Array.from({ length: N }, (_, k) => Math.cos((2 * Math.PI * k) / N));
  const sin = Float64Array.from({ length: N }, (_, k) => Math.sin((2 * Math.PI * k) / N));
  // Rows.
  const rRe = new Float64Array(N * N);
  const rIm = new Float64Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let u = 0; u < N; u++) {
      let sr = 0;
      let si = 0;
      for (let x = 0; x < N; x++) {
        const k = (u * x) % N;
        const v = values[y * N + x];
        sr += v * cos[k];
        si -= v * sin[k];
      }
      rRe[y * N + u] = sr;
      rIm[y * N + u] = si;
    }
  }
  // Columns.
  for (let u = 0; u < N; u++) {
    for (let w = 0; w < N; w++) {
      let sr = 0;
      let si = 0;
      for (let y = 0; y < N; y++) {
        const k = (w * y) % N;
        const a = rRe[y * N + u];
        const b = rIm[y * N + u];
        sr += a * cos[k] + b * sin[k];
        si += b * cos[k] - a * sin[k];
      }
      re[w * N + u] = sr;
      im[w * N + u] = si;
    }
  }
  return Float64Array.from({ length: N * N }, (_, i) => re[i] * re[i] + im[i] * im[i]);
}

/** Mean power over non-DC frequencies with radius < r (in cycles per tile). */
function lowFrequencyPower(values: Float64Array, r: number): number {
  const p = powerSpectrum(values);
  let sum = 0;
  let count = 0;
  for (let w = 0; w < N; w++) {
    for (let u = 0; u < N; u++) {
      const fu = Math.min(u, N - u);
      const fw = Math.min(w, N - w);
      const f = Math.hypot(fu, fw);
      if (f > 0 && f < r) {
        sum += p[w * N + u];
        count++;
      }
    }
  }
  return sum / count;
}

describe('blue noise', () => {
  const ranks = blueNoiseRanks();

  it('is a permutation (uniform histogram)', () => {
    expect(ranks.length).toBe(N * N);
    const seen = new Uint8Array(N * N);
    for (const r of ranks) seen[r]++;
    expect(seen.every((c) => c === 1)).toBe(true);
  });

  it('has little low-frequency energy compared to white noise', () => {
    const random = mulberry32(1);
    const white = Array.from({ length: N * N }, (_, i) => i);
    for (let i = white.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [white[i], white[j]] = [white[j], white[i]];
    }
    const radius = N / 8;
    const blue = lowFrequencyPower(centered(ranks), radius);
    const reference = lowFrequencyPower(centered(white), radius);
    // Expected white-noise power per bin is N² · variance = N² / 12.
    const expected = (N * N) / 12;
    console.log(
      `low-frequency power (r < ${radius}): blue ${blue.toFixed(2)}, white ${reference.toFixed(2)}, ` +
        `expected white ${expected.toFixed(2)}, ratio ${(blue / expected).toFixed(4)}`,
    );
    expect(reference / expected).toBeGreaterThan(0.7);
    expect(blue / expected).toBeLessThan(0.05);
  });

  it('channel offsets are decorrelated', () => {
    const v = centered(ranks);
    const variance = v.reduce((s, x) => s + x * x, 0) / v.length;
    for (let a = 0; a < 3; a++) {
      for (let b = a + 1; b < 3; b++) {
        const dx = DITHER_CHANNEL_OFFSETS[b][0] - DITHER_CHANNEL_OFFSETS[a][0];
        const dy = DITHER_CHANNEL_OFFSETS[b][1] - DITHER_CHANNEL_OFFSETS[a][1];
        let s = 0;
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            s += v[y * N + x] * v[((y + dy + N) % N) * N + ((x + dx + N) % N)];
          }
        }
        const correlation = s / v.length / variance;
        expect(Math.abs(correlation)).toBeLessThan(0.05);
      }
    }
  });
});
