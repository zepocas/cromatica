import type { OutputSize, Tile } from '../engine/types';

function assertPositiveInt(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer, got ${value}`);
  }
}

/** Throws unless both dimensions are positive integers. */
export function assertOutputSize(output: OutputSize): void {
  assertPositiveInt('output.width', output.width);
  assertPositiveInt('output.height', output.height);
}

/**
 * Split `output` into bands (top→bottom) of tiles (left→right). Every tile
 * is at most tileSize × tileSize; the last column/band holds the remainder.
 * Tiles in a band share y and height, and the tiles cover the output exactly.
 */
export function planTiles(output: OutputSize, tileSize: number): Tile[][] {
  assertOutputSize(output);
  assertPositiveInt('tileSize', tileSize);

  const bands: Tile[][] = [];
  for (let y = 0; y < output.height; y += tileSize) {
    const height = Math.min(tileSize, output.height - y);
    const band: Tile[] = [];
    for (let x = 0; x < output.width; x += tileSize) {
      band.push({ x, y, width: Math.min(tileSize, output.width - x), height });
    }
    bands.push(band);
  }
  return bands;
}
