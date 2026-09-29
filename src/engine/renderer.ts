import * as twgl from 'twgl.js';
import { RAMP_SIZE } from '../color/types';
import { bakeRamp } from '../color/ramp';
import { MAX_STOPS, type ColorStop, type Design, type LinearGradient } from '../design/design';
import { BLUE_NOISE_SIZE, DITHER_CHANNEL_OFFSETS, blueNoiseRanks } from './blue-noise';
import { buildShaderSources, variantKey, type Defines } from './shaders';
import type { OutputSize, RenderOptions, Renderer, Tile } from './types';

/** Uniforms shared by every pixel of an output; independent of the tile. */
function linearGradientUniforms(g: LinearGradient, output: OutputSize) {
  // Frame is aspect × 1 centered at the origin; its extent along the unit
  // direction d is |dx|·aspect + |dy|. Dividing by it maps the frame to t ∈ [-0.5, 0.5].
  const a = (g.angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const extent = Math.abs(dx) * (output.width / output.height) + Math.abs(dy);
  return { u_linearAxis: [dx / extent, dy / extent] };
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
  // Program variants keyed by their #define set (M1 has a single variant).
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
      throw new RangeError(`gradient needs 1..${MAX_STOPS} stops, got ${count}`);
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
      if (!created) throw new Error(`shader compile failed (${key || 'default'}):\n${error}`);
      info = created;
      programs.set(key, info);
    }
    return info;
  }

  return {
    render(design: Design, output: OutputSize, tile: Tile, opts: RenderOptions = {}) {
      const info = getProgram({ BLUE_NOISE_SIZE });
      updateRamp(design.base.stops);

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
        ...linearGradientUniforms(design.base, output),
        u_ramp: rampTexture,
        u_rampSize: rampSize,
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
