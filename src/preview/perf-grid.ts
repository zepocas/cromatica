import { defaultDesign, noFinish, noWarp, type Design, type GridMesh } from '../design/design';
import { shuffleDesign } from '../design/shuffle';
import { createRenderer } from '../engine/renderer';
import { CONTEXT_ATTRIBUTES, type OutputSize } from '../engine/types';
import { planTiles } from '../export/tiles';
import { describeRenderer } from './perf';

const DRAW_SIZE: OutputSize = { width: 3840, height: 2160 };
const DRAW_TILE = 1024;
const DRAW_RUNS = 7;

/** The first shuffled grid, so every machine measures the same design. */
function shuffledGrid(): Design {
  for (let seed = 1; ; seed++) {
    const { design } = shuffleDesign(defaultDesign, { colors: true, layout: true, style: true, seed });
    if (design.base.kind === 'grid') return { ...design, warp: noWarp, finish: undefined };
  }
}

function variants(): [label: string, design: Design][] {
  const bare = shuffledGrid();
  const withLines = (lines: number): Design => ({ ...bare, base: { ...(bare.base as GridMesh), lines } });
  const lined = withLines(0.5);
  const warped: Design = { ...lined, warp: { shape: 'simplex', amount: 0.3, size: 0.35, seed: 1 } };
  return [
    ['grid', withLines(0)],
    ['grid+lines', lined],
    ['grid+lines+warp:simplex', warped],
    ['grid+lines+relief:glass', { ...lined, finish: { ...noFinish, relief: 0.35, reliefStyle: 'glass' } }],
    [
      'grid+lines+warp:simplex+relief:satin',
      { ...warped, finish: { ...noFinish, relief: 0.35, reliefStyle: 'satin' } },
    ],
  ];
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * `?perf=grid` (#98): each grid variant on a fresh context, so no variant reuses another's compiled program.
 * Where `WEBGL_debug_shaders` is exposed, the browser's translation of each fragment shader goes to
 * `window.__perfGridShaders` and the box offers it as a download. Firefox (`webgl.enable-privileged-extensions`)
 * returns its validated GLSL, not the HLSL that ANGLE hands to D3D.
 */
export async function runGridBenchmark(box: HTMLElement): Promise<void> {
  const onProgress = (text: string) => (box.textContent = text);
  const rows: string[] = [];
  const shaders: string[] = [];
  let device = 'starting…';
  // A never-true test against a number unique to this run, so no browser or driver shader cache can answer a
  // compile (they key on translated code, where a comment would be gone). The cost is one compare per pixel.
  const nonce = 1 + Math.floor(Math.random() * 1e9);
  for (const [label, design] of variants()) {
    onProgress(`${device}\nmeasuring ${rows.length + 1}: ${label}`);
    await tick();
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { ...CONTEXT_ATTRIBUTES, preserveDrawingBuffer: false });
    if (!gl) {
      device = 'WebGL2 is not available';
      break;
    }
    device = describeRenderer(gl);
    const shaderSource = gl.shaderSource.bind(gl);
    gl.shaderSource = (shader, source) =>
      shaderSource(
        shader,
        source.includes('u_outputSize')
          ? source.replace('void main() {', `void main() {\n  if (u_outputSize.x == -${nonce + rows.length}) discard;`)
          : source,
      );
    const debug = gl.getExtension('WEBGL_debug_shaders');
    if (debug) {
      // The renderer deletes its shaders after linking, so take the translation right after each compile.
      const compile = gl.compileShader.bind(gl);
      gl.compileShader = (shader) => {
        compile(shader);
        if (gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.FRAGMENT_SHADER) {
          shaders.push(`// ==== ${label}\n${debug.getTranslatedShaderSource(shader)}`);
        }
      };
    }
    const renderer = createRenderer(gl);
    const pixel = new Uint8Array(4);
    // A full 4K draw of a slow variant can outlast the Windows GPU watchdog (about 2 s) and reset the GPU,
    // so the frame is drawn in tiles, each with its own sync, as an export does.
    const draw = (output: OutputSize, tileSize: number): number => {
      let ms = 0;
      for (const tile of planTiles(output, tileSize).flat()) {
        if (canvas.width !== tile.width) canvas.width = tile.width;
        if (canvas.height !== tile.height) canvas.height = tile.height;
        const t0 = performance.now();
        renderer.render(design, output, tile, { dither: true });
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        ms += performance.now() - t0;
      }
      return ms;
    };
    const compileMs = draw({ width: 8, height: 8 }, 8);
    // An integrated GPU's clock moves a lot between draws, so one untimed draw first lets it ramp up, and the
    // fastest run is the steadiest measure of the shader's own cost.
    draw(DRAW_SIZE, DRAW_TILE);
    const runs = Array.from({ length: DRAW_RUNS }, () => draw(DRAW_SIZE, DRAW_TILE)).sort((a, b) => a - b);
    const lost = gl.isContextLost();
    renderer.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const [fastest, median] = lost ? ['lost', 'lost'] : [runs[0].toFixed(1), runs[DRAW_RUNS >> 1].toFixed(1)];
    rows.push(`${compileMs.toFixed(0).padStart(10)} | ${fastest.padStart(8)} | ${median.padStart(10)} | ${label}`);
  }
  const text = [
    device,
    `compile = first draw at 8x8 on a fresh context; draw = fastest and median of ${DRAW_RUNS} at ` +
      `${DRAW_SIZE.width}x${DRAW_SIZE.height} in ${DRAW_TILE} px tiles, after one untimed draw; ` +
      'lost = the GPU dropped the context.',
    shaders.length ? 'translated shaders: window.__perfGridShaders' : 'translated shaders: not exposed',
    'compile ms | draw min | draw median | variant',
    ...rows,
  ].join('\n');
  const w = window as unknown as { __perfGrid: string; __perfGridShaders: string };
  w.__perfGrid = text;
  w.__perfGridShaders = shaders.join('\n\n');
  box.textContent = text;
  if (shaders.length) {
    const link = document.createElement('a');
    link.textContent = '\ndownload translated shaders';
    link.style.color = 'inherit';
    link.download = 'grid-shaders.txt';
    link.href = URL.createObjectURL(new Blob([text, '\n\n', w.__perfGridShaders], { type: 'text/plain' }));
    box.append(link);
  }
}
