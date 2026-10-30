import {
  MAX_BLOBS,
  noFinish,
  type BlobEdits,
  type BlobsPattern,
  type Design,
  type ReliefStyle,
  type WarpShape,
} from '../design/design';
import { prepareRelief, reliefTaps } from '../engine/relief';
import { barePatterns, createDrawTimer, tick } from './perf-compile';
import { describeRenderer } from './perf';

const DRAW_SIZE = { width: 3840, height: 2160 };
/** Timed draws per variant after one untimed warm-up; the median is kept. */
const DRAW_RUNS = 7;
const LIGHTING: (ReliefStyle | 'off')[] = ['off', 'satin', 'glass'];
const WARPS: WarpShape[] = ['none', 'simplex', 'waves'];
const BLOB_COUNTS = [1, 4, 8, 16];
const BLOB_GRAINS = [0, 0.6];
/** Far outside the frame in pattern units, so every blob is culled. */
const OFF_FRAME = 5;

interface Case {
  group: string;
  label: string;
  design: Design;
  lighting: ReliefStyle | 'off';
}

interface Row extends Case {
  compileMs: number;
  drawMs: number;
}

const withLighting = (d: Design, lighting: ReliefStyle | 'off'): Design =>
  lighting === 'off'
    ? { ...d, finish: undefined }
    : { ...d, finish: { ...noFinish, relief: 0.35, reliefStyle: lighting } };

const withWarp = (d: Design, shape: WarpShape): Design =>
  shape === 'none' ? d : { ...d, warp: { shape, amount: 0.3, size: 0.35, seed: 1 } };

const blobCountSlider = (n: number) => (n - 1) / (MAX_BLOBS - 1);

function cases(): Case[] {
  const bare = barePatterns();
  const out: Case[] = [];
  for (const d of bare) {
    for (const warp of WARPS) {
      for (const lighting of LIGHTING) {
        out.push({
          group: `${d.base.kind} warp:${warp}`,
          label: lighting,
          design: withLighting(withWarp(d, warp), lighting),
          lighting,
        });
      }
    }
  }
  const blobs = bare.find((d) => d.base.kind === 'blobs');
  if (!blobs) return out;
  const base = blobs.base as BlobsPattern;
  for (const grain of BLOB_GRAINS) {
    for (const n of BLOB_COUNTS) {
      for (const lighting of LIGHTING) {
        const design = { ...blobs, base: { ...base, count: blobCountSlider(n), grain, edits: undefined } };
        out.push({
          group: `blobs n=${n} grain=${grain}`,
          label: lighting,
          design: withLighting(design, lighting),
          lighting,
        });
      }
    }
  }
  // A culled blob should cost next to nothing; on a CPU rasterizer it may not.
  const shifts = Array.from({ length: MAX_BLOBS }, (): [number, number] => [OFF_FRAME, OFF_FRAME]);
  const placements: [string, BlobEdits | undefined][] = [
    ['on-frame', undefined],
    ['off-frame', { order: [], shifts }],
  ];
  for (const [where, edits] of placements) {
    for (const lighting of LIGHTING) {
      const design = { ...blobs, base: { ...base, count: blobCountSlider(MAX_BLOBS), grain: BLOB_GRAINS[1], edits } };
      out.push({ group: `blobs n=16 ${where}`, label: lighting, design: withLighting(design, lighting), lighting });
    }
  }
  return out;
}

/** Pattern reads per pixel: one without lighting, the relief taps with it. */
function reads(c: Case): number {
  return c.lighting === 'off' ? 1 : reliefTaps(prepareRelief(c.design.finish));
}

const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '-');

/**
 * Times every pattern kind with lighting off, satin and glass, under no warp and two warps, then blobs by count and
 * grain, and 16 blobs on and off the frame. `+read` is the lighting's extra time per extra pattern read: what one
 * read fewer would save.
 */
export async function runLightingBenchmark(onProgress: (text: string) => void): Promise<string> {
  const timer = createDrawTimer();
  if (!timer) return 'WebGL2 is not available';
  const renderer = describeRenderer(timer.gl);
  const all = cases();
  const rows: Row[] = [];
  for (const c of all) {
    onProgress(`${renderer}\nlighting ${rows.length + 1}/${all.length}: ${c.group} ${c.label}`);
    await tick();
    const compileMs = timer.draw(c.design, 8, 8);
    timer.draw(c.design, DRAW_SIZE.width, DRAW_SIZE.height);
    const runs = Array.from({ length: DRAW_RUNS }, () => timer.draw(c.design, DRAW_SIZE.width, DRAW_SIZE.height));
    runs.sort((a, b) => a - b);
    rows.push({ ...c, compileMs, drawMs: runs[Math.floor(runs.length / 2)] });
  }
  timer.dispose();

  const lines = [
    renderer,
    `draw = median of ${DRAW_RUNS} at ${DRAW_SIZE.width}x${DRAW_SIZE.height}, ms; compile = first draw at 8x8, ms.`,
    'lit-off = what lighting adds; +read = that divided by the extra pattern reads it makes.',
    'group                           |    off |  satin  lit-off  +read |  glass  lit-off  +read | compile off/satin/glass',
  ];
  const groups = [...new Set(rows.map((r) => r.group))];
  for (const group of groups) {
    const of = (l: Case['lighting']) => rows.find((r) => r.group === group && r.label === l);
    const off = of('off');
    const cells = (['satin', 'glass'] as const).map((l) => {
      const r = of(l);
      if (!r || !off) return '      -        -      -';
      const extra = r.drawMs - off.drawMs;
      return `${fmt(r.drawMs).padStart(6)} ${fmt(extra).padStart(8)} ${fmt(extra / (reads(r) - 1)).padStart(6)}`;
    });
    const compiles = LIGHTING.map((l) => of(l)?.compileMs.toFixed(0) ?? '-').join('/');
    lines.push(`${group.padEnd(31)} | ${fmt(off?.drawMs ?? NaN).padStart(6)} | ${cells.join(' | ')} | ${compiles}`);
  }
  const text = lines.join('\n');
  (window as unknown as { __perfLighting: string }).__perfLighting = text;
  return text;
}
