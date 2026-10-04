import type { Oklch } from '../design/design';
import type { Harmony, HarmonyRule, PaletteMood, PaletteOptions, Rng, ValueKey } from '../design/shuffle.types';
import { inSrgbGamut, normalizeHue, oklchToOklab } from './oklab';

export const HARMONY_RULES: readonly HarmonyRule[] = [
  'monochrome', 'analogous', 'complementary', 'split-complementary', 'triadic', 'tetradic',
];

/** Relative weights used when no rule is requested. */
const RULE_WEIGHTS: Record<HarmonyRule, number> = {
  monochrome: 0.1,
  analogous: 0.3,
  complementary: 0.18,
  'split-complementary': 0.16,
  triadic: 0.13,
  tetradic: 0.13,
};

/** Probability that mood 'any' resolves to 'natural'. */
const NATURAL_SHARE = 0.65;

export const VALUE_KEYS: readonly ValueKey[] = ['high', 'full', 'low'];
/** Lightness band of the high and low keys; full uses the mood's band. */
export const KEY_BANDS: Record<Exclude<ValueKey, 'full'>, [number, number]> = {
  high: [0.7, 0.96],
  low: [0.12, 0.55],
};
/** Chroma ceiling in the high key: light colors near their cusp read as neon candy. */
const HIGH_KEY_MAX_CHROMA = 0.13;
/** How key 'any' resolves: mostly full, so shuffles keep their range. */
const KEY_WEIGHTS: Record<ValueKey, number> = { full: 0.7, high: 0.15, low: 0.15 };

function pickKey(rng: Rng): ValueKey {
  const r = rng.next();
  if (r < KEY_WEIGHTS.high) return 'high';
  if (r < KEY_WEIGHTS.high + KEY_WEIGHTS.low) return 'low';
  return 'full';
}

function keyBand(key: ValueKey, mood: Exclude<PaletteMood, 'any'>): [number, number] {
  return key === 'full' ? MOOD_TUNING[mood].l : KEY_BANDS[key];
}

/** Lightness span a palette must reach: MIN_L_SPAN on full, scaled to the narrower high and low bands. */
export function minLSpan(key: ValueKey): number {
  if (key === 'full') return MIN_L_SPAN;
  const [lo, hi] = KEY_BANDS[key];
  return Math.min(MIN_L_SPAN, 0.5 * (hi - lo));
}

interface MoodTuning {
  /** Chroma as a fraction of the max in-gamut chroma at (L, h). */
  rel: [number, number];
  /**
   * With 4+ colors, only the base hue's colors and one accent keep `rel`; the
   * other rule hues get this calmer range (null = all keep `rel`). Several
   * hues at full chroma compete and read as garish.
   */
  support: [number, number] | null;
  /** Optional accent color with stronger relative chroma (probability, range). */
  accent: [number, [number, number]];
  /** Absolute chroma ceiling, keeps "natural" from reading as neon on high-gamut hues. */
  maxChroma: number;
  /** Usable lightness band. */
  l: [number, number];
  /** Probability of a near-neutral anchor (cream or deep near-black) when count >= 3. */
  anchor: number;
  /** Probability of giving lighter slots to hues whose gamut cusp is lighter (yellow light, blue dark). */
  cuspOrder: number;
}

export const MOOD_TUNING: Record<Exclude<PaletteMood, 'any'>, MoodTuning> = {
  natural: { rel: [0.2, 0.45], support: null, accent: [0.5, [0.45, 0.72]], maxChroma: 0.15, l: [0.24, 0.95], anchor: 0.45, cuspOrder: 0.6 },
  vivid: { rel: [0.66, 0.94], support: [0.3, 0.55], accent: [0, [0, 0]], maxChroma: 0.4, l: [0.3, 0.9], anchor: 0.25, cuspOrder: 0.8 },
};

/** Minimum pairwise ΔE_OK; relaxed for large palettes (mesh with many points). */
export function minPaletteDeltaE(count: number): number {
  return count <= 6 ? 0.08 : 0.08 * Math.sqrt(6 / count);
}

/** Minimum lightness span for non-monochrome palettes of 3+ colors. */
export const MIN_L_SPAN = 0.25;

const GAMUT_MARGIN = 0.985;

/** Largest chroma at (L, h) that is still inside sRGB, by bisection. */
export function maxChroma(l: number, h: number): number {
  if (l <= 0 || l >= 1) return 0;
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inSrgbGamut([l, mid, h])) lo = mid;
    else hi = mid;
  }
  return lo;
}

const cuspCache = new Map<number, number>();

/** Lightness of the gamut cusp (max chroma) for a hue, at 1° resolution. */
export function cuspLightness(h: number): number {
  const key = Math.round(normalizeHue(h)) % 360;
  let l = cuspCache.get(key);
  if (l === undefined) {
    let best = 0;
    l = 0.5;
    for (let x = 0.3; x <= 0.99; x += 0.01) {
      const c = maxChroma(x, key);
      if (c > best) {
        best = c;
        l = x;
      }
    }
    cuspCache.set(key, l);
  }
  return l;
}

export function deltaEOk(a: Oklch, b: Oklch): number {
  const p = oklchToOklab(a);
  const q = oklchToOklab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function pickRule(rng: Rng): HarmonyRule {
  let r = rng.next();
  for (const rule of HARMONY_RULES) {
    r -= RULE_WEIGHTS[rule];
    if (r < 0) return rule;
  }
  return 'analogous';
}

function ruleOffsets(rng: Rng, rule: HarmonyRule): number[] {
  switch (rule) {
    case 'monochrome':
      return [0];
    case 'analogous': {
      const s = rng.range(22, 38);
      return [-s, 0, s];
    }
    case 'complementary':
      return [0, 180];
    case 'split-complementary': {
      const s = rng.range(25, 40);
      return [0, 180 - s, 180 + s];
    }
    case 'triadic':
      return [0, 120, 240];
    case 'tetradic': {
      // Rectangle (two complementary pairs); 90° gives the square.
      const s = rng.pick([60, 90]);
      return [0, s, 180, 180 + s];
    }
  }
}

function shuffleInPlace<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

interface Slot {
  l: number;
  h: number;
  rel: number;
  anchor?: 'light' | 'dark';
}

/** Yellow-greens at high chroma read as acid; their chroma is capped at this fraction of max. */
const ACID_HUES: [number, number] = [100, 140];
const ACID_REL = 0.55;

function planLightness(rng: Rng, count: number, mono: boolean, band: [number, number]): number[] {
  if (count === 1) return [rng.range(band[0] + 0.1, band[1] - 0.1)];
  const width = band[1] - band[0];
  const minSpan = count === 2 ? 0.2 : MIN_L_SPAN + 0.05;
  const span = Math.min(width, mono ? rng.range(0.45, 0.65) : rng.range(minSpan, Math.max(minSpan, 0.6)));
  const lo = band[0] + rng.next() * (width - span);
  const step = span / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const jitter = i === 0 || i === count - 1 ? 0 : rng.range(-0.3, 0.3) * step;
    return lo + i * step + jitter;
  });
}

/** Vivid yellows below their cusp read as olive; rotate them toward amber instead. */
function avoidOlive(l: number, h: number): number {
  const n = normalizeHue(h);
  if (n < 75 || n > 125 || l >= 0.8) return n;
  return n - Math.min(1, (0.8 - l) / 0.25) * (n - 60) * 0.7;
}

function realize(slot: Slot, cap: number, vivid: boolean): Oklch {
  const h = vivid ? avoidOlive(slot.l, slot.h) : normalizeHue(slot.h);
  const rel = h >= ACID_HUES[0] && h <= ACID_HUES[1] ? Math.min(slot.rel, ACID_REL) : slot.rel;
  const c = Math.min(rel * maxChroma(slot.l, h), cap) * GAMUT_MARGIN;
  return [slot.l, c, h];
}

function planPalette(
  rng: Rng,
  count: number,
  rule: HarmonyRule,
  mood: Exclude<PaletteMood, 'any'>,
  baseHue: number | undefined,
  key: ValueKey,
): Slot[] {
  const t = MOOD_TUNING[mood];
  const band = keyBand(key, mood);
  // Drawn either way, so a base hue doesn't shift the rest of the sequence.
  const randomBase = rng.range(0, 360);
  const base = baseHue ?? randomBase;
  const offsets = ruleOffsets(rng, rule);
  // Round-robin over the rule hues so each hue appears, then shuffle which
  // hue gets which lightness. `lead` marks the base hue's colors.
  const picks = shuffleInPlace(
    rng,
    Array.from({ length: count }, (_, i) => ({ h: base + offsets[i % offsets.length] + rng.range(-8, 8), lead: i % offsets.length === 0 })),
  );
  const ls = planLightness(rng, count, rule === 'monochrome', band);
  if (rule !== 'monochrome' && rng.next() < t.cuspOrder) {
    // Pair ascending lightness with ascending cusp lightness, so yellows sit
    // light and blues/purples dark instead of turning olive or washed out.
    picks.sort((a, b) => cuspLightness(a.h) - cuspLightness(b.h));
    if (count >= 3 && rng.next() < 0.3) {
      const i = rng.int(count - 1);
      [picks[i], picks[i + 1]] = [picks[i + 1], picks[i]];
    }
  }
  const slots: Slot[] = ls.map((l, i) => ({ l, h: picks[i].h, rel: rng.range(t.rel[0], t.rel[1]) }));
  if (t.support && count >= 4 && offsets.length > 1) {
    // Dominant + accent: one non-base color stays vivid, the rest step back.
    const others = slots.filter((_, i) => !picks[i].lead);
    const accent = rng.pick(others);
    for (const slot of others) if (slot !== accent) slot.rel = rng.range(t.support[0], t.support[1]);
  }

  if (count >= 2 && rng.next() < t.accent[0]) {
    rng.pick(slots).rel = rng.range(t.accent[1][0], t.accent[1][1]);
  }
  if (count >= 3 && rng.next() < t.anchor) {
    // Replace the lightest or darkest slot with a near-neutral: cream/off-white
    // or deep near-black. Only the one that fits the key.
    const light = rng.next() < 0.6;
    if (key === 'high' || (key === 'full' && light)) {
      const s = slots[count - 1];
      s.anchor = 'light';
      s.l = rng.range(0.93, 0.975);
      s.h = rng.range(70, 100);
    } else {
      const s = slots[0];
      s.anchor = 'dark';
      s.l = rng.range(0.17, 0.26);
    }
  }
  return slots;
}

function slotColor(slot: Slot, rng: Rng, t: MoodTuning, cap = t.maxChroma): Oklch {
  if (slot.anchor) {
    const c = slot.anchor === 'light' ? rng.range(0.012, 0.035) : rng.range(0.01, 0.04);
    return [slot.l, Math.min(c, maxChroma(slot.l, slot.h) * GAMUT_MARGIN), normalizeHue(slot.h)];
  }
  return realize(slot, cap, t === MOOD_TUNING.vivid);
}

function minDistance(colors: Oklch[]): number {
  let m = Infinity;
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) m = Math.min(m, deltaEOk(colors[i], colors[j]));
  }
  return m;
}

function lSpan(colors: Oklch[]): number {
  const ls = colors.map((c) => c[0]);
  return Math.max(...ls) - Math.min(...ls);
}

function buildOnce(
  rng: Rng,
  count: number,
  rule: HarmonyRule,
  mood: Exclude<PaletteMood, 'any'>,
  minDe: number,
  baseHue: number | undefined,
  key: ValueKey,
): Oklch[] {
  const t = MOOD_TUNING[mood];
  const band = keyBand(key, mood);
  const slots = planPalette(rng, count, rule, mood, baseHue, key);
  const cap = key === 'high' ? Math.min(t.maxChroma, HIGH_KEY_MAX_CHROMA) : t.maxChroma;
  const colors: Oklch[] = [];
  for (const slot of slots) {
    let best = slotColor(slot, rng, t, cap);
    let bestD = colors.length ? Math.min(...colors.map((c) => deltaEOk(c, best))) : Infinity;
    // Too close to an earlier color: nudge lightness (and, later, chroma) with growing steps.
    for (let attempt = 1; attempt <= 24 && bestD < minDe; attempt++) {
      const reach = 0.04 * attempt;
      const trial: Slot = {
        ...slot,
        l: Math.min(band[1] + 0.02, Math.max(band[0] - 0.06, slot.l + rng.range(-reach, reach))),
        rel: attempt > 8 && !slot.anchor ? rng.range(t.rel[0], Math.max(t.rel[1], t.accent[1][1])) : slot.rel,
        h: slot.h + (attempt > 16 ? rng.range(-15, 15) : 0),
      };
      const c = slotColor(trial, rng, t, cap);
      const d = Math.min(...colors.map((p) => deltaEOk(p, c)));
      if (d > bestD) {
        best = c;
        bestD = d;
      }
    }
    colors.push(best);
  }
  return colors;
}

/**
 * Harmony palette: a hue rule around a base hue (random unless given), a
 * deliberate lightness spread, and chroma relative to the max in-gamut chroma
 * at each (L, h).
 */
export function generatePalette(rng: Rng, count: number, opts: PaletteOptions = {}): Oklch[] {
  return generateHarmony(rng, count, opts).colors;
}

/** Like generatePalette, but also reports the rule and mood it resolved to. */
export function generateHarmony(rng: Rng, count: number, opts: PaletteOptions = {}): Harmony {
  const n = Math.max(1, Math.floor(count));
  const rule = opts.rule ?? pickRule(rng);
  const want = opts.mood ?? 'any';
  const mood = want === 'any' ? (rng.next() < NATURAL_SHARE ? 'natural' : 'vivid') : want;
  const baseHue = opts.baseHue !== undefined && Number.isFinite(opts.baseHue) ? normalizeHue(opts.baseHue) : undefined;
  // Drawn only for 'any', so palettes without a key keep their sequence.
  const key = opts.key === 'any' ? pickKey(rng) : (opts.key ?? 'full');
  const minDe = minPaletteDeltaE(n);
  const needSpan = rule !== 'monochrome' && n >= 3 ? minLSpan(key) : 0;

  let best: Oklch[] = [];
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 16; attempt++) {
    const colors = buildOnce(rng, n, rule, mood, minDe, baseHue, key);
    const d = n > 1 ? minDistance(colors) : Infinity;
    const span = lSpan(colors);
    if (d >= minDe && span >= needSpan) return { colors, rule, mood, key };
    const score = Math.min(d - minDe, span - needSpan);
    if (score > bestScore) {
      best = colors;
      bestScore = score;
    }
  }
  return { colors: best, rule, mood, key };
}
