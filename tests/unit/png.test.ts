import { decode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import { createPngEncoder } from '../../src/export/png';

// Independent bitwise CRC32 so the test doesn't share the encoder's table.
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface Chunk {
  type: string;
  data: Uint8Array;
}

function parseChunks(png: Uint8Array): Chunk[] {
  expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Chunk[] = [];
  let off = 8;
  while (off < png.length) {
    const length = view.getUint32(off);
    const typeAndData = png.subarray(off + 4, off + 8 + length);
    const type = String.fromCharCode(...typeAndData.subarray(0, 4));
    const crc = view.getUint32(off + 8 + length);
    expect(crc, `CRC of ${type} at ${off}`).toBe(crc32(typeAndData));
    chunks.push({ type, data: typeAndData.subarray(4) });
    off += 12 + length;
  }
  expect(off).toBe(png.length);
  return chunks;
}

/** Deterministic pseudo-random RGBA with non-trivial alpha. */
function noiseImage(width: number, height: number, seed = 1): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  let s = seed >>> 0;
  for (let i = 0; i < out.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = s >>> 24;
  }
  return out;
}

function gradientRows(width: number, height: number, y0: number, rows: number): Uint8Array {
  const out = new Uint8Array(width * rows * 4);
  for (let r = 0; r < rows; r++) {
    const y = y0 + r;
    for (let x = 0; x < width; x++) {
      const i = (r * width + x) * 4;
      out[i] = Math.round((255 * x) / (width - 1));
      out[i + 1] = Math.round((255 * y) / (height - 1));
      out[i + 2] = Math.round(128 + 100 * Math.sin((x + y) / 900));
      out[i + 3] = 255;
    }
  }
  return out;
}

function dropAlpha(rgba: Uint8Array): Uint8Array {
  const rgb = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  return rgb;
}

/** Byte-exact comparison that reports the first mismatch instead of a huge diff. */
function expectBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  expect(actual.length).toBe(expected.length);
  const i = actual.findIndex((b, k) => b !== expected[k]);
  expect(i, `first mismatching byte index`).toBe(-1);
}

async function encode(width: number, height: number, rgba: Uint8Array, batches: number[]) {
  const enc = createPngEncoder({ width, height });
  let row = 0;
  for (const n of batches) {
    await enc.writeRows(rgba.slice(row * width * 4, (row + n) * width * 4), n);
    row += n;
  }
  const blob = await enc.finish();
  return { blob, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

describe('createPngEncoder', () => {
  const cases: [number, number, number[]][] = [
    [1, 1, [1]],
    [3, 2, [1, 1]],
    [17, 13, [5, 1, 7]],
    [101, 64, [64]],
    [333, 257, [1, 100, 2, 154]],
    [1000, 700, [300, 300, 100]], // > 1 MiB per call, exercises internal batching
  ];

  for (const [width, height, batches] of cases) {
    it(`round-trips ${width}×${height} in batches ${batches.join('+')}`, async () => {
      const rgba = noiseImage(width, height, width * 31 + height);
      const { blob, bytes } = await encode(width, height, rgba, batches);
      expect(blob.type).toBe('image/png');

      const img = decode(bytes);
      expect(img.width).toBe(width);
      expect(img.height).toBe(height);
      expect(img.channels).toBe(3);
      expect(img.depth).toBe(8);
      expectBytesEqual(img.data as Uint8Array, dropAlpha(rgba));
    });
  }

  it('round-trips a smooth gradient byte-exactly', async () => {
    const width = 1023;
    const height = 511;
    const rgba = gradientRows(width, height, 0, height);
    const { bytes } = await encode(width, height, rgba, [200, 311]);
    const img = decode(bytes);
    expectBytesEqual(img.data as Uint8Array, dropAlpha(rgba));
  });

  it('writes a valid chunk layout with IHDR, sRGB, IDAT…, IEND', async () => {
    const width = 257;
    const height = 99;
    const { bytes } = await encode(width, height, noiseImage(width, height), [50, 49]);
    const chunks = parseChunks(bytes);
    const types = chunks.map((c) => c.type);
    expect(types[0]).toBe('IHDR');
    expect(types[1]).toBe('sRGB');
    expect(types.at(-1)).toBe('IEND');
    const middle = types.slice(2, -1);
    expect(middle.length).toBeGreaterThan(0);
    expect(middle.every((t) => t === 'IDAT')).toBe(true);

    const ihdr = new DataView(chunks[0].data.buffer, chunks[0].data.byteOffset, 13);
    expect(chunks[0].data.length).toBe(13);
    expect(ihdr.getUint32(0)).toBe(width);
    expect(ihdr.getUint32(4)).toBe(height);
    expect(Array.from(chunks[0].data.subarray(8))).toEqual([8, 2, 0, 0, 0]);
    expect(Array.from(chunks[1].data)).toEqual([0]);
    expect(chunks.at(-1)!.data.length).toBe(0);
  });

  it('splits large compressed output into multiple IDAT chunks', async () => {
    // Noise is incompressible, so ~3 MB of RGB yields several ~1 MiB IDATs.
    const width = 1024;
    const height = 1024;
    const rgba = noiseImage(width, height, 7);
    const { bytes } = await encode(width, height, rgba, [1024]);
    const idats = parseChunks(bytes).filter((c) => c.type === 'IDAT');
    expect(idats.length).toBeGreaterThan(1);
    expectBytesEqual(decode(bytes).data as Uint8Array, dropAlpha(rgba));
  });

  it('accepts writes without awaiting each one', async () => {
    const width = 64;
    const height = 30;
    const rgba = noiseImage(width, height, 3);
    const enc = createPngEncoder({ width, height });
    const writes = [0, 10, 20].map((r) => enc.writeRows(rgba.slice(r * width * 4, (r + 10) * width * 4), 10));
    await Promise.all(writes);
    const bytes = new Uint8Array(await (await enc.finish()).arrayBuffer());
    expectBytesEqual(decode(bytes).data as Uint8Array, dropAlpha(rgba));
  });

  it('rejects invalid sizes', () => {
    for (const [width, height] of [[0, 1], [1, 0], [-1, 5], [1.5, 2], [NaN, 2], [2 ** 31, 1]]) {
      expect(() => createPngEncoder({ width, height })).toThrow(RangeError);
    }
  });

  it('rejects wrong lengths and row counts', async () => {
    const enc = createPngEncoder({ width: 4, height: 3 });
    await expect(enc.writeRows(new Uint8Array(4 * 4 - 1), 1)).rejects.toThrow(RangeError);
    await expect(enc.writeRows(new Uint8Array(4 * 4 * 2), 1)).rejects.toThrow(RangeError);
    await expect(enc.writeRows(new Uint8Array(0), 0)).rejects.toThrow(RangeError);
    await expect(enc.writeRows(new Uint8Array(4 * 4 * 4), 4)).rejects.toThrow(/Too many rows/);
    await enc.writeRows(new Uint8Array(4 * 4 * 2), 2);
    await expect(enc.writeRows(new Uint8Array(4 * 4 * 2), 2)).rejects.toThrow(/Too many rows/);
    // Rejected calls don't consume rows: the last row still completes the image.
    await enc.writeRows(new Uint8Array(4 * 4), 1);
    const img = decode(new Uint8Array(await (await enc.finish()).arrayBuffer()));
    expect(img.height).toBe(3);
  });

  it('throws on premature finish', async () => {
    const enc = createPngEncoder({ width: 4, height: 3 });
    await expect(enc.finish()).rejects.toThrow(/0 of 3 rows/);
    await enc.writeRows(new Uint8Array(4 * 4 * 2), 2);
    await expect(enc.finish()).rejects.toThrow(/2 of 3 rows/);
    enc.abort();
  });

  it('refuses further use after finish or abort', async () => {
    const done = createPngEncoder({ width: 1, height: 1 });
    await done.writeRows(new Uint8Array(4), 1);
    await done.finish();
    await expect(done.finish()).rejects.toThrow(/already finished/);
    done.abort(); // no-op after finish

    const aborted = createPngEncoder({ width: 2, height: 2 });
    await aborted.writeRows(new Uint8Array(8), 1);
    aborted.abort();
    aborted.abort(); // idempotent
    await expect(aborted.writeRows(new Uint8Array(8), 1)).rejects.toThrow(/aborted/);
    await expect(aborted.finish()).rejects.toThrow(/aborted/);
  });

  // Run with: PNG_BENCH=1 npx vitest run tests/unit/png.test.ts
  it.skipIf(!import.meta.env.PNG_BENCH)(
    'benchmark: 5120×2880 smooth gradient in 2048-row bands',
    async () => {
      const width = 5120;
      const height = 2880;
      const enc = createPngEncoder({ width, height });
      let encodeMs = 0;
      const t0 = performance.now();
      for (let y = 0; y < height; y += 2048) {
        const rows = Math.min(2048, height - y);
        const band = gradientRows(width, height, y, rows);
        const t = performance.now();
        await enc.writeRows(band, rows);
        encodeMs += performance.now() - t;
      }
      const t = performance.now();
      const blob = await enc.finish();
      encodeMs += performance.now() - t;
      const totalMs = performance.now() - t0;
      console.log(
        `PNG 5120×2880: encode ${encodeMs.toFixed(0)} ms (total incl. generating input ${totalMs.toFixed(0)} ms), ` +
          `${(blob.size / 1e6).toFixed(2)} MB`,
      );
      const img = decode(new Uint8Array(await blob.arrayBuffer()));
      expect(img.width).toBe(width);
      expect(img.height).toBe(height);
    },
    60_000,
  );
});
