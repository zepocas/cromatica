import {
  defaultDesign,
  noFinish,
  noWarp,
  NOISE_TYPES,
  RELIEF_STYLES,
  WARP_SHAPES,
  type Design,
  type Finish,
  type WarpShape,
} from '../design/design';
import { shuffleDesign } from '../design/shuffle';
import { createRenderer } from '../engine/renderer';
import { CONTEXT_ATTRIBUTES } from '../engine/types';
import { describeDesign, describeRenderer } from './perf';

const DRAW_SIZE = { width: 1280, height: 720 };
const DRAW_RUNS = 3;
/** Heavy options tried on every pattern kind; the others are tried on a plain linear gradient only. */
const HEAVY_WARP: WarpShape = 'simplex';

interface Row {
  label: string;
  compileMs: number;
  drawMs: number;
}

/** One design per pattern kind, taken from shuffles, with no warp and no finish. */
function barePatterns(): Design[] {
  const found = new Map<string, Design>();
  for (let seed = 1; seed < 400 && found.size < 10; seed++) {
    const { design } = shuffleDesign(defaultDesign, { colors: true, layout: true, style: true, seed });
    if (!found.has(design.base.kind)) found.set(design.base.kind, { ...design, warp: noWarp, finish: undefined });
  }
  return [...found.values()];
}

function variants(): Design[] {
  const bare = barePatterns();
  const linear = bare.find((d) => d.base.kind === 'linear') ?? bare[0];
  const others = bare.filter((d) => d !== linear);
  const withWarp = (d: Design, shape: WarpShape): Design => ({
    ...d,
    warp: { shape, amount: 0.3, size: 0.35, seed: 1 },
  });
  const withFinish = (d: Design, finish: Partial<Finish>): Design => ({ ...d, finish: { ...noFinish, ...finish } });
  return [
    ...bare,
    ...WARP_SHAPES.filter((s) => s !== 'none').map((s) => withWarp(linear, s)),
    ...RELIEF_STYLES.map((reliefStyle) => withFinish(linear, { relief: 0.35, reliefStyle })),
    ...NOISE_TYPES.map((type) => withFinish(linear, { noise: { type, amount: 0.3 } })),
    withFinish(linear, { vignette: 0.3 }),
    withFinish(linear, { bands: 0.4 }),
    ...others.map((d) => withWarp(d, HEAVY_WARP)),
    ...others.map((d) => withFinish(d, { relief: 0.35, reliefStyle: 'glass' })),
  ];
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Compiles each variant on its own scratch canvas and times it: the first draw at 8x8 pixels is
 * nearly all compile and link; the draws at 1280x720 are the shader's running cost.
 */
export async function runCompileBenchmark(onProgress: (text: string) => void): Promise<string> {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { ...CONTEXT_ATTRIBUTES, preserveDrawingBuffer: false });
  if (!gl) return 'WebGL2 is not available';
  const renderer = createRenderer(gl);
  const pixel = new Uint8Array(4);
  const draw = (design: Design, width: number, height: number): number => {
    canvas.width = width;
    canvas.height = height;
    const t0 = performance.now();
    renderer.render(design, { width, height }, { x: 0, y: 0, width, height }, { dither: true });
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return performance.now() - t0;
  };

  const all = variants();
  const rows: Row[] = [];
  for (const design of all) {
    onProgress(`${describeRenderer(gl)}\ncompiling ${rows.length + 1}/${all.length}: ${describeDesign(design)}`);
    await tick();
    const compileMs = draw(design, 8, 8);
    const runs = Array.from({ length: DRAW_RUNS }, () => draw(design, DRAW_SIZE.width, DRAW_SIZE.height));
    runs.sort((a, b) => a - b);
    rows.push({ label: describeDesign(design), compileMs, drawMs: runs[Math.floor(runs.length / 2)] });
  }
  renderer.dispose();

  rows.sort((a, b) => b.compileMs - a.compileMs);
  const text = [
    describeRenderer(gl),
    `compile = first draw at 8x8; draw = median of ${DRAW_RUNS} at ${DRAW_SIZE.width}x${DRAW_SIZE.height}. A browser shader cache can make a repeat run faster.`,
    'compile ms | draw ms | variant',
    ...rows.map((r) => `${r.compileMs.toFixed(0).padStart(10)} | ${r.drawMs.toFixed(0).padStart(7)} | ${r.label}`),
  ].join('\n');
  (window as unknown as { __perfCompile: string }).__perfCompile = text;
  return text;
}
