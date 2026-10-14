// A design as a URL fragment: what differs from a frozen reference design, deflated, base64url, behind a format prefix.
import type { Design } from './design';
import { loadDesign, saveDesign, SCHEMA_VERSION, type SavedDesign } from './schema';

/** Format of the payload after the prefix; bump it when the encoding changes. */
export const SHARE_PREFIX = 'v1.';
/** Decompressed bytes accepted from a link; a design is a few KB, so this only stops zip bombs. */
export const MAX_SHARE_BYTES = 64 * 1024;

/**
 * What links are written against, frozen: it is the default design as schema version 6 saved it, not defaultDesign,
 * so retuning the default never changes the meaning of a link already shared. Never edit it; a new reference means
 * a new SHARE_PREFIX.
 */
export const SHARE_REFERENCE_VERSION = 6;
const SHARE_REFERENCE = {
  engineVersion: 1,
  base: {
    kind: 'linear',
    angle: 30,
    stops: [
      { position: 0, color: [0.2264, 0.1093, 280.42] },
      { position: 0.5, color: [0.6031, 0.2141, 352.9] },
      { position: 1, color: [0.8452, 0.1383, 76.58] },
    ],
    scale: 0.35,
    seed: 1,
    noiseStyle: 'contour',
  },
  warp: { shape: 'none', amount: 0, size: 0.5, seed: 1 },
  transform: { rotate: 0, zoom: 1, flipX: false, flipY: false },
  finish: {
    vignette: 0,
    bands: 0,
    bandEdge: 0,
    bandStyle: 'weights',
    noise: { type: 'lithograph', amount: 0 },
    relief: 0,
    reliefStyle: 'satin',
    reliefLight: 135,
  },
} as const;

export class ShareDecodeError extends Error {}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new ShareDecodeError('not base64url');
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function collect(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new ShareDecodeError('link too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream, limit: number) {
  const writer = transform.writable.getWriter();
  void writer.write(bytes as BufferSource).catch(() => {});
  void writer.close().catch(() => {});
  return collect(transform.readable, limit);
}

const deflate = (bytes: Uint8Array) => pipe(bytes, new CompressionStream('deflate-raw'), Infinity);
const inflate = (bytes: Uint8Array) => pipe(bytes, new DecompressionStream('deflate-raw'), MAX_SHARE_BYTES);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const isObject = (x: Json | undefined): x is { [key: string]: Json } =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Every non-integer rounded to 3 decimals (at most 0.0005 off: invisible); seeds and flags pass through. */
function quantize(x: Json): Json {
  if (typeof x === 'number') return Number.isInteger(x) ? x : Math.round(x * 1e3) / 1e3;
  if (Array.isArray(x)) return x.map(quantize);
  if (isObject(x)) return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, quantize(v)]));
  return x;
}

const sameJson = (a: Json | undefined, b: Json | undefined) => JSON.stringify(a) === JSON.stringify(b);

/** What differs from `ref`, or undefined when nothing does. An object whose `kind` changed is kept whole: it can't merge onto another kind. */
function diff(x: Json, ref: Json | undefined): Json | undefined {
  if (sameJson(x, ref)) return undefined;
  if (isObject(x) && isObject(ref ?? null) && x.kind === (ref as { [key: string]: Json }).kind) {
    const out: { [key: string]: Json } = {};
    for (const [k, v] of Object.entries(x)) {
      const d = diff(v, (ref as { [key: string]: Json })[k]);
      if (d !== undefined) out[k] = d;
    }
    return out;
  }
  return x;
}

/** The inverse of diff: an object carrying a `kind` replaces, any other object merges. Arrays and values replace. */
function patch(ref: Json | undefined, d: Json): Json {
  if (isObject(d) && isObject(ref ?? null) && !('kind' in d)) {
    const base = ref as { [key: string]: Json };
    return { ...base, ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, patch(base[k], v)])) };
  }
  return d;
}

// Rounded like the designs it is compared with, so equal means equal.
const REFERENCE = quantize(SHARE_REFERENCE as unknown as Json);

/** The saved design rounded for the link, or exact when rounding leaves the schema (359.9996° would round to 360°). */
function compact(design: Design): Json {
  const { design: saved } = saveDesign(design);
  const rounded = quantize(saved as unknown as Json);
  try {
    loadDesign({ version: SCHEMA_VERSION, design: rounded });
    return rounded;
  } catch {
    return saved as unknown as Json;
  }
}

/** The fragment payload (with prefix) for a design. */
export async function encodeShare(design: Design): Promise<string> {
  const json = JSON.stringify({ v: SCHEMA_VERSION, d: diff(compact(design), REFERENCE) ?? {} });
  return SHARE_PREFIX + toBase64Url(await deflate(new TextEncoder().encode(json)));
}

/** The design in a fragment payload; throws ShareDecodeError or DesignLoadError when it can't be read. */
export async function decodeShare(payload: string): Promise<SavedDesign> {
  if (!payload.startsWith(SHARE_PREFIX)) throw new ShareDecodeError('unknown link format');
  let json: unknown;
  try {
    const bytes = await inflate(fromBase64Url(payload.slice(SHARE_PREFIX.length)));
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    throw err instanceof ShareDecodeError ? err : new ShareDecodeError('link is damaged');
  }
  if (!isObject(json as Json) || !isObject((json as { d?: Json }).d)) throw new ShareDecodeError('link is damaged');
  const { v, d } = json as { v: Json; d: Json };
  return loadDesign({ version: v, design: patch(REFERENCE, d) });
}
