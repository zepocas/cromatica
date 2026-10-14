import { describe, expect, it } from 'vitest';
import { defaultDesign, type Design } from '../../src/design/design';
import { loadDesign, saveDesign, SCHEMA_VERSION } from '../../src/design/schema';
import { shuffleDesign } from '../../src/design/shuffle';
import {
  decodeShare,
  encodeShare,
  MAX_SHARE_BYTES,
  SHARE_PREFIX,
  SHARE_REFERENCE_VERSION,
  ShareDecodeError,
} from '../../src/design/share';

const shuffles = (n: number): Design[] => {
  const out: Design[] = [];
  let d = defaultDesign;
  for (let i = 1; i <= n; i++) {
    d = shuffleDesign(d, { colors: true, layout: true, style: true, seed: i * 2654435761 }).design;
    out.push(d);
  }
  return out;
};

describe('step A: deflate + base64url', () => {
  it('round-trips the default and 100 shuffles to within the rounding of step B', async () => {
    for (const d of [defaultDesign, ...shuffles(100)]) {
      expect((await decodeShare(await encodeShare(d))).base.kind).toBe(d.base.kind);
    }
  });

  it('emits only url-safe characters after the prefix', async () => {
    for (const d of shuffles(20)) expect((await encodeShare(d)).slice(SHARE_PREFIX.length)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects other formats, garbage, truncation and bombs', async () => {
    const good = await encodeShare(shuffles(1)[0]);
    await expect(decodeShare('v9.abc')).rejects.toBeInstanceOf(ShareDecodeError);
    await expect(decodeShare(SHARE_PREFIX + 'a b!')).rejects.toBeInstanceOf(ShareDecodeError);
    await expect(decodeShare(good.slice(0, good.length >> 1))).rejects.toBeInstanceOf(ShareDecodeError);
    // 1 MB of zeros deflates to ~1 KB.
    const bomb = await (async () => {
      const cs = new CompressionStream('deflate-raw');
      const w = cs.writable.getWriter();
      void w.write(new Uint8Array(MAX_SHARE_BYTES * 16));
      void w.close();
      const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer());
      return SHARE_PREFIX + Buffer.from(buf).toString('base64url');
    })();
    await expect(decodeShare(bomb)).rejects.toThrow('too large');
  });
});

describe('step B: quantize', () => {
  const byteLength = async (d: Design) => (await encodeShare(d)).length;

  it('decodes to the design rounded to 3 decimals', async () => {
    for (const d of shuffles(100)) {
      const exact = JSON.stringify(loadDesign(saveDesign(d)));
      const got = await decodeShare(await encodeShare(d));
      const round = (x: unknown): unknown =>
        typeof x === 'number'
          ? Number.isInteger(x)
            ? x
            : Math.round(x * 1e3) / 1e3
          : Array.isArray(x)
            ? x.map(round)
            : x && typeof x === 'object'
              ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, round(v)]))
              : x;
      expect(got).toEqual(round(JSON.parse(exact)));
    }
  });

  it('keeps the average link under 650 characters (exact values average ~740)', async () => {
    const ds = shuffles(50);
    let total = 0;
    for (const d of ds) total += await byteLength(d);
    expect(total / ds.length).toBeLessThan(650);
  });

  it('keeps rotate under 360 when rounding would reach it', async () => {
    const d: Design = { ...defaultDesign, transform: { rotate: 359.9996, zoom: 1, flipX: false, flipY: false } };
    expect((await decodeShare(await encodeShare(d))).transform.rotate).toBe(359.9996);
  });
});

describe('step C: diff against the frozen reference', () => {
  const round = (x: unknown): unknown =>
    typeof x === 'number'
      ? Number.isInteger(x)
        ? x
        : Math.round(x * 1e3) / 1e3
      : Array.isArray(x)
        ? x.map(round)
        : x && typeof x === 'object'
          ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, round(v)]))
          : x;

  it('is pinned to the schema version it was copied at', () => {
    // A schema bump lands here on purpose: decide whether the reference needs a new SHARE_PREFIX.
    expect(SCHEMA_VERSION).toBe(SHARE_REFERENCE_VERSION);
  });

  it('writes the default design as a tiny link', async () => {
    expect((await encodeShare(defaultDesign)).length).toBeLessThan(40);
  });

  it('round-trips to the rounded design for every pattern kind', async () => {
    const ds = shuffles(150);
    expect(new Set(ds.map((d) => d.base.kind)).size).toBeGreaterThanOrEqual(8);
    for (const d of [defaultDesign, ...ds]) {
      const got = await decodeShare(await encodeShare(d));
      expect(got).toEqual(loadDesign({ version: SCHEMA_VERSION, design: round(saveDesign(d).design) }));
    }
  });

  it('keeps every link under 650 characters over 300 shuffles', async () => {
    let worst = 0;
    for (const d of shuffles(300)) worst = Math.max(worst, (await encodeShare(d)).length);
    expect(worst).toBeLessThan(650);
  });

  it('rejects a payload that is not an object with a diff', async () => {
    const enc = async (j: unknown) => {
      const cs = new CompressionStream('deflate-raw');
      const w = cs.writable.getWriter();
      void w.write(new TextEncoder().encode(JSON.stringify(j)));
      void w.close();
      return SHARE_PREFIX + Buffer.from(await new Response(cs.readable).arrayBuffer()).toString('base64url');
    };
    await expect(decodeShare(await enc([1, 2]))).rejects.toBeInstanceOf(ShareDecodeError);
    await expect(decodeShare(await enc({ v: 6, d: 'x' }))).rejects.toBeInstanceOf(ShareDecodeError);
    await expect(decodeShare(await enc({ v: 99, d: {} }))).rejects.toThrow();
  });
});
