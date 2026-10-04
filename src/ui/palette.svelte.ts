import type { HarmonyRule, PaletteInfo, PaletteMood, PaletteOptions, ValueKey } from '../color/harmony';
import { relinkPalette, remixShift, shiftPalette } from '../color/linked';
import { applyTemperature, type Temperature } from '../color/temperature';
import type { Oklch } from '../color/types';
import { createRng, randomSeed } from '../design/random';
import { normalizeDegrees } from '../math';

/** Who owns a set of colors: the mesh's points, or the stops all ramp gradients share. */
export type PaletteOwner = 'mesh' | 'ramp';

/** What the palette editor needs from the editor that owns the pattern. */
export interface PaletteHost {
  /** Whose colors are active; palette state is kept per owner. */
  kind(): PaletteOwner;
  /** The active pattern's points or stops, each with a mutable color. */
  colorItems(): { color: Oklch }[];
  /** Give the active pattern a generated palette from this seed (fresh when omitted), keeping its layout. */
  regenerate(options: PaletteOptions, seed?: number): void;
}

/**
 * Non-destructive adjustments (D27): the colors on screen are `from` turned
 * by `hue` degrees, then under `temperature`. `out` is what was last
 * rendered; once the colors differ from it (a direct edit), the adjustment no
 * longer applies and the edited colors are the new originals.
 */
interface Adjustment {
  from: Oklch[];
  hue: number;
  temperature: Temperature;
  out: Oklch[];
}

const samePalette = (a: readonly Oklch[], b: readonly Oklch[]) =>
  a.length === b.length && a.every((c, i) => c[0] === b[i][0] && c[1] === b[i][1] && c[2] === b[i][2]);

/** Copies with no Svelte proxies, so they can be compared and stored. */
const plain = (colors: readonly Oklch[]): Oklch[] => colors.map((c) => [c[0], c[1], c[2]]);

/**
 * The palette side of the editor: how new palettes are steered (rule, mood,
 * key, base hue), how existing colors are edited (linked, remix, order), and
 * the hue and temperature adjustments. State is kept per pattern kind.
 */
export class PaletteEditor {
  /** Keep the current palette's rule, mood and key for ⟳ and shuffle; off = all random. */
  keep = $state(false);
  /** Linked: editing one color moves the whole palette with it (keeps the harmony). */
  linked = $state(false);
  /** Hue new palettes are built around; null = random. Moving it turns the current palette. */
  baseHue = $state<number | null>(null);
  /** What each pattern's palette was generated with; null = custom (imported, or not generated yet). */
  private infos = $state<Record<PaletteOwner, PaletteInfo | null>>({ mesh: null, ramp: null });
  /** The seed each pattern's palette was generated from, so steering it regenerates the same palette. */
  private seeds: Record<PaletteOwner, number | null> = { mesh: null, ramp: null };
  private adjustments = $state.raw<Record<PaletteOwner, Adjustment | null>>({ mesh: null, ramp: null });

  constructor(private readonly host: PaletteHost) {}

  /** Rule, mood and key of the active palette; null when custom. */
  get info(): PaletteInfo | null {
    return this.infos[this.host.kind()];
  }

  /** The active pattern's colors, as plain arrays. */
  get colors(): Oklch[] {
    return plain(this.host.colorItems().map((x) => x.color));
  }

  // ---- New palettes ---------------------------------------------------------

  /** How the next shuffled palette is steered: kept rule, mood and key, and the base hue. */
  shuffleOptions(): PaletteOptions {
    const kept = this.keep ? this.info : null;
    return { rule: kept?.rule, mood: kept?.mood ?? 'any', key: kept?.key ?? 'any', baseHue: this.baseHue ?? undefined };
  }

  /** A new palette in this rule, keeping the current mood and key. */
  setRule(rule: HarmonyRule): void {
    this.regenerate({ rule });
  }

  /** A new palette in this mood, keeping the current rule and key. */
  setMood(mood: PaletteMood): void {
    this.regenerate({ mood });
  }

  /** A new palette in this value key, keeping the current rule and mood. */
  setKey(key: ValueKey): void {
    this.regenerate({ key });
  }

  /** The same palette (same seed) steered by `change`; switching back gives the original colors. */
  private regenerate(change: { rule?: HarmonyRule; mood?: PaletteMood; key?: ValueKey }): void {
    const current = this.info;
    this.host.regenerate(
      {
        rule: change.rule ?? current?.rule,
        mood: change.mood ?? current?.mood ?? 'any',
        key: change.key ?? current?.key ?? 'any',
        baseHue: this.baseHue ?? undefined,
      },
      this.seeds[this.host.kind()] ?? undefined,
    );
  }

  /**
   * The editor just gave the active pattern new colors. They are the new
   * originals; generated ones remember what made them and their seed (null =
   * custom), and a temperature carries over.
   */
  adopt(generated: { info: PaletteInfo; seed: number } | null, temperature: Temperature = 'off'): void {
    const kind = this.host.kind();
    this.infos[kind] = generated?.info ?? null;
    this.seeds[kind] = generated?.seed ?? null;
    this.adjustments = { ...this.adjustments, [kind]: null };
    if (temperature !== 'off') this.adjust({ temperature });
  }

  // ---- Editing colors -------------------------------------------------------

  /** Set color i; when linked, the other colors move by the same shift. */
  setColor(i: number, next: Oklch): void {
    const items = this.host.colorItems();
    if (!items[i]) return;
    if (this.linked) this.setAll(relinkPalette(this.colors, i, next));
    else items[i].color = next;
  }

  /** New take on the palette: one random linked shift, relationships kept. */
  remix(): void {
    this.setAll(shiftPalette(this.colors, remixShift(createRng(randomSeed()))));
  }

  /** Same colors, reassigned to different points or stops (always a different arrangement when there is one). */
  shuffleOrder(): void {
    const colors = this.colors;
    const key = (cs: Oklch[]) => cs.map((c) => c.join(',')).join('|');
    if (colors.every((c) => c.join(',') === colors[0].join(','))) return;
    const rng = createRng(randomSeed());
    const start = key(colors);
    let order = colors;
    // Retry until the arrangement actually changes (cheap: n <= 16).
    for (let attempt = 0; attempt < 20 && key(order) === start; attempt++) {
      order = colors.slice();
      for (let i = order.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    this.setAll(order);
  }

  private setAll(colors: readonly Oklch[]): void {
    this.host.colorItems().forEach((x, k) => (x.color = colors[k]));
  }

  // ---- Adjustments: base hue and temperature --------------------------------

  /** The active pattern's adjustment, if its colors are still what it rendered. */
  private get liveAdjustment(): Adjustment | null {
    const a = this.adjustments[this.host.kind()];
    return a && samePalette(a.out, this.colors) ? a : null;
  }

  /** Colors before base hue and temperature; null when nothing is adjusted. */
  get originalColors(): Oklch[] | null {
    return this.liveAdjustment?.from ?? null;
  }

  /** Degrees the palette is turned by base hue moves. */
  get hueOffset(): number {
    return this.liveAdjustment?.hue ?? 0;
  }

  /** Warm light with cool shadows, cool light with warm shadows, or off. */
  get temperature(): Temperature {
    return this.liveAdjustment?.temperature ?? 'off';
  }

  setTemperature(temperature: Temperature): void {
    this.adjust({ temperature });
  }

  /** Base hue on (at the given hue; nothing turns) or off (the turn is undone). */
  setBaseHueEnabled(on: boolean, at: number): void {
    if (on) {
      this.baseHue = Math.round(at);
      return;
    }
    if (this.hueOffset !== 0) this.adjust({ hue: 0 });
    this.baseHue = null;
  }

  /** Move the base hue; the palette turns with it, keeping its hue gaps. */
  setBaseHue(h: number): void {
    if (this.baseHue !== null) this.adjust({ hue: this.hueOffset + (h - this.baseHue) });
    this.baseHue = h;
  }

  /** Back to the original colors; the base hue goes back with them. */
  resetAdjustments(): void {
    if (this.baseHue !== null) this.baseHue = normalizeDegrees(this.baseHue - this.hueOffset);
    this.adjust({ hue: 0, temperature: 'off' });
  }

  /** Change the adjustments and render them over the original colors. */
  private adjust(change: { hue?: number; temperature?: Temperature }): void {
    const base = this.liveAdjustment ?? { from: this.colors, hue: 0, temperature: 'off' as Temperature };
    const hue = change.hue ?? base.hue;
    const temperature = change.temperature ?? base.temperature;
    const turned = hue === 0 ? base.from : shiftPalette(base.from, { hue, lightness: 0, chroma: 1 });
    this.setAll(applyTemperature(turned, temperature));
    const unchanged = hue === 0 && temperature === 'off';
    this.adjustments = {
      ...this.adjustments,
      [this.host.kind()]: unchanged ? null : { from: base.from, hue, temperature, out: this.colors },
    };
  }
}
