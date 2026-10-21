import type { Design } from '../design/design';

/** `?perf` turns the recorder on; off, the preview does no extra work. */
const perfParam = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('perf') : null;
export const perfEnabled = perfParam !== null;

export interface PerfSample {
  /** Pattern kind and the features that change the shader's cost, e.g. `blobs+warp:silk+relief+noise:grain`. */
  label: string;
  /** Wall time of the draw call plus a GPU sync, in ms. */
  ms: number;
  /** The frame compiled a new shader variant, so `ms` mostly measures the driver's compiler. */
  compiled: boolean;
}

export function describeDesign(d: Design): string {
  const parts: string[] = [d.base.kind];
  if (d.warp.shape !== 'none' && d.warp.amount > 0) parts.push(`warp:${d.warp.shape}`);
  const f = d.finish;
  if (f) {
    if (f.relief > 0) parts.push(`relief:${f.reliefStyle}`);
    if (f.noise.amount > 0) parts.push(`noise:${f.noise.type}`);
    if (f.vignette > 0) parts.push('vignette');
    if (f.bands > 0) parts.push('bands');
  }
  return parts.join('+');
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Rendering device as the browser reports it; the unmasked string says whether WebGL runs on a real GPU or in software. */
export function describeRenderer(gl: WebGL2RenderingContext): string {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info
    ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
    : `${gl.getParameter(gl.RENDERER)} (unmasked name not exposed)`;
}

export interface PerfLog {
  record(sample: PerfSample): void;
  /** Median draw time per label (compile frames kept apart), slowest first, as text for a bug report. */
  report(): string;
}

/** Collects samples, shows the slowest labels in a corner box and exposes `window.__perf` for the console. */
export function createPerfLog(gl: WebGL2RenderingContext): PerfLog {
  const samples: PerfSample[] = [];
  const box = document.createElement('pre');
  box.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:9999;margin:0;padding:6px 8px;max-width:60vw;' +
    'font:11px/1.35 monospace;color:#eee;background:rgba(0,0,0,.8);border-radius:4px;white-space:pre-wrap;';
  document.body.append(box);
  let queued = false;

  const log: PerfLog = {
    record(sample) {
      samples.push(sample);
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        box.textContent = log.report();
      }, 250);
    },
    report() {
      const groups = new Map<string, { draw: number[]; compile: number[] }>();
      for (const s of samples) {
        const g = groups.get(s.label) ?? { draw: [], compile: [] };
        (s.compiled ? g.compile : g.draw).push(s.ms);
        groups.set(s.label, g);
      }
      const rows = [...groups].map(([label, g]) => ({
        label,
        draw: g.draw.length ? median(g.draw) : NaN,
        compile: g.compile.length ? Math.max(...g.compile) : NaN,
        n: g.draw.length,
      }));
      rows.sort((a, b) => (b.compile || 0) - (a.compile || 0) || (b.draw || 0) - (a.draw || 0));
      const fmt = (v: number) => (Number.isNaN(v) ? '-' : v.toFixed(0));
      const last = samples[samples.length - 1];
      return [
        describeRenderer(gl),
        last ? `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}` : '',
        'draw ms (median, n) | compile ms (worst) | variant',
        ...rows
          .slice(0, 15)
          .map((r) => `${fmt(r.draw).padStart(5)} (${r.n}) | ${fmt(r.compile).padStart(5)} | ${r.label}`),
      ]
        .filter(Boolean)
        .join('\n');
    },
  };
  (window as unknown as { __perf: PerfLog }).__perf = log;
  // `?perf=compile`: time each shader variant in isolation once the page has settled (see perf-compile.ts).
  if (perfParam === 'compile') {
    setTimeout(async () => {
      const { runCompileBenchmark } = await import('./perf-compile');
      box.textContent = await runCompileBenchmark((text) => (box.textContent = text));
    }, 1500);
  }
  return log;
}
