// The design travels inside exported JPEGs as an XMP packet in an APP1
// segment. The browser's encoder has no metadata hook, so the segment is
// spliced into the finished file, and read back by walking the segments
// that precede the image data.
import type { OutputSize } from '../engine/types';

const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\0';
const NAMESPACE = 'https://github.com/zepocas/cromatica/ns/1.0/';
const APP0 = 0xe0;
const APP1 = 0xe1;
const SOS = 0xda;
const EOI = 0xd9;
/** A segment's length field counts itself and is 16 bits. */
const MAX_PAYLOAD = 0xffff - 2;

export interface JpegInfo {
  size: OutputSize;
  /** The text property of this app's XMP packet, if any. */
  design: string | null;
}

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder();
const utf8Encoder = new TextEncoder();

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole;
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isInteger(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });

function xmpSegment(design: string): Uint8Array<ArrayBuffer> | null {
  const packet =
    `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description rdf:about="" xmlns:cromatica="${NAMESPACE}">` +
    `<cromatica:design>${escapeXml(design)}</cromatica:design>` +
    `</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const payload = utf8Encoder.encode(XMP_HEADER + packet);
  if (payload.length > MAX_PAYLOAD) return null;
  const segment = new Uint8Array(4 + payload.length);
  segment.set([0xff, APP1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
  segment.set(payload, 4);
  return segment;
}

/** One segment's marker and where its payload sits; stops at the image data. */
async function* segments(file: Blob): AsyncGenerator<{ marker: number; start: number; length: number }> {
  const bytes = async (start: number, length: number) =>
    new Uint8Array(await file.slice(start, start + length).arrayBuffer());
  let off = 2;
  while (off + 4 <= file.size) {
    const head = await bytes(off, 4);
    if (head[0] !== 0xff) return;
    const marker = head[1];
    if (marker === 0xff) {
      off += 1; // fill byte
      continue;
    }
    if (marker === SOS || marker === EOI) return;
    // Markers without a length: TEM, RSTn, SOI.
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    const length = ((head[2] << 8) | head[3]) - 2;
    if (length < 0) return;
    yield { marker, start: off + 4, length };
    off += 4 + length;
  }
}

async function isJpeg(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  return head.length === 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}

/**
 * `jpeg` with `design` (the save envelope as JSON) embedded, or `jpeg`
 * itself if it isn't a JPEG or the design doesn't fit one segment.
 */
export async function embedJpegDesign(jpeg: Blob, design: string): Promise<Blob> {
  const segment = xmpSegment(design);
  if (!segment || !(await isJpeg(jpeg))) return jpeg;
  // After SOI, and after a JFIF header: readers expect APP0 first.
  let at = 2;
  for await (const s of segments(jpeg)) {
    if (s.marker === APP0 && at === 2) at = s.start + s.length;
    else break;
  }
  return new Blob([jpeg.slice(0, at), segment, jpeg.slice(at)], { type: jpeg.type });
}

/**
 * The size and embedded design of a JPEG, or null if `file` isn't one.
 * Reads segment headers and the XMP segment only, so large files are cheap.
 */
export async function readJpegInfo(file: Blob): Promise<JpegInfo | null> {
  if (!(await isJpeg(file))) return null;
  let size: OutputSize | null = null;
  let design: string | null = null;
  for await (const { marker, start, length } of segments(file)) {
    // SOF0-SOF15 but not DHT (c4), JPG (c8) or DAC (cc): precision, height, width.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame && length >= 5) {
      const d = new DataView(await file.slice(start, start + 5).arrayBuffer());
      size = { width: d.getUint16(3), height: d.getUint16(1) };
    } else if (marker === APP1 && design === null && length > XMP_HEADER.length) {
      const data = new Uint8Array(await file.slice(start, start + length).arrayBuffer());
      if (latin1.decode(data.subarray(0, XMP_HEADER.length)) === XMP_HEADER) {
        const xml = utf8.decode(data.subarray(XMP_HEADER.length));
        const match = /<cromatica:design>([\s\S]*?)<\/cromatica:design>/.exec(xml);
        if (match) design = unescapeXml(match[1]);
      }
    }
  }
  return size ? { size, design } : null;
}
