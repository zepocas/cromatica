import { imageLayout } from '../color/extract';
import { oklabToOklch } from '../color/oklab';
import { evaluateMesh } from '../color/mesh';
import {
  defaultDesign,
  defaultGrain,
  defaultMesh,
  defaultWarp,
  identityTransform,
  MAX_MESH_POINTS,
  MAX_STOPS,
  WARP_SHAPES,
  type BasePattern,
  type Design,
  type Grain,
  type LinearGradient,
  type Oklch,
  type PointMesh,
  type Transform,
  type Warp,
} from '../design/design';
import { relinkPalette, remixShift, shiftPalette } from '../color/linked';
import { applyTemperature, type Temperature } from '../color/temperature';
import { evaluateRamp } from '../color/ramp';
import { createRng, randomSeed } from '../design/random';
import { shuffleWithHarmony } from '../design/shuffle';
import type { HarmonyRule, PaletteMood, ValueKey } from '../design/shuffle.types';
import { normalizeHue } from '../color/oklab';
import {
  applyMat2,
  clampZoom,
  inverseTransformMatrix,
  normalizeAngle,
  transformMatrix,
} from '../engine/transform';
import { warpPoint } from '../engine/warp';
import { paletteFromImage, type ImagePalette } from './image-palette';

export type PatternKind = BasePattern['kind'];
/**
 * Non-destructive palette adjustments: the colors on screen are `from`
 * turned by `hue` degrees, then under `temperature`. `out` is what was last
 * rendered; once the colors differ from it (a direct edit), the adjustment
 * no longer applies and the edited colors are the new originals.
 */
interface Adjustment {
  from: Oklch[];
  hue: number;
  temperature: Temperature;
  out: Oklch[];
}

const samePalette = (a: readonly Oklch[], b: readonly Oklch[]) =>
  a.length === b.length && a.every((c, i) => c[0] === b[i][0] && c[1] === b[i][1] && c[2] === b[i][2]);

export type PaletteHarmony = { rule: HarmonyRule; mood: Exclude<PaletteMood, 'any'>; key: ValueKey };

/** Point size limits, in screen (composition) units: radius × zoom. */
export const MIN_RADIUS = 0.05;
export const MAX_RADIUS = 1.2;
/** How far outside the frame (composition units) a point may be dragged. */
const OUTSIDE_MARGIN = 0.5;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * UI editing state. Both pattern configs are kept so switching back and
 * forth doesn't lose edits; only the active one goes into the design.
 *
 * Mesh points are stored in pattern space. The UI works in screen
 * (composition) coords, so everything that takes or shows a position or
 * size goes through the transform (toScreen / toPattern, pointSize).
 */
export class EditorState {
  kind = $state<PatternKind>('mesh');
  linear = $state<LinearGradient>(structuredClone(defaultDesign.base as LinearGradient));
  mesh = $state<PointMesh>(structuredClone(defaultMesh));
  warp = $state<Warp>({ ...defaultWarp });
  grain = $state<Grain>({ ...defaultGrain });
  transform = $state<Transform>({ ...identityTransform });
  /** Palette steering for shuffles (UI only, not part of the design). */
  /** Keep the current palette's rule, mood and key for ⟳ and shuffle; off = all random. */
  keepHarmony = $state(false);
  /** Hue the harmony is built around; null = random each shuffle. Moving it turns the current palette. */
  baseHue = $state<number | null>(null);
  /** Hue and temperature adjustments over each pattern's original colors; null = none. */
  private adjustments = $state.raw<Record<PatternKind, Adjustment | null>>({ mesh: null, linear: null });
  /** Rule, mood and key each pattern's palette was last generated with; null before its first color shuffle. */
  private harmonies = $state<Record<PatternKind, PaletteHarmony | null>>({ mesh: null, linear: null });
  /** Linked: editing one color moves the whole palette with it (keeps the harmony). */
  linkColors = $state(false);
  /** Shuffle locks: a locked part is kept as is. */
  colorsLocked = $state(false);
  layoutLocked = $state(false);
  selectedPoint = $state(0);
  /** Index into linear.stops (user order, not position order). */
  selectedStop = $state(0);
  showHandles = $state(true);
  /** Palette-from-image progress or failure, shown in the colors section; '' when idle. */
  imageStatus = $state('');
  /** Frame aspect (width / height), for clamping drags to the frame. */
  aspect = $state(16 / 9);

  /** Opens on a full shuffle of the mesh (palette, layout and warp). */
  constructor(opts: { shuffle?: boolean } = {}) {
    if (opts.shuffle ?? true) this.shuffle();
  }

  /** Plain (non-proxy) design with stops sorted, as the renderer and worker expect. */
  get design(): Design {
    const base = $state.snapshot(this.kind === 'mesh' ? this.mesh : this.linear) as BasePattern;
    if (base.kind === 'linear') base.stops.sort((a, b) => a.position - b.position);
    return {
      engineVersion: 1,
      base,
      warp: { ...this.warp },
      grain: { ...this.grain },
      transform: { ...this.transform },
    };
  }

  get canShuffle(): boolean {
    return !(this.colorsLocked && this.layoutLocked);
  }

  /** Shuffle the active pattern (and warp) except for the locked parts. */
  shuffle(): void {
    if (!this.canShuffle) return;
    this.applyShuffle(!this.colorsLocked, !this.layoutLocked);
  }

  /** New palette only, whatever the locks say. */
  shuffleColors(): void {
    this.applyShuffle(true, false);
  }

  /** Rule, mood and key of the active pattern's palette. */
  get harmony(): PaletteHarmony | null {
    return this.harmonies[this.kind];
  }

  /** A new palette in this rule, keeping the current mood and key. */
  setHarmonyRule(rule: HarmonyRule): void {
    this.applyShuffle(true, false, { rule, mood: this.harmony?.mood ?? 'any', key: this.harmony?.key ?? 'any' });
  }

  /** A new palette in this mood, keeping the current rule and key. */
  setHarmonyMood(mood: Exclude<PaletteMood, 'any'>): void {
    this.applyShuffle(true, false, { rule: this.harmony?.rule, mood, key: this.harmony?.key ?? 'any' });
  }

  /** A new palette in this value key, keeping the current rule and mood. */
  setValueKey(key: ValueKey): void {
    this.applyShuffle(true, false, { rule: this.harmony?.rule, mood: this.harmony?.mood ?? 'any', key });
  }

  /** Same colors, reassigned to different points or stops. */
  shuffleColorOrder(): void {
    const items = this.colorItems;
    const colors = this.plainColors();
    if (colors.length < 2) return;
    const rng = createRng(randomSeed());
    const key = (cs: Oklch[]) => cs.map((c) => c.join(',')).join('|');
    const start = key(colors);
    if (colors.every((c) => c.join(',') === colors[0].join(','))) return;
    let order = colors;
    // Retry until the arrangement actually changes (cheap: n <= 16).
    for (let attempt = 0; attempt < 20 && key(order) === start; attempt++) {
      order = colors.slice();
      for (let i = order.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [order[i], order[j]] = [order[j], order[i]];
      }
    }
    items.forEach((x, k) => (x.color = order[k]));
  }

  private applyShuffle(
    colors: boolean,
    layout: boolean,
    force?: { rule?: HarmonyRule; mood: PaletteMood; key: ValueKey | 'any' },
  ): void {
    const kept = this.keepHarmony ? this.harmony : null;
    const palette = {
      rule: force ? force.rule : kept?.rule,
      mood: force ? force.mood : (kept?.mood ?? 'any'),
      key: force ? force.key : (kept?.key ?? 'any'),
      baseHue: this.baseHue ?? undefined,
    };
    const kind = this.kind;
    const temperature = this.temperature;
    const { design: next, harmony } = shuffleWithHarmony(
      this.design,
      { colors, layout, palette, seed: randomSeed() },
      this.aspect,
    );
    if (harmony) this.harmonies[kind] = harmony;
    if (next.base.kind === 'mesh') {
      this.mesh = next.base;
      this.selectedPoint = Math.min(this.selectedPoint, next.base.points.length - 1);
    } else {
      this.linear = next.base;
    }
    this.warp = next.warp;
    // New colors are the new originals (built around the base hue already); temperature carries over.
    if (colors) {
      this.adjustments = { ...this.adjustments, [kind]: null };
      if (temperature !== 'off') this.adjust({ temperature });
    }
  }

  /** Step through WARP_SHAPES (wrapping), e.g. with the [ and ] keys. */
  cycleWarpShape(step: 1 | -1): void {
    const n = WARP_SHAPES.length;
    const i = WARP_SHAPES.indexOf(this.warp.shape);
    this.warp.shape = WARP_SHAPES[(i + step + n) % n];
  }

  newWarpVariation(): void {
    this.warp.seed = randomSeed();
  }

  // ---- Transform ------------------------------------------------------------

  /** Rotate the image on screen by `deg` (counter-clockwise). */
  rotateBy(deg: number): void {
    this.transform.rotate = normalizeAngle(Math.round(this.transform.rotate + deg));
  }

  setRotate(deg: number): void {
    this.transform.rotate = normalizeAngle(deg);
  }

  setZoom(zoom: number): void {
    this.transform.zoom = clampZoom(zoom);
  }

  /**
   * Mirror the image as seen on screen. Flips are stored in pattern space
   * (before the rotation), so the rotation is negated to match.
   */
  flip(axis: 'x' | 'y'): void {
    if (axis === 'x') this.transform.flipX = !this.transform.flipX;
    else this.transform.flipY = !this.transform.flipY;
    this.transform.rotate = normalizeAngle(-this.transform.rotate);
  }

  resetTransform(): void {
    this.transform = { ...identityTransform };
  }

  get isTransformed(): boolean {
    const t = this.transform;
    return t.rotate !== 0 || t.zoom !== 1 || t.flipX || t.flipY;
  }

  /** Pattern → screen (composition) coords. */
  toScreen(x: number, y: number): [number, number] {
    return applyMat2(inverseTransformMatrix(this.transform), x, y);
  }

  /** Screen (composition) → pattern coords. */
  toPattern(x: number, y: number): [number, number] {
    return applyMat2(transformMatrix(this.transform), x, y);
  }

  // ---- Colors (mesh points or linear stops) -----------------------------------

  get colorCount(): number {
    return this.kind === 'mesh' ? this.mesh.points.length : this.linear.stops.length;
  }

  get canAddColor(): boolean {
    return this.kind === 'mesh' ? this.canAddPoint : this.linear.stops.length < MAX_STOPS;
  }

  get canRemoveColor(): boolean {
    return this.kind === 'mesh' ? this.canRemovePoint : this.linear.stops.length > 2;
  }

  /** Points or stops of the active pattern, each with a `color`. */
  private get colorItems(): { color: Oklch }[] {
    return this.kind === 'mesh' ? this.mesh.points : this.linear.stops;
  }

  private plainColors(): Oklch[] {
    return this.colorItems.map((x) => $state.snapshot(x.color) as Oklch);
  }

  private setPalette(colors: readonly Oklch[]): void {
    this.colorItems.forEach((x, k) => (x.color = colors[k]));
  }

  /** The active pattern's adjustment, if its colors are still what it rendered. */
  private get liveAdjustment(): Adjustment | null {
    const a = this.adjustments[this.kind];
    return a && samePalette(a.out, this.plainColors()) ? a : null;
  }

  /** Colors before hue and temperature adjustments; null when there are none. */
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

  /** Change the adjustments and render them over the original colors. */
  private adjust(change: { hue?: number; temperature?: Temperature }): void {
    const kind = this.kind;
    const base = this.liveAdjustment ?? { from: this.plainColors(), hue: 0, temperature: 'off' as Temperature };
    const hue = change.hue ?? base.hue;
    const temperature = change.temperature ?? base.temperature;
    const turned = hue === 0 ? base.from : shiftPalette(base.from, { hue, lightness: 0, chroma: 1 });
    this.setPalette(applyTemperature(turned, temperature));
    this.adjustments = {
      ...this.adjustments,
      [kind]: hue === 0 && temperature === 'off' ? null : { from: base.from, hue, temperature, out: this.plainColors() },
    };
  }

  setTemperature(temperature: Temperature): void {
    this.adjust({ temperature });
  }

  /** Base hue on (at the selected color's hue, nothing turns) or off (the turn is undone). */
  setBaseHueEnabled(on: boolean, at: number): void {
    if (on) {
      this.baseHue = Math.round(at);
    } else {
      if (this.hueOffset !== 0) this.adjust({ hue: 0 });
      this.baseHue = null;
    }
  }

  /** Move the base hue; the palette turns with it, keeping its hue gaps. */
  setBaseHue(h: number): void {
    if (this.baseHue === null) {
      this.baseHue = h;
      return;
    }
    this.adjust({ hue: this.hueOffset + (h - this.baseHue) });
    this.baseHue = h;
  }

  /** Back to the original colors; the base hue goes back with them. */
  resetAdjustments(): void {
    if (this.baseHue !== null) this.baseHue = normalizeHue(this.baseHue - this.hueOffset);
    this.adjust({ hue: 0, temperature: 'off' });
  }

  /** Set color i; when linked, the other colors move by the same shift. */
  setColor(i: number, next: Oklch): void {
    const items = this.colorItems;
    if (!items[i]) return;
    if (!this.linkColors) {
      items[i].color = next;
      return;
    }
    const out = relinkPalette(this.plainColors(), i, next);
    items.forEach((x, k) => (x.color = out[k]));
  }

  /** New take on the palette: one random linked shift, relationships kept. */
  remix(): void {
    const out = shiftPalette(this.plainColors(), remixShift(createRng(randomSeed())));
    this.colorItems.forEach((x, k) => (x.color = out[k]));
  }

  /** Take the palette from an image file (picker or drop). */
  async importImage(file: Blob): Promise<void> {
    this.imageStatus = 'reading image…';
    try {
      this.applyImagePalette(await paletteFromImage(file));
      this.imageStatus = '';
    } catch {
      this.imageStatus = "can't read that image";
    }
  }

  /**
   * Replace the active pattern's colors with an image's palette, one point or
   * stop per color. Mesh points start where their color sits in the image,
   * sized by its area; stops follow the image along the gradient's direction.
   * No rule made the palette, so its harmony becomes custom.
   */
  applyImagePalette({ palette, aspect: imageAspect }: ImagePalette): void {
    if (palette.length === 0) return;
    const colors = palette.map((c) => oklabToOklch(c.color));
    const geo = imageLayout(palette, { imageAspect, frameAspect: this.aspect });
    if (this.kind === 'mesh') {
      this.mesh.points = geo.map((g, i) => {
        const [x, y] = this.toPattern(...this.clampPosition(g.x, g.y));
        const radius = clamp(g.radius, MIN_RADIUS, MAX_RADIUS) / this.transform.zoom;
        return { x, y, radius, color: colors[i] };
      });
      this.selectedPoint = 0;
    } else {
      const a = (this.linear.angle * Math.PI) / 180;
      const along = geo.map((g) => {
        const [x, y] = this.toPattern(g.x, g.y);
        return x * Math.cos(a) + y * Math.sin(a);
      });
      const order = colors.map((_, i) => i).sort((i, j) => along[i] - along[j]);
      if (order.length === 1) order.push(order[0]);
      const blend = this.linear.stops[0]?.blend ?? 'oklab';
      this.linear.stops = order.map((i, k) => ({ position: k / (order.length - 1), color: [...colors[i]], blend }));
      this.selectedStop = 0;
    }
    this.harmonies[this.kind] = null;
    // Imported colors are the new originals, true to the photo.
    this.adjustments = { ...this.adjustments, [this.kind]: null };
  }

  /** Mesh: a point in the emptiest spot of the frame. Linear: a stop in the widest gap. */
  addColor(): void {
    if (this.kind === 'mesh') {
      const at = this.emptiestSpot();
      if (at) this.addPoint(...at);
    } else {
      this.addStop();
    }
  }

  removeColor(i: number): void {
    if (this.kind === 'mesh') this.removePoint(i);
    else this.removeStop(i);
  }

  /** Middle of the widest gap between stops, colored like the ramp there. */
  addStop(): number | null {
    const stops = this.linear.stops;
    if (stops.length >= MAX_STOPS) return null;
    const sorted = ($state.snapshot(stops) as LinearGradient['stops']).sort((a, b) => a.position - b.position);
    let t = 0.5;
    let widest = -1;
    let left = sorted[0];
    const edges = [{ position: 0 }, ...sorted, { position: 1 }];
    for (let k = 0; k + 1 < edges.length; k++) {
      const gap = edges[k + 1].position - edges[k].position;
      if (gap > widest) {
        widest = gap;
        t = (edges[k].position + edges[k + 1].position) / 2;
        left = sorted[Math.max(0, k - 1)];
      }
    }
    stops.push({ position: t, color: oklabToOklch(evaluateRamp(sorted, t)), blend: left.blend });
    this.selectedStop = stops.length - 1;
    return this.selectedStop;
  }

  removeStop(i = this.selectedStop): void {
    const stops = this.linear.stops;
    if (stops.length <= 2 || i < 0 || i >= stops.length) return;
    stops.splice(i, 1);
    if (this.selectedStop >= i && this.selectedStop > 0) this.selectedStop--;
    this.selectedStop = Math.min(this.selectedStop, stops.length - 1);
  }

  /** Screen spot inside the frame farthest from every point (coarse grid search). */
  private emptiestSpot(): [number, number] | null {
    if (!this.canAddPoint) return null;
    const pts = this.mesh.points.map((p) => this.toScreen(p.x, p.y));
    const hw = this.aspect / 2;
    const n = 12;
    let best: [number, number] = [0, 0];
    let bestD = -1;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        // Cell centers, kept off the very edge.
        const x = (((i + 0.5) / n) * 2 - 1) * hw * 0.85;
        const y = (((j + 0.5) / n) * 2 - 1) * 0.5 * 0.85;
        let d = Infinity;
        for (const [px, py] of pts) d = Math.min(d, Math.hypot(x - px, y - py));
        if (d > bestD) {
          bestD = d;
          best = [x, y];
        }
      }
    }
    return best;
  }

  // ---- Mesh points --------------------------------------------------------------

  get point() {
    return this.mesh.points[Math.min(this.selectedPoint, this.mesh.points.length - 1)];
  }

  get canAddPoint(): boolean {
    return this.mesh.points.length < MAX_MESH_POINTS;
  }

  get canRemovePoint(): boolean {
    return this.mesh.points.length > 1;
  }

  /** Keep points within reach: inside the frame plus a margin. Screen coords. */
  clampPosition(x: number, y: number): [number, number] {
    const hx = this.aspect / 2 + OUTSIDE_MARGIN;
    const hy = 0.5 + OUTSIDE_MARGIN;
    return [clamp(x, -hx, hx), clamp(y, -hy, hy)];
  }

  /** On-screen size of point i: its radius in screen units. */
  pointSize(i = this.selectedPoint): number {
    return (this.mesh.points[i]?.radius ?? 0) * this.transform.zoom;
  }

  setPointSize(i: number, size: number): void {
    const p = this.mesh.points[i];
    if (p) p.radius = clamp(size, MIN_RADIUS, MAX_RADIUS) / this.transform.zoom;
  }

  /** Add a point at screen (x, y) colored like the (warped) image there, with the median radius. */
  addPoint(x: number, y: number): number | null {
    if (!this.canAddPoint) return null;
    const plain = $state.snapshot(this.mesh) as PointMesh;
    const radii = plain.points.map((p) => p.radius).sort((a, b) => a - b);
    const mid = radii.length >> 1;
    const radius = radii.length % 2 ? radii[mid] : (radii[mid - 1] + radii[mid]) / 2;
    const [cx, cy] = this.toPattern(...this.clampPosition(x, y));
    const [wx, wy] = warpPoint($state.snapshot(this.warp), cx, cy);
    this.mesh.points.push({ x: cx, y: cy, color: oklabToOklch(evaluateMesh(plain, wx, wy)), radius });
    this.selectedPoint = this.mesh.points.length - 1;
    return this.selectedPoint;
  }

  removePoint(i = this.selectedPoint): void {
    if (!this.canRemovePoint || i < 0 || i >= this.mesh.points.length) return;
    this.mesh.points.splice(i, 1);
    if (this.selectedPoint >= i && this.selectedPoint > 0) this.selectedPoint--;
    this.selectedPoint = Math.min(this.selectedPoint, this.mesh.points.length - 1);
  }

  /** Move point i to screen (x, y). */
  movePoint(i: number, x: number, y: number): void {
    const p = this.mesh.points[i];
    if (!p) return;
    [p.x, p.y] = this.toPattern(...this.clampPosition(x, y));
  }
}
