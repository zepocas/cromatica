import * as twgl from 'twgl.js';
import { bakeRamp, RAMP_SIZE } from '../color/ramp';
import {
  type ColorStop,
  type Design,
  type RampGradient,
  MAX_MESH_POINTS,
  MAX_STOPS,
  type AuroraPattern,
  type GridMesh,
  type PlanesPattern,
  type PointMesh,
} from '../design/design';
import { mat2Uniform, transformMatrix } from './transform';
import {
  CELL_SHADE,
  CELL_TINT,
  CONIC_CORE,
  CONTOUR_FREQ,
  CONTOUR_OCTAVES,
  CONTOUR_REPEATS,
  prepareRampShape,
  RIDGE_FREQ,
  RIDGE_GAIN,
  RIDGE_OCTAVES,
} from './ramp-shape';
import { MAX_PLANES, PLANES_SHADER_CONSTANTS, preparePlanes } from './planes';
import { AURORA_SHADER_CONSTANTS, MAX_RIBBONS, prepareAurora } from './aurora';
import { GRID_MAX_STEP, GRID_MIN_DET, GRID_STEPS, MAX_GRID_NODES, prepareGrid } from './grid';
import { GAMUT_CLIP_STEPS, prepareMesh } from '../color/mesh';
import { BLUE_NOISE_SIZE, DITHER_CHANNEL_OFFSETS, blueNoiseRanks } from './blue-noise';
import { prepareFinish, VIGNETTE_INNER } from './finish';
import { GRAIN_CHROMA, prepareGrain } from './grain';
import { buildShaderSources, variantKey, type Defines } from './shaders';
import { NEIGHBOUR_SHADER_CONSTANTS } from './neighbours';
import { prepareRelief, RELIEF_SHADER_CONSTANTS, type PreparedRelief } from './relief';
import { HALFTONE_SHADER_CONSTANTS, HALFTONE_TABLE, halftoneContrast } from './halftone';
import { prepareWarp, WARP_SHADER_CONSTANTS, type PreparedWarp } from './warp';
import type { OutputSize, RenderOptions, Renderer, Tile } from './types';

function rampShapeUniforms(g: RampGradient, output: OutputSize, transform: Design['transform']) {
  const r = prepareRampShape(g, output, transform);
  return {
    u_rampAxis: r.axis,
    u_radialScale: r.radialScale,
    u_rampFreq: r.freq,
    u_rampKey: r.key,
    u_rampKey2: r.key2,
    u_rampEdge: r.edge,
  };
}

/** Mesh uniforms, padded to MAX_MESH_POINTS; uploaded every render (tiny). */
function meshUniforms(mesh: PointMesh) {
  const m = prepareMesh(mesh);
  const points = new Float32Array(MAX_MESH_POINTS * 3);
  const colors = new Float32Array(MAX_MESH_POINTS * 3);
  points.set(m.geometry);
  colors.set(m.colors);
  return { u_meshCount: m.count, u_meshExponent: m.exponent, u_meshPoint: points, u_meshColor: colors };
}

/** Planes uniforms, padded to MAX_PLANES; uploaded every render (small). */
function planesUniforms(planes: PlanesPattern, output: OutputSize) {
  const p = preparePlanes(planes, output);
  const edges = new Float32Array(MAX_PLANES * 12);
  const bounds = new Float32Array(MAX_PLANES * 3);
  const colors = new Float32Array(MAX_PLANES * 3);
  edges.set(p.edges);
  bounds.set(p.bounds);
  colors.set(p.colors);
  return {
    u_planeCount: p.count,
    u_planeBackground: p.background,
    u_planeEdge: edges,
    u_planeBound: bounds,
    u_planeColor: colors,
    u_planeKey: p.key,
    u_planeTear: p.tear,
    u_planeRim: p.rim,
    u_planeSoft: p.soft,
  };
}

function noiseDefines(g: RampGradient): Defines {
  if (g.noiseStyle === 'ridged') {
    return {
      NOISE_LIB: 1,
      NOISE_RIDGED: 1,
      RIDGE_OCTAVES,
      RIDGE_FREQ: RIDGE_FREQ.toFixed(4),
      RIDGE_GAIN: RIDGE_GAIN.toFixed(4),
    };
  }
  return {
    NOISE_LIB: 1,
    CONTOUR_OCTAVES,
    CONTOUR_FREQ: CONTOUR_FREQ.toFixed(4),
    CONTOUR_REPEATS: CONTOUR_REPEATS.toFixed(1),
  };
}

/** Aurora uniforms, padded to MAX_RIBBONS. */
function auroraUniforms(aurora: AuroraPattern) {
  const p = prepareAurora(aurora);
  const colors = new Float32Array(MAX_RIBBONS * 3);
  const lines = new Float32Array(MAX_RIBBONS * 3);
  colors.set(p.colors);
  lines.set(p.lines);
  return {
    u_auroraCount: p.count,
    u_auroraSky: p.sky,
    u_auroraColor: colors,
    u_auroraLine: lines,
    u_auroraKey: p.key,
    u_auroraWidth: [p.up, p.down],
    u_auroraRays: p.rays,
  };
}

/** Grid uniforms, padded to MAX_GRID_NODES. */
function gridUniforms(grid: GridMesh) {
  const g = prepareGrid(grid);
  const offsets = new Float32Array(MAX_GRID_NODES * 2);
  const colors = new Float32Array(MAX_GRID_NODES * 3);
  offsets.set(g.offsets);
  colors.set(g.colors);
  return { u_gridSize: [g.cols, g.rows], u_gridRest: [g.hw, g.hh], u_gridOffset: offsets, u_gridColor: colors };
}

/** Base-pattern variant defines: one of BASE_RAMP (with its shape), BASE_MESH, BASE_PLANES. */
function baseDefines(base: Design['base']): Defines {
  const kind = base.kind;
  const defines: Defines = {
    BASE_RAMP: false,
    BASE_MESH: kind === 'mesh',
    BASE_PLANES: kind === 'planes',
    BASE_AURORA: kind === 'aurora',
    BASE_GRID: kind === 'grid',
  };
  if (kind === 'mesh') return { ...defines, MAX_MESH_POINTS, GAMUT_CLIP_STEPS };
  if (kind === 'planes') return { ...defines, ...PLANES_SHADER_CONSTANTS };
  if (kind === 'grid') {
    return {
      ...defines,
      MAX_GRID_NODES,
      GAMUT_CLIP_STEPS,
      GRID_STEPS,
      GRID_MIN_DET: GRID_MIN_DET.toExponential(),
      GRID_MAX_STEP: String(GRID_MAX_STEP),
    };
  }
  if (kind === 'aurora') return { ...defines, NOISE_LIB: 1, ...AURORA_SHADER_CONSTANTS };
  return {
    ...defines,
    BASE_RAMP: true,
    RAMP_RADIAL: kind === 'radial',
    RAMP_CONIC: kind === 'conic',
    RAMP_NOISE: kind === 'noise',
    RAMP_CELLS: kind === 'cells',
    CONIC_CORE: CONIC_CORE.toFixed(4),
    ...(kind === 'noise' ? noiseDefines(base as RampGradient) : {}),
    ...(kind === 'cells'
      ? { NOISE_LIB: 1, NOISE_CELLS: 1, CELL_TINT: CELL_TINT.toFixed(4), CELL_SHADE: CELL_SHADE.toFixed(4) }
      : {}),
  };
}

/** Warp variant defines: none for 'none' (identity), else WARP_ANY + WARP_<SHAPE>. */
function warpDefines(w: PreparedWarp): Defines {
  if (w.shape === 'none') return {};
  return { WARP_ANY: true, [`WARP_${w.shape.toUpperCase()}`]: true, ...WARP_SHADER_CONSTANTS };
}

/** Relief variant defines: none when off, so off compiles to exactly the shader without relief. */
function reliefDefines(r: PreparedRelief): Defines {
  if (r.depth === 0) return {};
  return { ...NEIGHBOUR_SHADER_CONSTANTS, ...RELIEF_SHADER_CONSTANTS, RELIEF: 1, RELIEF_GLASS: r.glass };
}

function warpUniforms(w: PreparedWarp) {
  if (w.shape === 'none') return {};
  return {
    u_warpSeed: w.seed,
    u_warpFreq: w.freq,
    u_warpAmp: w.amp,
    u_warpParam: new Float32Array(w.params),
  };
}

/** Cheap structural key of the stops; the ramp is re-baked only when it changes. */
function stopsKey(stops: readonly ColorStop[]): string {
  return stops.map((s) => `${s.position},${s.color[0]},${s.color[1]},${s.color[2]},${s.blend}`).join('|');
}

function createTexture(gl: WebGL2RenderingContext, filter: GLenum, wrap: GLenum): WebGLTexture {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  return tex;
}

export function createRenderer(gl: WebGL2RenderingContext): Renderer {
  // Program variants keyed by their #define set (base pattern × warp shape).
  const programs = new Map<string, twgl.ProgramInfo>();
  const vao = gl.createVertexArray();

  // WebGL2 only guarantees MAX_TEXTURE_SIZE >= 2048; shrink the ramp if needed.
  const rampSize = Math.min(RAMP_SIZE, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
  const rampTexture = createTexture(gl, gl.LINEAR, gl.CLAMP_TO_EDGE);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, rampSize, 1);
  let rampKey: string | undefined;

  function updateRamp(stops: ColorStop[]) {
    const count = stops.length;
    if (count < 1 || count > MAX_STOPS) {
      throw new RangeError(`A gradient needs 1 to ${MAX_STOPS} stops, got ${count}.`);
    }
    const key = stopsKey(stops);
    if (key === rampKey) return;
    const data = bakeRamp(stops, rampSize);
    gl.bindTexture(gl.TEXTURE_2D, rampTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    // FLOAT data into RGBA16F is a valid WebGL2 upload; the GPU rounds to half.
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, rampSize, 1, gl.RGBA, gl.FLOAT, data);
    rampKey = key;
  }

  // Integer texture: sampled with texelFetch only; NEAREST is required for completeness.
  const blueNoiseTexture = createTexture(gl, gl.NEAREST, gl.REPEAT);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
  const bn = BLUE_NOISE_SIZE;
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, bn, bn, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, blueNoiseRanks());
  const ditherOffsets = new Int32Array(DITHER_CHANNEL_OFFSETS.flat());

  function getProgram(defines: Defines): twgl.ProgramInfo {
    const key = variantKey(defines);
    let info = programs.get(key);
    if (!info) {
      const src = buildShaderSources(defines);
      let error = '';
      const created = twgl.createProgramInfo(gl, [src.vertex, src.fragment], (msg) => {
        error += msg + '\n';
      });
      if (!created) throw new Error(`Shader compile failed (${key || 'default'}):\n${error}`);
      info = created;
      programs.set(key, info);
    }
    return info;
  }

  return {
    render(design: Design, output: OutputSize, tile: Tile, opts: RenderOptions = {}) {
      const base = design.base;
      const warp = prepareWarp(design.warp);
      const grain = prepareGrain(design.grain);
      const finish = prepareFinish(design.finish, output);
      const relief = prepareRelief(design.finish);
      const halftone = halftoneContrast(design.finish);
      const info = getProgram({
        BLUE_NOISE_SIZE,
        VIGNETTE_INNER: VIGNETTE_INNER.toFixed(4),
        ...baseDefines(base),
        ...warpDefines(warp),
        ...reliefDefines(relief),
        ...(halftone > 0 ? { ...HALFTONE_SHADER_CONSTANTS, GAMUT_CLIP_STEPS } : {}),
      });
      let baseUniforms: object;
      if (base.kind === 'mesh') {
        baseUniforms = meshUniforms(base);
      } else if (base.kind === 'planes') {
        baseUniforms = planesUniforms(base, output);
      } else if (base.kind === 'aurora') {
        baseUniforms = auroraUniforms(base);
      } else if (base.kind === 'grid') {
        baseUniforms = gridUniforms(base);
      } else {
        updateRamp(base.stops);
        baseUniforms = {
          ...rampShapeUniforms(base, output, design.transform),
          u_ramp: rampTexture,
          u_rampSize: rampSize,
        };
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, tile.width, tile.height);
      // DITHER is on by default in GL and would make output driver-dependent.
      gl.disable(gl.DITHER);
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.CULL_FACE);

      gl.useProgram(info.program);
      twgl.setUniforms(info, {
        u_outputSize: [output.width, output.height],
        u_tile: [tile.x, tile.y, tile.width, tile.height],
        u_transform: mat2Uniform(transformMatrix(design.transform)),
        ...baseUniforms,
        ...warpUniforms(warp),
        u_grainAmp: grain.sigma,
        u_grainScale: 1 / grain.sizePx,
        u_grainChroma: GRAIN_CHROMA,
        u_vignette: finish.vignette,
        u_vignetteScale: finish.vignetteScale,
        u_bandSteps: finish.bandSteps,
        u_bandEdge: finish.bandEdge,
        u_printMix: finish.printMix,
        u_printInk: finish.printInk,
        u_printScreen: finish.printScreen,
        u_printLevels: finish.printLevels,
        u_printSpeckle: finish.printSpeckle,
        u_printEdge: finish.printEdge,
        ...(relief.depth > 0
          ? { u_reliefDepth: relief.depth, u_reliefLight: relief.light, u_reliefHalf: relief.half }
          : {}),
        ...(halftone > 0 ? { u_halftoneContrast: halftone, u_halftoneTable: new Float32Array(HALFTONE_TABLE) } : {}),
        u_blueNoise: blueNoiseTexture,
        u_ditherOffset: ditherOffsets,
        u_dither: opts.dither === false ? 0 : 1,
      });
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    },

    readPixels(width: number, height: number): Uint8Array {
      const stride = width * 4;
      const out = new Uint8Array(stride * height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, out);
      // GL rows are bottom-up; flip in place.
      const row = new Uint8Array(stride);
      for (let top = 0, bottom = height - 1; top < bottom; top++, bottom--) {
        const a = top * stride;
        const b = bottom * stride;
        row.set(out.subarray(a, a + stride));
        out.copyWithin(a, b, b + stride);
        out.set(row, b);
      }
      return out;
    },

    dispose() {
      for (const info of programs.values()) gl.deleteProgram(info.program);
      programs.clear();
      gl.deleteTexture(rampTexture);
      gl.deleteTexture(blueNoiseTexture);
      rampKey = undefined;
      gl.deleteVertexArray(vao);
    },
  };
}
