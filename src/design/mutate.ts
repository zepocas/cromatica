// "More like this": small variations of a design. The palette, pattern kind,
// finishes and transform stay; the layout, warp and seeds move by an amount
// set by `strength`, and bold variations may take another warp shape.
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
    case 'planes':
      // A different plane count re-deals the whole collage, so it is as rare as a new seed.
      return {
        ...base,
        count: rng.next() < NUDGE.reseed * s * s ? slider(base.count) : base.count,
        roughness: slider(base.roughness),
        seed: seed(base.seed),
      };
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

/** A variation of `design`; strength in (0, 1] scales every nudge. */
export function mutateDesign(design: Design, rng: Rng, strength: number): Design {
  const s = clamp(strength, 0, 1);
  return {
    ...structuredClone(design),
    base: mutateBase(design.base, rng, s, design.transform?.zoom ?? 1),
    warp: mutateWarp(design.warp, rng, s),
  };
}
