import type { ColorStop } from '../design/design';
import { clamp01 } from '../math';
import { gamutMapToLinearSrgb, rgbInGamut } from './gamut';
import { oklabToLinearSrgb, oklabToOklch, oklchToOklab } from './oklab';
import type { Oklab } from './types';

/** Number of entries in the baked ramp lookup texture. */
export const RAMP_SIZE = 4096;

/*
 * Spline design
 * -------------
 * Every segment (stop i → i+1) is interpolated per channel in Oklab (L, a, b).
 * Each channel is v0 + Δ·e(u), where e is a cubic Hermite ease whose end
 * slopes come from monotone (Fritsch–Carlson family, PCHIP weighted harmonic
 * mean) tangents computed across stops. PCHIP keeps every channel monotone
 * inside a segment, so nothing overshoots the stop values.
 *
 * Ends of a run (hard edges) use the one-sided secant, except a first/last
 * stop that borders a hold region inside [0, 1], which eases in with slope 0
 * so the hold does not create a Mach band.
 */

const MAX_SLOPE = 3;

type Vec3 = [number, number, number];

interface Segment {
  x0: number;
  len: number;
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

function makeSegment(a: ColorStop, b: ColorStop): Segment {
  const x0 = clamp01(a.position);
  const len = clamp01(b.position) - x0;
  const la = oklchToOklab(a.color);
  const lb = oklchToOklab(b.color);
  return {
    x0,
    len,
    v0: la,
    d: [lb[0] - la[0], lb[1] - la[1], lb[2] - la[2]],
    alpha: [0, 0, 0],
    beta: [0, 0, 0],
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

  fitEases(segs, x0, x1);
  return { first, last, x0, x1, segments: segs.filter((s): s is Segment => s !== null) };
}

/** Natural end slopes of each segment (dv/dx with a linear ease): its plain secants. */
function naturalSlopes(segs: (Segment | null)[]): Vec3[] {
  return segs.map((s) => (s ? [s.d[0] / s.len, s.d[1] / s.len, s.d[2] / s.len] : [0, 0, 0]));
}

/**
 * Set each segment's ease end slopes (alpha, beta) from PCHIP tangents
 * across neighbouring segments, per the rules in the header. x0 and x1 are
 * the first and last stop positions (holds lie outside them).
 */
function fitEases(segs: (Segment | null)[], x0: number, x1: number): void {
  const nat = naturalSlopes(segs);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (!s) continue;
    const left = i > 0 ? segs[i - 1] : null;
    const right = i < segs.length - 1 ? segs[i + 1] : null;
    for (let k = 0; k < 3; k++) {
      if (s.d[k] === 0) continue;
      let m0: number;
      let m1: number;
      if (left) m0 = pchipTangent(nat[i - 1][k], nat[i][k], left.len, s.len);
      else m0 = i === 0 && x0 > 0 ? 0 : nat[i][k];
      if (right) m1 = pchipTangent(nat[i][k], nat[i + 1][k], s.len, right.len);
      else m1 = i === segs.length - 1 && x1 < 1 ? 0 : nat[i][k];
      s.alpha[k] = clampSlope(m0 / nat[i][k]);
      s.beta[k] = clampSlope(m1 / nat[i][k]);
    }
  }
}

function evalSegment(s: Segment, u: number): Oklab {
  const u1 = 1 - u;
  const h01 = u * u * (3 - 2 * u);
  const h10 = u * u1 * u1;
  const h11 = u * u * u1;
  const e0 = h01 + s.alpha[0] * h10 - s.beta[0] * h11;
  const e1 = h01 + s.alpha[1] * h10 - s.beta[1] * h11;
  const e2 = h01 + s.alpha[2] * h10 - s.beta[2] * h11;
  return [s.v0[0] + s.d[0] * e0, s.v0[1] + s.d[1] * e1, s.v0[2] + s.d[2] * e2];
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
    if (!rgbInGamut(rgb, 0)) rgb = gamutMapToLinearSrgb(oklabToOklch(lab));
    out[i * 4] = rgb[0];
    out[i * 4 + 1] = rgb[1];
    out[i * 4 + 2] = rgb[2];
    out[i * 4 + 3] = 1;
  }
  return out;
}
