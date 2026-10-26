// "More like this": small variations of a design. The palette, pattern kind,
// finishes and transform stay (a few variations deal the colors to other places); the layout, warp and seeds move by an amount
// set by `strength`, and bold variations may take another warp shape.
import type { Oklch } from '../color/types';
import { clamp } from '../math';
import { type BasePattern, type Design, MAX_RADIUS, MIN_RADIUS, type Warp, type WarpShape } from './design';
import { pickWeighted, type Rng } from './random';
import { WARP_SHUFFLE_TABLE } from './shuffle';

const WARP_WEIGHTS = Object.fromEntries(Object.entries(WARP_SHUFFLE_TABLE).map(([k, v]) => [k, v.weight])) as Record<
  WarpShape,
  number
>;

const unit = (v: number) => clamp(v, 0, 1);
/** Uniform in ±spread. */
const jitter = (rng: Rng, spread: number) => rng.range(-spread, spread);
const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * At strength 1: how far points, angles and sliders may move, and the odds of
 * a new seed or warp shape. Odds grow with strength², since a new seed or
 * shape can change the whole look; gentle variations should rarely do that.
 */
const NUDGE = { position: 0.15, radius: 0.35, angle: 35, slider: 0.22, stop: 0.1, reseed: 0.6, reshape: 0.5 } as const;

function mutateWarp(warp: Warp, rng: Rng, s: number): Warp {
  if (rng.next() < NUDGE.reshape * s * s) {
    const others = Object.fromEntries(
      Object.entries(WARP_WEIGHTS).filter(([k]) => k !== 'none' && k !== warp.shape),
    ) as Record<WarpShape, number>;
    const shape = pickWeighted(rng, others);
    const t = WARP_SHUFFLE_TABLE[shape];
    return { shape, amount: round4(rng.range(...t.amount)), size: round4(rng.range(...t.size)), seed: rng.uint32() };
  }
  if (warp.shape === 'none') return { ...warp };
  return {
    ...warp,
    amount: round4(unit(warp.amount + jitter(rng, NUDGE.slider * s))),
    size: round4(unit(warp.size + jitter(rng, NUDGE.slider * s))),
    seed: rng.next() < NUDGE.reseed * s * s ? rng.uint32() : warp.seed,
  };
}

function mutateBase(base: BasePattern, rng: Rng, s: number, zoom: number): BasePattern {
  const slider = (v: number) => round4(unit(v + jitter(rng, NUDGE.slider * s)));
  const seed = (v: number) => (rng.next() < NUDGE.reseed * s * s ? rng.uint32() : v);
  const move = (v: number) => round4(v + jitter(rng, NUDGE.position * s));
  switch (base.kind) {
    case 'mesh':
      return {
        ...base,
        sharpness: slider(base.sharpness),
        points: base.points.map((p) => ({
          ...p,
          x: move(p.x),
          y: move(p.y),
          radius: round4(
            clamp(p.radius * Math.exp(jitter(rng, NUDGE.radius * s)), MIN_RADIUS / zoom, MAX_RADIUS / zoom),
          ),
        })),
      };
    case 'grid':
      return { ...base, nodes: base.nodes.map((n) => ({ ...n, x: move(n.x), y: move(n.y) })) };
    case 'planes': {
      // A different plane count re-deals the whole collage, so it is as rare as a new seed.
      const count = rng.next() < NUDGE.reseed * s * s ? slider(base.count) : base.count;
      const roughness = slider(base.roughness);
      const nextSeed = seed(base.seed);
      const { edits, ...rest } = base;
      // Hand edits belong to one layout: a new count or seed deals a different one (D88).
      const keep = edits && count === base.count && nextSeed === base.seed;
      return { ...rest, ...(keep ? { edits } : {}), count, roughness, seed: nextSeed };
    }
    case 'blobs': {
      // A different blob count re-deals the whole layout, so it is as rare as a new seed (as for planes).
      const count = rng.next() < NUDGE.reseed * s * s ? slider(base.count) : base.count;
      const nextSeed = seed(base.seed);
      const { edits, ...rest } = base;
      const keep = edits && count === base.count && nextSeed === base.seed;
      return {
        ...rest,
        ...(keep ? { edits } : {}),
        count,
        size: slider(base.size),
        wobble: slider(base.wobble),
        grain: slider(base.grain),
        seed: nextSeed,
      };
    }
    case 'aurora':
      return {
        ...base,
        count: slider(base.count),
        glow: slider(base.glow),
        blend: slider(base.blend),
        seed: seed(base.seed),
      };
    default: {
      // Inner stops move but keep their order; the ends stay put.
      const stops = base.stops.map((st) => ({ ...st }));
      for (let i = 1; i < stops.length - 1; i++) {
        const lo = stops[i - 1].position;
        const hi = base.stops[i + 1].position;
        stops[i].position = round4(clamp(stops[i].position + jitter(rng, NUDGE.stop * s), lo, hi));
      }
      return {
        ...base,
        stops,
        angle: round4((((base.angle + jitter(rng, NUDGE.angle * s)) % 360) + 360) % 360),
        // Absent stays absent: an explicit undefined would hide the saved default.
        ...(base.scale !== undefined && { scale: slider(base.scale) }),
        ...(base.seed !== undefined && { seed: seed(base.seed) }),
      };
    }
  }
}

/**
 * The same colors dealt to other points, nodes or stops, as the color-order key does (`r`). Stop positions and
 * every other setting stay.
 */
export function reorderColors(design: Design, rng: Rng): Design {
  const out = structuredClone(design);
  const base = out.base;
  const slots: Oklch[] =
    base.kind === 'mesh'
      ? base.points.map((p) => p.color)
      : base.kind === 'grid'
        ? base.nodes.map((n) => n.color)
        : 'stops' in base
          ? base.stops.map((st) => st.color)
          : base.colors.slice();
  const key = (cs: Oklch[]) => cs.map((c) => c.join(',')).join('|');
  if (slots.every((c) => c.join(',') === slots[0].join(','))) return out;
  const start = key(slots);
  let order = slots;
  for (let attempt = 0; attempt < 20 && key(order) === start; attempt++) {
    order = slots.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
  }
  if (base.kind === 'mesh') base.points.forEach((p, i) => (p.color = order[i]));
  else if (base.kind === 'grid') base.nodes.forEach((n, i) => (n.color = order[i]));
  else if ('stops' in base) base.stops.forEach((st, i) => (st.color = order[i]));
  else base.colors = order;
  return out;
}

/** A variation of `design`; strength in (0, 1] scales every nudge. */
export function mutateDesign(design: Design, rng: Rng, strength: number): Design {
  const s = clamp(strength, 0, 1);
  return {
    ...structuredClone(design),
    base: mutateBase(design.base, rng, s, design.transform?.zoom ?? 1),
    warp: mutateWarp(design.warp, rng, s),
  };
}
