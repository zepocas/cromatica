import type { OutputSize } from '../engine/types';
import type { PngEncoder } from './types';

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
// PNG limits dimensions to 2^31 - 1.
const MAX_DIMENSION = 0x7fffffff;
// Filtered bytes handed to the compressor per write.
const WRITE_BATCH_BYTES = 1 << 20;
// Compressed bytes coalesced into one IDAT chunk.
const IDAT_TARGET_BYTES = 1 << 20;
const FILTER_UP = 2;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** Running CRC32 update; start with 0xffffffff, finish with `^ 0xffffffff`. */
function crcUpdate(crc: number, bytes: Uint8Array): number {
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc;
}

function ascii(s: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** A chunk as Blob parts: length + type, the data pieces, CRC. */
function chunk(type: string, pieces: Uint8Array<ArrayBuffer>[]): Blob {
  const typeBytes = ascii(type);
  let length = 0;
  let crc = crcUpdate(0xffffffff, typeBytes);
  for (const p of pieces) {
    length += p.length;
    crc = crcUpdate(crc, p);
  }
  const head = new Uint8Array(8);
  const view = new DataView(head.buffer);
  view.setUint32(0, length);
  head.set(typeBytes, 4);
  const tail = new Uint8Array(4);
  new DataView(tail.buffer).setUint32(0, (crc ^ 0xffffffff) >>> 0);
  return new Blob([head, ...pieces, tail]);
}

function ihdr(width: number, height: number): Blob {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = 8; // bit depth
  data[9] = 2; // color type: truecolor RGB
  // compression, filter method and interlace are all 0.
  return chunk('IHDR', [data]);
}

/** An uncompressed iTXt chunk with no language tag (PNG 1.2, 4.2.3.3). */
function itxt(keyword: string, text: string): Blob {
  if (!/^[\x20-\x7e]{1,79}$/.test(keyword) || /^ | $| {2}/.test(keyword)) {
    throw new RangeError(`invalid PNG text keyword: ${JSON.stringify(keyword)}`);
  }
  // Keyword NUL, compression flag and method, empty language tag and translated keyword (each NUL-terminated).
  const head = new Uint8Array([...ascii(keyword), 0, 0, 0, 0, 0]);
  return chunk('iTXt', [head, new TextEncoder().encode(text)]);
}

const abortError = () => new DOMException('PNG encoder was aborted', 'AbortError');

/**
 * Streaming PNG encoder: RGBA8 rows in, 8-bit RGB PNG out (color type 2,
 * alpha dropped, sRGB chunk). `text` entries become iTXt chunks before the
 * image data. Rows are filtered (Up, D17) and fed to
 * CompressionStream('deflate') in ~1 MiB batches; only the previous row and
 * the compressed output are retained.
 */
export function createPngEncoder(size: OutputSize, text: Record<string, string> = {}): PngEncoder {
  const { width, height } = size;
  for (const [name, v] of [
    ['width', width],
    ['height', height],
  ] as const) {
    if (!Number.isInteger(v) || v <= 0 || v > MAX_DIMENSION) {
      throw new RangeError(`${name} must be an integer in [1, ${MAX_DIMENSION}], got ${v}`);
    }
  }

  const rgbStride = width * 3;
  const filteredStride = rgbStride + 1;
  const rowsPerBatch = Math.max(1, Math.floor(WRITE_BATCH_BYTES / filteredStride));

  const compressor = new CompressionStream('deflate');
  const writer = compressor.writable.getWriter();
  const reader = compressor.readable.getReader();

  const parts: BlobPart[] = [
    SIGNATURE,
    ihdr(width, height),
    chunk('sRGB', [new Uint8Array([0])]),
    ...Object.entries(text).map(([keyword, value]) => itxt(keyword, value)),
  ];
  let pending: Uint8Array<ArrayBuffer>[] = [];
  let pendingBytes = 0;
  const flushIdat = () => {
    if (pendingBytes === 0) return;
    parts.push(chunk('IDAT', pending));
    pending = [];
    pendingBytes = 0;
  };

  let failure: unknown = null;
  let state = 'open' as 'open' | 'finishing' | 'done' | 'aborted';

  // Drain concurrently with writing, or the compressor's queues fill up and
  // writes never resolve.
  const drained = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || state === 'aborted') return;
      pending.push(value as Uint8Array<ArrayBuffer>);
      pendingBytes += value.length;
      if (pendingBytes >= IDAT_TARGET_BYTES) flushIdat();
    }
    flushIdat();
  })();
  drained.catch((e: unknown) => {
    failure ??= e;
  });

  // PNG filters reference the row above; for row 0 it's all zeros.
  let prevRow = new Uint8Array(rgbStride);
  let spareRow = new Uint8Array(rgbStride);
  let rowsAccepted = 0;
  let rowsWritten = 0;
  let queue: Promise<void> = Promise.resolve();

  const checkUsable = () => {
    if (state === 'aborted') throw abortError();
    if (failure !== null) throw failure;
  };

  async function encodeRows(rgba: Uint8Array, rowCount: number): Promise<void> {
    for (let r0 = 0; r0 < rowCount; r0 += rowsPerBatch) {
      checkUsable();
      const n = Math.min(rowsPerBatch, rowCount - r0);
      // Fresh buffer per write: the stream may hold on to it.
      const out = new Uint8Array(n * filteredStride);
      let src = r0 * width * 4;
      let dst = 0;
      for (let r = 0; r < n; r++) {
        const cur = spareRow;
        out[dst++] = FILTER_UP;
        for (let i = 0; i < rgbStride; i += 3, src += 4) {
          const red = rgba[src];
          const green = rgba[src + 1];
          const blue = rgba[src + 2];
          cur[i] = red;
          cur[i + 1] = green;
          cur[i + 2] = blue;
          // Uint8Array stores mod 256, which is what the filter needs.
          out[dst++] = red - prevRow[i];
          out[dst++] = green - prevRow[i + 1];
          out[dst++] = blue - prevRow[i + 2];
        }
        spareRow = prevRow;
        prevRow = cur;
      }
      await writer.ready;
      checkUsable();
      writer.write(out).catch((e: unknown) => {
        failure ??= e;
      });
    }
    rowsWritten += rowCount;
  }

  return {
    writeRows(rgba, rowCount) {
      try {
        checkUsable();
        if (state !== 'open') throw new Error('PNG encoder is already finished');
        if (!Number.isInteger(rowCount) || rowCount <= 0) {
          throw new RangeError(`rowCount must be a positive integer, got ${rowCount}`);
        }
        if (rowsAccepted + rowCount > height) {
          throw new RangeError(`Too many rows: ${rowsAccepted} + ${rowCount} exceeds height ${height}`);
        }
        const expected = width * rowCount * 4;
        if (rgba.length !== expected) {
          throw new RangeError(`Expected ${expected} bytes for ${rowCount} rows, got ${rgba.length}`);
        }
      } catch (e) {
        return Promise.reject(e);
      }
      rowsAccepted += rowCount;
      // Serialize calls so rows are encoded in call order even if the caller
      // doesn't await each one.
      const run = queue.then(() => encodeRows(rgba, rowCount));
      queue = run.catch(() => {});
      return run;
    },

    async finish() {
      checkUsable();
      if (state !== 'open') throw new Error('PNG encoder is already finished');
      if (rowsAccepted !== height) {
        throw new Error(`Only ${rowsAccepted} of ${height} rows were written`);
      }
      state = 'finishing';
      await queue;
      checkUsable();
      if (rowsWritten !== height) throw new Error('Not all rows were encoded');
      await writer.close();
      await drained;
      checkUsable();
      flushIdat();
      parts.push(chunk('IEND', []));
      state = 'done';
      return new Blob(parts, { type: 'image/png' });
    },

    abort() {
      if (state === 'done' || state === 'aborted') return;
      state = 'aborted';
      const reason = abortError();
      writer.abort(reason).catch(() => {});
      reader.cancel(reason).catch(() => {});
      parts.length = 0;
      pending = [];
      pendingBytes = 0;
    },
  };
}
