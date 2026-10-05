import { decode } from 'fast-png';
import { describe, expect, it } from 'vitest';
import { defaultDesign, defaultMesh, type Design } from '../../src/design/design';
import { saveDesign } from '../../src/design/schema';
import { shuffleDesign } from '../../src/design/shuffle';
import { DESIGN_KEYWORD, designText, readPngDesign } from '../../src/export/design-png';
import { createPngEncoder } from '../../src/export/png';
import { readPngInfo } from '../../src/export/png-read';

async function encode(width: number, height: number, text: Record<string, string> = {}): Promise<Blob> {
  const enc = createPngEncoder({ width, height }, text);
  await enc.writeRows(new Uint8Array(width * height * 4).fill(200), height);
  return enc.finish();
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** `png` with a raw chunk spliced in before IEND (CRC left zero; the reader doesn't check it). */
async function withChunk(png: Blob, type: string, data: Uint8Array<ArrayBuffer>): Promise<Blob> {
  const bytes = new Uint8Array(await png.arrayBuffer());
  const head = new Uint8Array(8);
  new DataView(head.buffer).setUint32(0, data.length);
  head.set(ascii(type), 4);
  return new Blob([bytes.subarray(0, -12), head, data, new Uint8Array(4), bytes.subarray(-12)]);
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe('PNG text', () => {
  it('writes iTXt chunks that read back, UTF-8 intact, and still decode', async () => {
    const text = { one: 'plain', 'two words': 'ünïcödé — ✓' };
    const png = await encode(5, 3, text);
    expect(await readPngInfo(png)).toEqual({ size: { width: 5, height: 3 }, text });
    expect(decode(new Uint8Array(await png.arrayBuffer())).width).toBe(5);
  });

  it('reads compressed iTXt and tEXt chunks', async () => {
    let png = await encode(2, 2);
    const body = await deflate(new TextEncoder().encode('squeezed ✓'));
    png = await withChunk(png, 'iTXt', new Uint8Array([...ascii('zipped'), 0, 1, 0, ...ascii('en'), 0, 0, ...body]));
    png = await withChunk(png, 'tEXt', new Uint8Array([...ascii('Software'), 0, ...ascii('elsewhere')]));
    expect((await readPngInfo(png))!.text).toEqual({ zipped: 'squeezed ✓', Software: 'elsewhere' });
  });

  it('rejects invalid keywords', () => {
    for (const k of ['', ' lead', 'trail ', 'two  spaces', 'x'.repeat(80), 'ü']) {
      expect(() => createPngEncoder({ width: 1, height: 1 }, { [k]: 'v' }), k).toThrow(RangeError);
    }
  });

  it('returns null for files that are not PNGs', async () => {
    expect(await readPngInfo(new Blob([]))).toBeNull();
    expect(await readPngInfo(new Blob([new Uint8Array(64).fill(137)]))).toBeNull();
  });
});

describe('design in the PNG', () => {
  it('reads back every kind of design exactly, with the image size', async () => {
    const kinds = new Set<string>();
    let design: Design = { ...defaultDesign, base: defaultMesh };
    for (let seed = 1; kinds.size < 9 && seed <= 300; seed++) {
      design = shuffleDesign(design, { colors: true, layout: true, style: true, seed }).design;
      if (kinds.has(design.base.kind)) continue;
      kinds.add(design.base.kind);
      const read = await readPngDesign(await encode(7, 4, designText(design)));
      expect(read).toEqual({ design: saveDesign(design).design, size: { width: 7, height: 4 } });
    }
    expect(kinds.size).toBe(9);
  });

  it('is null for a PNG without a design and throws for a broken one', async () => {
    expect(await readPngDesign(await encode(2, 2))).toBeNull();
    await expect(readPngDesign(await encode(2, 2, { [DESIGN_KEYWORD]: '{"version":99}' }))).rejects.toThrow();
    await expect(readPngDesign(await encode(2, 2, { [DESIGN_KEYWORD]: 'not json' }))).rejects.toThrow();
  });
});
