// PROTOTYPE (throwaway). Question: does a seeded smin-capsule density field,
// thresholded against the existing blue-noise tile with a few flat inks, look
// right with a handful of sliders? Layers (one per ink) are engine-internal.
//   A: stipple fade     B: solid silhouette + spray halo     C: riso halftone overprint
// Delete this folder and /prototype-stipple.html to discard.
import { BLUE_NOISE_SIZE, blueNoiseRanks } from '../../src/engine/blue-noise';
import frag from './stipple.frag.glsl?raw';

const VARIANTS = [
  { key: 'A', name: 'Stipple fade' },
  { key: 'B', name: 'Solid + spray' },
  { key: 'C', name: 'Riso halftone' },
];

const VERT = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;

const params = {
  seed: 7,
  count: 20,
  size: 0.11,
  elong: 1.6,
  smoothk: 0.12,
  warp: 0.6,
  depth: 0.09,
  contrast: 1.4,
  dot: 1.5,
  misreg: 1,
};
const SLIDERS: [keyof typeof params, number, number, number][] = [
  ['seed', 0, 999, 1],
  ['count', 5, 40, 1],
  ['size', 0.03, 0.25, 0.005],
  ['elong', 0, 4, 0.05],
  ['smoothk', 0.01, 0.4, 0.01],
  ['warp', 0, 2, 0.05],
  ['depth', 0.01, 0.3, 0.005],
  ['contrast', 0.3, 3, 0.05],
  ['dot', 1, 6, 0.25],
  ['misreg', 0, 3, 0.1],
];
const inks = ['#111111', '#fbfbf8', '#f2b705', '#d62d20', '#4f7fa8'];
let paper = '#f7f5f0';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true })!;

function compile(type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? '');
  return s;
}
const prog = gl.createProgram()!;
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? '');
gl.useProgram(prog);

const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(prog, 'a');
gl.enableVertexAttribArray(loc);
gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

const tex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, BLUE_NOISE_SIZE, BLUE_NOISE_SIZE, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, blueNoiseRanks());
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

const U = (n: string) => gl.getUniformLocation(prog, n);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

function currentVariant() {
  const k = new URLSearchParams(location.search).get('variant') ?? 'A';
  return Math.max(0, VARIANTS.findIndex((v) => v.key === k));
}

function render() {
  // Fit a 16:10 canvas into the stage, at device pixels so dots stay crisp.
  const stage = canvas.parentElement!;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.min(stage.clientWidth, stage.clientHeight * 1.6);
  const cw = Math.round(w * dpr);
  const ch = Math.round((w / 1.6) * dpr);
  canvas.width = cw;
  canvas.height = ch;
  canvas.style.width = `${cw / dpr}px`;
  canvas.style.height = `${ch / dpr}px`;
  gl.viewport(0, 0, cw, ch);

  gl.uniform1i(U('u_bn'), 0);
  gl.uniform1i(U('u_bnMask'), BLUE_NOISE_SIZE - 1);
  gl.uniform1f(U('u_bnCount'), BLUE_NOISE_SIZE * BLUE_NOISE_SIZE);
  gl.uniform2f(U('u_res'), cw, ch);
  gl.uniform1f(U('u_seed'), params.seed);
  gl.uniform1i(U('u_count'), params.count);
  for (const k of ['size', 'elong', 'smoothk', 'warp', 'depth', 'contrast', 'misreg'] as const) {
    gl.uniform1f(U(`u_${k}`), params[k]);
  }
  gl.uniform1f(U('u_dot'), params.dot * dpr);
  gl.uniform1i(U('u_variant'), currentVariant());
  gl.uniform3fv(U('u_ink'), inks.flatMap(rgb));
  gl.uniform3fv(U('u_paper'), rgb(paper));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// --- Controls ---
const panel = document.getElementById('panel')!;
panel.innerHTML = '<h4>Blobs &amp; stipple</h4>';
for (const [key, min, max, step] of SLIDERS) {
  const label = document.createElement('label');
  label.innerHTML = `${key}<input type="range" min="${min}" max="${max}" step="${step}" value="${params[key]}"><span>${params[key]}</span>`;
  const input = label.querySelector('input')!;
  const out = label.querySelector('span')!;
  input.oninput = () => {
    params[key] = Number(input.value);
    out.textContent = input.value;
    render();
  };
  panel.append(label);
}
const shuffle = document.createElement('button');
shuffle.textContent = 'Shuffle seed';
shuffle.onclick = () => {
  params.seed = Math.floor(Math.random() * 1000);
  panel.querySelector<HTMLInputElement>('label input')!.value = String(params.seed);
  panel.querySelector('label span')!.textContent = String(params.seed);
  render();
};
panel.append(shuffle);

panel.insertAdjacentHTML('beforeend', '<h4>Inks (black, white, 3 colors)</h4>');
const row = document.createElement('div');
[...inks, paper].forEach((c, i) => {
  const input = document.createElement('input');
  input.type = 'color';
  input.value = c;
  input.title = i < 5 ? `ink ${i}` : 'paper';
  input.oninput = () => {
    if (i < 5) inks[i] = input.value;
    else paper = input.value;
    render();
  };
  row.append(input);
});
panel.append(row);

// --- Floating variant switcher ---
const bar = document.createElement('div');
bar.id = 'switcher';
bar.innerHTML = '<button id="prev">←</button><span id="lab"></span><button id="next">→</button>';
document.body.append(bar);
function go(delta: number) {
  const i = (currentVariant() + delta + VARIANTS.length) % VARIANTS.length;
  const url = new URL(location.href);
  url.searchParams.set('variant', VARIANTS[i].key);
  history.replaceState(null, '', url);
  bar.querySelector('#lab')!.textContent = `${VARIANTS[i].key} (${VARIANTS[i].name})`;
  render();
}
bar.querySelector<HTMLButtonElement>('#prev')!.onclick = () => go(-1);
bar.querySelector<HTMLButtonElement>('#next')!.onclick = () => go(1);
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.matches('input, textarea, [contenteditable]') && t.getAttribute('type') !== 'range') return;
  if (e.key === 'ArrowLeft') go(-1);
  if (e.key === 'ArrowRight') go(1);
});
window.addEventListener('resize', render);
go(0);
