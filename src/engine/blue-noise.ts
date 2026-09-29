import { BLUE_NOISE_RANKS_BASE64, BLUE_NOISE_SIZE } from './blue-noise.generated';

export { BLUE_NOISE_SIZE };

/**
 * Per-channel (R, G, B) offsets into the blue-noise tile. Blue noise has
 * ~zero autocorrelation at large lags, so shifted copies decorrelate the
 * channels (no colored dither structure) while each stays blue.
 */
export const DITHER_CHANNEL_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [21, 43],
  [43, 21],
];

let ranks: Uint16Array | undefined;

/** Void-and-cluster ranks, a permutation of 0..SIZE²-1, row-major. */
export function blueNoiseRanks(): Uint16Array {
  if (!ranks) {
    const bin = atob(BLUE_NOISE_RANKS_BASE64);
    ranks = new Uint16Array(bin.length / 2);
    for (let i = 0; i < ranks.length; i++) {
      ranks[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    }
  }
  return ranks;
}
