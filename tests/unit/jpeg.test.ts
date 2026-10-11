import { describe, expect, it } from 'vitest';
import { defaultDesign, defaultMesh, type Design } from '../../src/design/design';
import { saveDesign } from '../../src/design/schema';
import { shuffleDesign } from '../../src/design/shuffle';
import { readExportedDesign } from '../../src/export/design-image';
import { DESIGN_KEYWORD, designText } from '../../src/export/design-png';
import { embedJpegDesign, readJpegInfo } from '../../src/export/jpeg';

const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  (payload.length + 2) >> 8,
  (payload.length + 2) & 0xff,
  ...payload,
];

/** The marker structure of a JPEG, without a decodable image: the readers never decode pixels. */
function jpeg(width: number, height: number, { jfif = true } = {}): Blob {
  const bytes = [
    0xff,
    0xd8,
    ...(jfif ? segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]) : []),
    ...segment(0xdb, new Array(65).fill(8)),
    ...segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0]),
    ...segment(0xc4, new Array(20).fill(1)),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    0x12,
    0x34,
    0xff,
    0x00,
    0x56, // entropy data with a stuffed byte
    0xff,
    0xd9,
  ];
  return new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
}

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

describe('JPEG info', () => {
  it('reads the size and finds no design in a plain JPEG', async () => {
    expect(await readJpegInfo(jpeg(5, 3))).toEqual({ size: { width: 5, height: 3 }, design: null });
  });

  it('is null for anything else', async () => {
    expect(await readJpegInfo(new Blob([]))).toBeNull();
    expect(await readJpegInfo(new Blob([new Uint8Array(64).fill(137)]))).toBeNull();
  });
});

describe('design in the JPEG', () => {
  it('embeds text that reads back byte for byte, markup characters and all', async () => {
    const text = '{"a":"<b> & \\"c\\" ünï ✓ ]]>","n":[1,2.5]}';
    const out = await embedJpegDesign(jpeg(40, 30), text);
    expect(await readJpegInfo(out)).toEqual({ size: { width: 40, height: 30 }, design: text });
    expect(out.type).toBe('image/jpeg');
  });

  it('goes after the JFIF header, or straight after SOI without one', async () => {
    for (const jfif of [true, false]) {
      const plain = await bytesOf(jpeg(4, 4, { jfif }));
      const out = await bytesOf(await embedJpegDesign(jpeg(4, 4, { jfif }), '{}'));
      const at = jfif ? 20 : 2;
      expect([...out.subarray(0, at)]).toEqual([...plain.subarray(0, at)]);
      expect([...out.subarray(at, at + 2)]).toEqual([0xff, 0xe1]);
      const length = (out[at + 2] << 8) | out[at + 3];
      expect([...out.subarray(at + 2 + length)]).toEqual([...plain.subarray(at)]);
    }
  });

  it('leaves the image data alone', async () => {
    const plain = await bytesOf(jpeg(4, 4));
    const out = await bytesOf(await embedJpegDesign(jpeg(4, 4), '{"x":1}'));
    expect([...out.subarray(-10)]).toEqual([...plain.subarray(-10)]);
  });

  it('skips a design too large for one segment, and a file that is not a JPEG', async () => {
    const plain = jpeg(4, 4);
    expect(await embedJpegDesign(plain, 'x'.repeat(70_000))).toBe(plain);
    const png = new Blob([new Uint8Array([137, 80, 78, 71])]);
    expect(await embedJpegDesign(png, '{}')).toBe(png);
  });

  it('reads back every kind of design exactly, with the image size', async () => {
    const kinds = new Set<string>();
    let design: Design = { ...defaultDesign, base: defaultMesh };
    for (let seed = 1; kinds.size < 9 && seed <= 300; seed++) {
      design = shuffleDesign(design, { colors: true, layout: true, style: true, seed }).design;
      if (kinds.has(design.base.kind)) continue;
      kinds.add(design.base.kind);
      const file = await embedJpegDesign(jpeg(7, 4), designText(design)[DESIGN_KEYWORD]);
      expect(await readExportedDesign(file)).toEqual({
        design: saveDesign(design).design,
        size: { width: 7, height: 4 },
      });
    }
    expect(kinds.size).toBe(9);
  });

  it('is null for a JPEG without a design and throws for a broken one', async () => {
    expect(await readExportedDesign(jpeg(2, 2))).toBeNull();
    await expect(readExportedDesign(await embedJpegDesign(jpeg(2, 2), '{"version":99}'))).rejects.toThrow();
    await expect(readExportedDesign(await embedJpegDesign(jpeg(2, 2), 'not json'))).rejects.toThrow();
  });
});
