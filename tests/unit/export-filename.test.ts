import { describe, expect, it } from 'vitest';
import { exportFilename } from '../../src/export/filename';

describe('export filename', () => {
  it('carries the local date and time', () => {
    expect(exportFilename('png', new Date(2026, 9, 30, 14, 23, 5))).toBe('cromatica-261030142305.png');
  });

  it('zero-pads so names sort chronologically', () => {
    expect(exportFilename('png', new Date(2026, 0, 2, 3, 4, 5))).toBe('cromatica-260102030405.png');
    expect(exportFilename('png', new Date(2105, 0, 2, 3, 4, 5))).toBe('cromatica-050102030405.png');
  });

  it('uses .jpg for jpeg', () => {
    expect(exportFilename('jpeg', new Date(2026, 9, 30, 14, 23, 5))).toMatch(/\.jpg$/);
  });

  it('differs between exports a second apart', () => {
    const a = exportFilename('png', new Date(2026, 9, 30, 14, 23, 5));
    const b = exportFilename('png', new Date(2026, 9, 30, 14, 23, 6));
    expect(a).not.toBe(b);
  });
});
