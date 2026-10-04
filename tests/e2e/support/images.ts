/// <reference types="node" />
import { encode } from 'fast-png';

/** A 40×20 PNG: 70% red (#DC2828) on the left, 30% blue (#1E3CC8) on the right. */
export function twoTonePng(): Buffer {
  const w = 40;
  const h = 20;
  const data = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) data.set(i % w < 28 ? [0xdc, 0x28, 0x28] : [0x1e, 0x3c, 0xc8], i * 3);
  return Buffer.from(encode({ width: w, height: h, data, channels: 3 }));
}
