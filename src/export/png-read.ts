import type { OutputSize } from '../engine/types';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export interface PngInfo {
  size: OutputSize;
  /** iTXt and tEXt entries by keyword. */
  text: Record<string, string>;
}

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder();

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One iTXt chunk's keyword and text, or null if it's malformed or uses an unknown compression. */
async function parseItxt(data: Uint8Array<ArrayBuffer>): Promise<[string, string] | null> {
  const keyEnd = data.indexOf(0);
  if (keyEnd < 1 || keyEnd + 2 >= data.length) return null;
  const compressed = data[keyEnd + 1];
  if (compressed !== 0 && (compressed !== 1 || data[keyEnd + 2] !== 0)) return null;
  const langEnd = data.indexOf(0, keyEnd + 3);
  const transEnd = langEnd < 0 ? -1 : data.indexOf(0, langEnd + 1);
  if (transEnd < 0) return null;
  const body = data.subarray(transEnd + 1);
  const text = utf8.decode(compressed ? await inflate(body) : body);
  return [latin1.decode(data.subarray(0, keyEnd)), text];
}

function parseText(data: Uint8Array): [string, string] | null {
  const keyEnd = data.indexOf(0);
  return keyEnd < 1 ? null : [latin1.decode(data.subarray(0, keyEnd)), latin1.decode(data.subarray(keyEnd + 1))];
}

/**
 * The size and text entries of a PNG, or null if `file` isn't one. Reads
 * chunk headers only and skips the image data, so large files are cheap.
 * CRCs aren't checked.
 */
export async function readPngInfo(file: Blob): Promise<PngInfo | null> {
  const bytes = async (start: number, length: number) =>
    new Uint8Array(await file.slice(start, start + length).arrayBuffer());

  const head = await bytes(0, 33);
  if (head.length < 33 || SIGNATURE.some((b, i) => head[i] !== b)) return null;
  const view = new DataView(head.buffer);
  if (latin1.decode(head.subarray(12, 16)) !== 'IHDR') return null;
  const size = { width: view.getUint32(16), height: view.getUint32(20) };

  const text: Record<string, string> = {};
  let off = 33;
  while (off + 8 <= file.size) {
    const header = await bytes(off, 8);
    const length = new DataView(header.buffer).getUint32(0);
    const type = latin1.decode(header.subarray(4, 8));
    if (type === 'IEND') break;
    if (type === 'iTXt' || type === 'tEXt') {
      const data = await bytes(off + 8, length);
      const entry = type === 'iTXt' ? await parseItxt(data).catch(() => null) : parseText(data);
      if (entry && !(entry[0] in text)) text[entry[0]] = entry[1];
    }
    off += 12 + length;
  }
  return { size, text };
}
