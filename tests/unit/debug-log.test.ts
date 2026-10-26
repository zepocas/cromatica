import { describe, expect, it } from 'vitest';
import { defaultDesign, type Design } from '../../src/design/design';
import { DebugLog, designChanges, formatEntry } from '../../src/ui/state/debug-log';

const withWarp = (shape: Design['warp']['shape'], amount: number): Design => ({
  ...structuredClone(defaultDesign),
  warp: { ...defaultDesign.warp, shape, amount },
});

describe('debug log', () => {
  it('lists only the fields that changed', () => {
    const changes = designChanges(withWarp('none', 0), withWarp('fbm', 0));
    expect(changes).toEqual([expect.stringContaining('warp.shape')]);
  });

  it('records the noted action, skips no-op updates and caps the buffer', () => {
    const log = new DebugLog();
    log.record(withWarp('none', 0));
    log.note('key .');
    log.record(withWarp('fbm', 0));
    log.record(withWarp('fbm', 0));
    const { entries } = log.dump();
    expect(entries.map((e) => e.action)).toEqual(['edit', 'key .']);
    for (let i = 0; i < 300; i++) log.record(withWarp('fbm', i / 1000 + 0.001));
    expect(log.dump().entries.length).toBe(200);
  });

  it('keeps the design an error happened with', () => {
    const log = new DebugLog();
    log.record(withWarp('fbm', 0.4));
    log.error(new Error('boom'));
    const last = log.dump().entries.at(-1);
    expect(last?.error).toContain('boom');
    expect(last?.design).toBeTruthy();
  });
});

describe('debug log sink', () => {
  it('hands every entry to the sink as it is recorded', () => {
    const lines: string[] = [];
    const log = new DebugLog((e) => lines.push(formatEntry(e)));
    log.record(withWarp('none', 0));
    log.note('key .');
    log.record(withWarp('fbm', 0));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('key .');
    expect(lines[1]).toContain('warp.shape');
  });
});
