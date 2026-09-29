import type { BlendMode, ColorStop } from '../design/design';
import { gamutMapToLinearSrgb, oklabToLinearSrgb, oklabToOklch, oklchToOklab } from './oklab';
import { RAMP_SIZE, type Oklab } from './types';

/*
 * Spline design
 * -------------
 * Every segment (stop i → i+1) is interpolated per channel in the coordinate
 * space of its blend mode: (L, a, b) for 'oklab', (L, C, h) for the hue modes.
 * Each channel is v0 + Δ·e(u), where e is a cubic Hermite ease whose end
 * slopes come from monotone (Fritsch–Carlson family, PCHIP weighted harmonic
 * mean) tangents computed across stops. PCHIP keeps every channel monotone
 * inside a segment, so nothing overshoots the stop values.
 *
 * Tangents at an interior stop:
 * - L is shared by all modes, so it always gets the PCHIP tangent.
 * - The other two channels get PCHIP when both neighbouring segments use the
 *   same space (hue modes share L, C, h); otherwise their tangent is 0. With
 *   C' = h' = 0 (or a' = b' = 0) the Oklab derivative on both sides reduces
 *   to (L', 0, 0), so even a mode change is C1 in Oklab.
 * - Ends of a run (hard edges) use the one-sided secant, except a first/last
 *   stop that borders a hold region inside [0, 1], which eases in with slope 0
 *   so the hold does not create a Mach band.
 *
 * Hue handling:
 * - 'oklch-short' / 'oklch-long': hue linear (in the eased parameter) along
 *   the shorter / longer arc, CSS Color 4 style. A near-gray end
 *   (C < HUE_EPS) takes the other end's hue.
 * - 'oklab-chroma': L and C interpolate, hue rotates along the shorter arc
 *   but its progress is weighted by chroma ("premultiplied" by C, like alpha):
 *   s = e·C1 / ((1−e)·C0 + e·C1). Equal chromas give a uniform rotation; as
 *   one end goes gray the rotation collapses onto it, so the path tends
 *   continuously to the straight Oklab line with no gray dip. PCHIP for this
 *   channel runs on the weighted path's natural end slopes (δ·C1/C0 at the
 *   start, δ·C0/C1 at the end), so hue stays C1 and monotone across stops.
 */

const HUE_EPS = 1e-4;
const MAX_SLOPE = 3;

type Vec3 = [number, number, number];

interface Segment {
  x0: number;
  len: number;
  lch: boolean;
  premult: boolean;
  c0: number;
  c1: number;
  v0: Vec3;
  d: Vec3;
  alpha: Vec3;
  beta: Vec3;
}

interface CompiledRamp {
  first: Oklab;
  last: Oklab;
  x0: number;
  x1: number;
  segments: Segment[];
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function hueDelta(h0: number, h1: number, mode: BlendMode): number {
  const short = ((((h1 - h0) % 360) + 540) % 360) - 180;
  if (mode !== 'oklch-long') return short;
  // CSS Color 4 'longer': equal hues go all the way around.
  return short > 0 ? short - 360 : short + 360;
}

function makeSegment(a: ColorStop, b: ColorStop): Segment {
  const x0 = clamp01(a.position);
  const len = clamp01(b.position) - x0;
  const zero: Vec3 = [0, 0, 0];
  if (a.blend === 'oklab') {
    const la = oklchToOklab(a.color);
    const lb = oklchToOklab(b.color);
    return {
      x0, len, lch: false, premult: false, c0: 0, c1: 0,
      v0: la, d: [lb[0] - la[0], lb[1] - la[1], lb[2] - la[2]], alpha: [...zero], beta: [...zero],
    };
  }
  // Round-trip through Oklab to normalize negative chroma / wild hues.
  const [l0, c0, h0raw] = oklabToOklch(oklchToOklab(a.color));
  const [l1, c1, h1raw] = oklabToOklch(oklchToOklab(b.color));
  let h0 = h0raw;
  let dh = 0;
  if (Math.min(c0, c1) >= HUE_EPS) dh = hueDelta(h0raw, h1raw, a.blend);
  else if (c0 < c1) h0 = h1raw;
  return {
    x0, len, lch: true, premult: a.blend === 'oklab-chroma', c0, c1,
    v0: [l0, c0, h0], d: [l1 - l0, c1 - c0, dh], alpha: [...zero], beta: [...zero],
  };
}

/** PCHIP interior tangent from the secants and lengths of both sides. */
function pchipTangent(dl: number, dr: number, hl: number, hr: number): number {
  if (dl * dr <= 0) return 0;
  const w1 = 2 * hr + hl;
  const w2 = hr + 2 * hl;
  return (w1 + w2) / (w1 / dl + w2 / dr);
}

function clampSlope(x: number): number {
  return x > MAX_SLOPE ? MAX_SLOPE : x > 0 ? x : 0;
}

function compile(input: ColorStop[]): CompiledRamp {
  const stops = [...input].sort((p, q) => p.position - q.position);
  const n = stops.length;
  if (n === 0) return { first: [0, 0, 0], last: [0, 0, 0], x0: 0, x1: 1, segments: [] };
  const first = oklchToOklab(stops[0].color);
  const last = oklchToOklab(stops[n - 1].color);
  const x0 = clamp01(stops[0].position);
  const x1 = clamp01(stops[n - 1].position);

  // null marks a hard edge (zero-length segment).
  const segs: (Segment | null)[] = [];
  for (let i = 0; i < n - 1; i++) {
    const s = makeSegment(stops[i], stops[i + 1]);
    segs.push(s.len > 0 ? s : null);
  }

  // Natural end slopes (dv/dx with a linear ease). For oklab-chroma hue the
  // chroma weighting makes them δ·C1/C0 at the start and δ·C0/C1 at the end.
  const natStart: Vec3[] = [];
  const natEnd: Vec3[] = [];
  for (const s of segs) {
    const ns: Vec3 = [0, 0, 0];
    const ne: Vec3 = [0, 0, 0];
    if (s) {
      for (let k = 0; k < 3; k++) {
        const sec = s.d[k] / s.len;
        const premult = k === 2 && s.premult && sec !== 0;
        ns[k] = premult ? (sec * s.c1) / s.c0 : sec;
        ne[k] = premult ? (sec * s.c0) / s.c1 : sec;
      }
    }
    natStart.push(ns);
    natEnd.push(ne);
  }

  const segments: Segment[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (!s) continue;
    const left = i > 0 ? segs[i - 1] : null;
    const right = i < segs.length - 1 ? segs[i + 1] : null;
    for (let k = 0; k < 3; k++) {
      if (s.d[k] === 0) continue;
      let m0: number;
      let m1: number;
      if (left) {
        const shared = k === 0 || left.lch === s.lch;
        m0 = shared ? pchipTangent(natEnd[i - 1][k], natStart[i][k], left.len, s.len) : 0;
      } else {
        m0 = i === 0 && x0 > 0 ? 0 : natStart[i][k];
      }
      if (right) {
        const shared = k === 0 || right.lch === s.lch;
        m1 = shared ? pchipTangent(natEnd[i][k], natStart[i + 1][k], s.len, right.len) : 0;
      } else {
        m1 = i === segs.length - 1 && x1 < 1 ? 0 : natEnd[i][k];
      }
      s.alpha[k] = clampSlope(m0 / natStart[i][k]);
      s.beta[k] = clampSlope(m1 / natEnd[i][k]);
    }
    segments.push(s);
  }
  return { first, last, x0, x1, segments };
}

function evalSegment(s: Segment, u: number): Oklab {
  const u1 = 1 - u;
  const h01 = u * u * (3 - 2 * u);
  const h10 = u * u1 * u1;
  const h11 = u * u * u1;
  const e0 = h01 + s.alpha[0] * h10 - s.beta[0] * h11;
  const e1 = h01 + s.alpha[1] * h10 - s.beta[1] * h11;
  const e2 = h01 + s.alpha[2] * h10 - s.beta[2] * h11;
  const l = s.v0[0] + s.d[0] * e0;
  if (!s.lch) return [l, s.v0[1] + s.d[1] * e1, s.v0[2] + s.d[2] * e2];
  const c = Math.max(0, s.v0[1] + s.d[1] * e1);
  let p = e2;
  if (s.premult) {
    const den = (1 - e2) * s.c0 + e2 * s.c1;
    if (den > 0) p = (e2 * s.c1) / den;
  }
  const h = ((s.v0[2] + s.d[2] * p) * Math.PI) / 180;
  return [l, c * Math.cos(h), c * Math.sin(h)];
}

function evalCompiled(r: CompiledRamp, t: number): Oklab {
  const x = clamp01(t);
  const segs = r.segments;
  if (x < r.x0) return [...r.first];
  if (segs.length === 0) return [...r.last];
  if (x >= r.x1) return [...r.last];
  // The last segment starting at or before x wins, so a hard edge shows the
  // color after it.
  let i = segs.length - 1;
  while (i > 0 && segs[i].x0 > x) i--;
  const s = segs[i];
  return evalSegment(s, Math.min(1, (x - s.x0) / s.len));
}

export function evaluateRamp(stops: ColorStop[], t: number): Oklab {
  return evalCompiled(compile(stops), t);
}

export function bakeRamp(stops: ColorStop[], size = RAMP_SIZE): Float32Array {
  const ramp = compile(stops);
  const out = new Float32Array(size * 4);
  const denom = size > 1 ? size - 1 : 1;
  for (let i = 0; i < size; i++) {
    const lab = evalCompiled(ramp, i / denom);
    let rgb = oklabToLinearSrgb(lab);
    const inGamut =
      rgb[0] >= 0 && rgb[0] <= 1 && rgb[1] >= 0 && rgb[1] <= 1 && rgb[2] >= 0 && rgb[2] <= 1;
    if (!inGamut) rgb = gamutMapToLinearSrgb(oklabToOklch(lab));
    out[i * 4] = rgb[0];
    out[i * 4 + 1] = rgb[1];
    out[i * 4 + 2] = rgb[2];
    out[i * 4 + 3] = 1;
  }
  return out;
}

