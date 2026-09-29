import * as twgl from 'twgl.js';
import { MAX_STOPS, type Design, type LinearGradient } from '../design/design';
import { buildShaderSources, variantKey, type Defines } from './shaders';
import type { OutputSize, Renderer, Tile } from './types';

/** Uniforms shared by every pixel of an output; independent of the tile. */
function linearGradientUniforms(g: LinearGradient, output: OutputSize) {
  const count = g.stops.length;
  if (count < 1 || count > MAX_STOPS) {
    throw new RangeError(`gradient needs 1..${MAX_STOPS} stops, got ${count}`);
  }
  const pos = new Float32Array(MAX_STOPS);
  const color = new Float32Array(MAX_STOPS * 3);
  g.stops.forEach((s, i) => {
    pos[i] = s.position;
    color.set(s.color, i * 3);
  });

  // Frame is aspect × 1 centered at the origin; its extent along the unit
  // direction d is |dx|·aspect + |dy|. Dividing by it maps the frame to t ∈ [-0.5, 0.5].
  const a = (g.angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const extent = Math.abs(dx) * (output.width / output.height) + Math.abs(dy);

  return {
    u_linearAxis: [dx / extent, dy / extent],
    u_stopCount: count,
    u_stopPos: pos,
    u_stopColor: color,
  };
}

export function createRenderer(gl: WebGL2RenderingContext): Renderer {
  // Program variants keyed by their #define set (M0 has a single variant).
  const programs = new Map<string, twgl.ProgramInfo>();
  const vao = gl.createVertexArray();

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
    render(design: Design, output: OutputSize, tile: Tile) {
      const info = getProgram({ MAX_STOPS });

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
      gl.deleteVertexArray(vao);
    },
  };
}
