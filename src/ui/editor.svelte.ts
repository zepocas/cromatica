import { imageLayout } from '../color/extract';
import { evaluateMesh } from '../color/mesh';
import { oklabToOklch } from '../color/oklab';
import { evaluateRamp } from '../color/ramp';
import type { Oklch } from '../color/types';
import {
  defaultDesign,
  defaultGrain,
  defaultMesh,
  defaultWarp,
  identityTransform,
  MAX_MESH_POINTS,
  MAX_STOPS,
  noFinish,
  WARP_SHAPES,
  type BasePattern,
  type ColorStop,
  type Design,
  type Finish,
  type Grain,
  type AuroraPattern,
  type PlanesPattern,
  type RampGradient,
  type PointMesh,
  type Transform,
  type Warp,
} from '../design/design';
import { randomSeed } from '../design/random';
import { shuffleDesign } from '../design/shuffle';
import { prepareRampShape, rampT } from '../engine/ramp-shape';
import { applyMat2, clampZoom, inverseTransformMatrix, transformMatrix } from '../engine/transform';
import { warpPoint } from '../engine/warp';
import { clamp, normalizeDegrees } from '../math';
import { paletteFromImage, type ImagePalette } from './image-palette';
import { PaletteEditor } from './palette.svelte';
import { emptiestSpot, median, widestGapCenter } from './placement';

export type PatternKind = BasePattern['kind'];
export type PlanesLayout = Omit<PlanesPattern, 'kind' | 'colors'>;
export type AuroraLayout = Omit<AuroraPattern, 'kind' | 'colors'>;

/** Point size limits, in screen (composition) units: radius × zoom. */
export const MIN_RADIUS = 0.05;
export const MAX_RADIUS = 1.2;
/** How far outside the frame (composition units) a point may be dragged. */
const OUTSIDE_MARGIN = 0.5;
/** Fewest stops a linear gradient keeps in the editor. */
const MIN_STOPS = 2;

/**
 * UI editing state: the design being edited, plus selection and UI-only
 * settings. Both pattern configs are kept so switching back and forth doesn't
 * lose edits; only the active one goes into the design. Palette steering,
 * color edits and adjustments live in `palette`.
 *
 * Mesh points are stored in pattern space. The UI works in screen
 * (composition) coords, so everything that takes or shows a position or size
 * goes through the transform (toScreen / toPattern, pointSize).
 */
export class EditorState {
  kind = $state<PatternKind>('mesh');
  ramp = $state<RampGradient>({
    ...structuredClone(defaultDesign.base as RampGradient),
    scale: 0.35,
    seed: 1,
    noiseStyle: 'contour',
  });
  mesh = $state<PointMesh>(structuredClone(defaultMesh));
  /** Planes layout; its colors are the ramp's stops. */
  planes = $state<PlanesLayout>({ count: 0.4, roughness: 0.5, blend: 0, seed: 1 });
  /** Aurora layout; its colors are the ramp's stops. */
  aurora = $state<AuroraLayout>({ count: 0.5, glow: 0.5, seed: 1 });
  warp = $state<Warp>({ ...defaultWarp });
  grain = $state<Grain>({ ...defaultGrain });
  finish = $state<Finish>({ ...noFinish });
  transform = $state<Transform>({ ...identityTransform });
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

  readonly palette = new PaletteEditor({
    kind: () => (this.kind === 'mesh' ? 'mesh' : 'ramp'),
    colorItems: () => this.colorItems,
    regenerate: (options, seed) => this.applyShuffle(true, false, false, options, seed),
  });

  /** Opens on a full shuffle of the mesh (palette, layout and warp). */
  constructor(opts: { shuffle?: boolean } = {}) {
    if (opts.shuffle ?? true) this.applyShuffle(true, true);
  }

  /** Plain (non-proxy) design with stops sorted, as the renderer and worker expect. */
  get design(): Design {
    let base: BasePattern;
    if (this.kind === 'mesh') {
      base = $state.snapshot(this.mesh) as PointMesh;
    } else if (this.kind === 'planes' || this.kind === 'aurora') {
      const stops = ($state.snapshot(this.ramp.stops) as ColorStop[]).sort((a, b) => a.position - b.position);
      const colors = stops.map((s) => s.color);
      base =
        this.kind === 'planes'
          ? { kind: 'planes', colors, ...this.planes }
          : { kind: 'aurora', colors, ...$state.snapshot(this.aurora) };
    } else {
      // Linear, radial and conic share one ramp: same stops and angle.
      const ramp = $state.snapshot(this.ramp) as RampGradient;
      base = { ...ramp, kind: this.kind, stops: ramp.stops.sort((a, b) => a.position - b.position) };
    }
    return {
      engineVersion: 1,
      base,
      warp: { ...this.warp },
      grain: { ...this.grain },
      finish: { ...this.finish },
      transform: { ...this.transform },
    };
  }

  // ---- Shuffle --------------------------------------------------------------

  get canShuffle(): boolean {
    return !(this.colorsLocked && this.layoutLocked);
  }

  /** Shuffle everything except the locked parts: a layout shuffle also picks the pattern kind and finishes. */
  shuffle(): void {
    if (this.canShuffle) this.applyShuffle(!this.colorsLocked, !this.layoutLocked, !this.layoutLocked);
  }

  /** New palette only, whatever the locks say. */
  shuffleColors(): void {
    this.applyShuffle(true, false);
  }

  private applyShuffle(
    colors: boolean,
    layout: boolean,
    style = false,
    palette = this.palette.shuffleOptions(),
    seed = randomSeed(),
  ): void {
    const temperature = this.palette.temperature;
    const next = shuffleDesign(this.design, { colors, layout, style, palette, seed }, this.aspect);
    const base = next.design.base;
    if (base.kind === 'mesh') {
      this.mesh = base;
      this.selectedPoint = Math.min(this.selectedPoint, base.points.length - 1);
    } else if (base.kind === 'planes') {
      const { kind: _, colors, ...layout } = base;
      this.planes = layout;
      this.setRampColors(colors);
    } else if (base.kind === 'aurora') {
      const { kind: _, colors, ...layout } = base;
      this.aurora = layout;
      this.setRampColors(colors);
    } else {
      this.ramp = base;
    }
    this.kind = base.kind;
    this.warp = next.design.warp;
    if (next.design.finish) this.finish = next.design.finish;
    // Built around the base hue already; temperature carries over.
    if (next.palette) this.palette.adopt({ info: next.palette, seed }, temperature);
  }

  /** Planes colors onto the ramp's stops, in position order; evenly spaced stops if the count changed. */
  private setRampColors(colors: Oklch[]): void {
    const stops = this.ramp.stops;
    if (stops.length === colors.length) {
      const byPosition = stops.map((_, i) => i).sort((a, b) => stops[a].position - stops[b].position);
      byPosition.forEach((stop, k) => (stops[stop].color = colors[k]));
      return;
    }
    const blend = stops[0]?.blend ?? 'oklab';
    const ramp = colors.length === 1 ? [colors[0], colors[0]] : colors;
    this.ramp.stops = ramp.map((color, i) => ({ position: i / (ramp.length - 1), color, blend }));
    this.selectedStop = 0;
  }

  // ---- Warp -----------------------------------------------------------------

  /** Step through WARP_SHAPES (wrapping), e.g. with the [ and ] keys. */
  cycleWarpShape(step: 1 | -1): void {
    const n = WARP_SHAPES.length;
    const i = WARP_SHAPES.indexOf(this.warp.shape);
    this.warp.shape = WARP_SHAPES[(i + step + n) % n];
  }

  newWarpVariation(): void {
    this.warp.seed = randomSeed();
  }

  newPlanesLayout(): void {
    this.planes.seed = randomSeed();
  }

  newAuroraLayout(): void {
    this.aurora.seed = randomSeed();
  }

  /** Noise and cells: a new arrangement of the same field. */
  newRampVariation(): void {
    this.ramp.seed = randomSeed();
  }

  // ---- Transform ------------------------------------------------------------

  /** Rotate the image on screen by `deg` (counter-clockwise). */
  rotateBy(deg: number): void {
    this.transform.rotate = normalizeDegrees(Math.round(this.transform.rotate + deg));
  }

  setRotate(deg: number): void {
    this.transform.rotate = normalizeDegrees(deg);
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
    this.transform.rotate = normalizeDegrees(-this.transform.rotate);
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

  // ---- Colors: mesh points or linear stops, whichever is active --------------

  get canAddColor(): boolean {
    return this.kind === 'mesh' ? this.canAddPoint : this.ramp.stops.length < MAX_STOPS;
  }

  get canRemoveColor(): boolean {
    return this.kind === 'mesh' ? this.canRemovePoint : this.ramp.stops.length > MIN_STOPS;
  }

  /** Points or stops of the active pattern, each with a `color`. */
  private get colorItems(): { color: Oklch }[] {
    return this.kind === 'mesh' ? this.mesh.points : this.ramp.stops;
  }

  /** Mesh: a point in the emptiest spot of the frame. Linear: a stop in the widest gap. */
  addColor(): void {
    if (this.kind === 'mesh') {
      if (!this.canAddPoint) return;
      const points = this.mesh.points.map((p) => this.toScreen(p.x, p.y));
      this.addPoint(...emptiestSpot(points, this.aspect));
    } else {
      this.addStop(widestGapCenter(this.ramp.stops.map((s) => s.position)));
    }
  }

  removeColor(i: number): void {
    if (this.kind === 'mesh') this.removePoint(i);
    else this.removeStop(i);
  }

  // ---- Palette from image ---------------------------------------------------

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
   * stop per color (D25). Mesh points start where their color sits in the
   * image, sized by its area; stops follow the image along the gradient's
   * direction. No rule made the palette, so it is custom, with no adjustment.
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
      const shape = prepareRampShape(
        { ...this.ramp, kind: this.kind === 'planes' || this.kind === 'aurora' ? 'linear' : this.kind },
        { width: this.aspect, height: 1 },
        this.transform,
      );
      const along = geo.map((g) => rampT(shape, ...this.toPattern(g.x, g.y)));
      const order = colors.map((_, i) => i).sort((i, j) => along[i] - along[j]);
      if (order.length === 1) order.push(order[0]);
      const blend = this.ramp.stops[0]?.blend ?? 'oklab';
      this.ramp.stops = order.map((i, k) => ({ position: k / (order.length - 1), color: [...colors[i]], blend }));
      this.selectedStop = 0;
    }
    this.palette.adopt(null);
  }

  // ---- Linear stops ---------------------------------------------------------

  /** A stop at position t, colored like the ramp there, with the blend of the segment it splits. */
  addStop(t: number): number | null {
    const stops = this.ramp.stops;
    if (stops.length >= MAX_STOPS) return null;
    const sorted = ($state.snapshot(stops) as ColorStop[]).sort((a, b) => a.position - b.position);
    const left = sorted.findLast((s) => s.position <= t) ?? sorted[0];
    stops.push({ position: t, color: oklabToOklch(evaluateRamp(sorted, t)), blend: left.blend });
    this.selectedStop = stops.length - 1;
    return this.selectedStop;
  }

  removeStop(i = this.selectedStop): void {
    const stops = this.ramp.stops;
    if (stops.length <= MIN_STOPS || i < 0 || i >= stops.length) return;
    stops.splice(i, 1);
    if (this.selectedStop >= i && this.selectedStop > 0) this.selectedStop--;
    this.selectedStop = Math.min(this.selectedStop, stops.length - 1);
  }

  // ---- Mesh points ----------------------------------------------------------

  /** The selected point. */
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

  /** Add a point at screen (x, y), colored like the (warped) image there, with the median radius. */
  addPoint(x: number, y: number): number | null {
    if (!this.canAddPoint) return null;
    const mesh = $state.snapshot(this.mesh) as PointMesh;
    const [px, py] = this.toPattern(...this.clampPosition(x, y));
    const [wx, wy] = warpPoint($state.snapshot(this.warp), px, py);
    const color = oklabToOklch(evaluateMesh(mesh, wx, wy));
    this.mesh.points.push({ x: px, y: py, color, radius: median(mesh.points.map((p) => p.radius)) });
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
    if (p) [p.x, p.y] = this.toPattern(...this.clampPosition(x, y));
  }
}
