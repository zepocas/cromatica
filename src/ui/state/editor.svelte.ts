import { imageLayout } from '../../color/extract';
import { evaluateMesh } from '../../color/mesh';
import { oklabToOklch } from '../../color/oklab';
import { evaluateRamp } from '../../color/ramp';
import type { Oklch } from '../../color/types';
import {
  AURORA_BLEND,
  MAX_RADIUS,
  MIN_RADIUS,
  defaultDesign,
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
  type AuroraPattern,
  type GridMesh,
  MAX_GRID,
  MIN_GRID,
  type PlanesPattern,
  type RampGradient,
  type PointMesh,
  type Transform,
  type Warp,
} from '../../design/design';
import { randomSeed } from '../../design/random';
import { gridLayout, shuffleDesign } from '../../design/shuffle';
import { evaluateGrid, forwardMap, prepareGrid, restPoint } from '../../engine/grid';
import { planeCount, planeOrder, preparePlanes } from '../../engine/planes';
import { prepareRampShape, rampT } from '../../engine/ramp-shape';
import { applyMat2, clampZoom, inverseTransformMatrix, transformMatrix } from '../../engine/transform';
import { createWarp, warpPoint } from '../../engine/warp';
import { clamp, normalizeDegrees } from '../../math';
import { paletteFromImage, type ImagePalette } from './image-palette';
import { PaletteEditor, type PaletteSnapshot } from './palette.svelte';
import { PinsEditor } from './pins.svelte';
import { emptiestSpot, median, widestGapCenter } from './placement';
import { Reel } from './reel.svelte';

export type PatternKind = BasePattern['kind'];
export type PlanesLayout = Omit<PlanesPattern, 'kind' | 'colors'>;
export type AuroraLayout = Omit<AuroraPattern, 'kind' | 'colors'>;

export interface EditorSnapshot {
  kind: PatternKind;
  ramp: RampGradient;
  mesh: PointMesh;
  planes: PlanesLayout;
  aurora: AuroraLayout;
  grid: GridMesh;
  warp: Warp;
  finish: Finish;
  transform: Transform;
  palette: PaletteSnapshot;
}

function defaultGrid(): GridMesh {
  const colors = defaultMesh.points.map((p) => p.color);
  const nodes = gridLayout(null, 3, 3, 16 / 9).map((n, i) => ({ ...n, color: colors[i % colors.length] }));
  return { kind: 'grid', rows: 3, cols: 3, nodes, rest: [8 / 9, 0.5] };
}

export { MAX_RADIUS, MIN_RADIUS };
/** How far outside the frame (composition units) a point may be dragged. */
const OUTSIDE_MARGIN = 0.5;
const MIN_STOPS = 2;
/** Iterations that put a plane corner where a warp shows it. */
const WARP_INVERSE_STEPS = 6;

/**
 * UI editing state: the design being edited, plus selection and UI-only
 * settings. Both pattern configs are kept so switching back and forth doesn't
 * lose edits; only the active one goes into the design. Palette steering,
 * color edits and adjustments live in `palette`.
 *
 * Mesh points are stored in pattern space. The UI works in screen
 * (composition) coords, so everything that takes or shows a position or size
 * goes through the transform (toScreen / toPattern, pointSize).
 *
 * Sections below, in order: fields, `design`, Shuffle, Warp, Transform, Colors
 * (mesh points or stops, whichever is active), Palette from image, Selection,
 * Linear stops, Grid nodes, Mesh points. See docs/UI.md for the map.
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
  aurora = $state<AuroraLayout>({ count: 0.5, glow: 0.5, blend: AURORA_BLEND, seed: 1 });
  grid = $state<GridMesh>(defaultGrid());
  warp = $state<Warp>({ ...defaultWarp });
  finish = $state<Finish>(structuredClone(noFinish));
  transform = $state<Transform>({ ...identityTransform });
  colorsLocked = $state(false);
  patternLocked = $state(false);
  /** Adjust: the finishes (noise, vignette, bands, lighting). The transform is never shuffled. */
  adjustLocked = $state(false);
  selectedPoint = $state(0);
  /** Index into grid.nodes. */
  selectedNode = $state(0);
  /** Index into linear.stops (user order, not position order). */
  selectedStop = $state(0);
  /** Layout index of the plane picked on the preview (D88); -1 = none. */
  selectedPlane = $state(-1);
  showHandles = $state(true);
  /** Palette-from-image progress or failure, shown in the colors section; '' when idle. */
  imageStatus = $state('');
  /** Frame aspect (width / height), for clamping drags to the frame. */
  aspect = $state(16 / 9);
  /** Shown on the main canvas instead of the design while a picker option is hovered; never saved or undone. */
  preview = $state.raw<Design | null>(null);

  readonly palette = new PaletteEditor({
    kind: () => (this.kind === 'mesh' || this.kind === 'grid' ? this.kind : 'ramp'),
    colorItems: () => this.colorItems,
    regenerate: (options, seed) => this.applyShuffle(true, false, false, false, options, seed),
  });

  readonly reel = new Reel<EditorSnapshot>();

  /** Picking colors on the image the palette came from. */
  readonly pins = new PinsEditor({
    kind: () => this.kind,
    aspect: () => this.aspect,
    colorItems: () => this.colorItems,
    meshPoints: () => this.mesh.points,
    canAddColor: () => this.canAddColor,
    canRemoveColor: () => this.canRemoveColor,
    selectedIndex: () => this.selectedIndex,
    toScreen: (x, y) => this.toScreen(x, y),
    movePoint: (i, x, y) => this.movePoint(i, x, y),
    addColor: () => this.addColor(),
    removeColor: (i) => this.removeColor(i),
    adoptCustomPalette: () => this.palette.adopt(null),
  });

  constructor(opts: { shuffle?: boolean } = {}) {
    if (opts.shuffle ?? true) this.applyShuffle(true, true, false, undefined);
  }

  /** Plain (non-proxy) design with stops sorted, as the renderer and worker expect. */
  get design(): Design {
    let base: BasePattern;
    if (this.kind === 'mesh') {
      base = $state.snapshot(this.mesh) as PointMesh;
    } else if (this.kind === 'grid') {
      base = $state.snapshot(this.grid) as GridMesh;
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
      finish: { ...this.finish, noise: { ...this.finish.noise } },
      transform: { ...this.transform },
    };
  }

  // ---- Shuffle --------------------------------------------------------------

  get canShuffle(): boolean {
    return !(this.colorsLocked && this.patternLocked && this.adjustLocked);
  }

  /** Shuffle everything except the locked parts: the pattern shuffle also picks the pattern kind. */
  shuffle(): void {
    if (this.canShuffle) {
      this.reeled(() =>
        this.applyShuffle(!this.colorsLocked, !this.patternLocked, !this.patternLocked, !this.adjustLocked),
      );
    }
  }

  /** New palette only, whatever the locks say. */
  shuffleColors(): void {
    this.reeled(() => this.applyShuffle(true, false, false, false));
  }

  /** Step to the previous (-1) or next (1) shuffle; false at either end. */
  stepReel(direction: -1 | 1): boolean {
    const s = this.reel.step(direction, this.snapshot());
    if (s) this.restore(s);
    return s !== null;
  }

  private reeled(shuffle: () => void): void {
    const before = this.snapshot();
    shuffle();
    this.reel.push(before, this.snapshot());
  }

  private applyShuffle(
    colors: boolean,
    layout: boolean,
    style: boolean,
    /** The adjust section: finishes and warp amount and size. Undefined: the default for `layout`. */
    adjust: boolean | undefined,
    palette = this.palette.shuffleOptions(),
    seed = randomSeed(),
  ): void {
    const next = shuffleDesign(
      this.design,
      { colors, layout, style, finish: adjust, levels: adjust, palette, seed },
      this.aspect,
    );
    this.setDesign(next.design);
    // Built around the base hue already.
    if (next.palette) this.palette.adopt({ info: next.palette, seed });
  }

  /** Make `design` the edited one. The other kinds' configs and the palette state are left alone. */
  setDesign(design: Design): void {
    const base = structuredClone(design.base);
    if (base.kind === 'mesh') {
      this.mesh = base;
    } else if (base.kind === 'planes') {
      const { kind: _, colors, ...layout } = base;
      this.planes = layout;
      this.setRampColors(colors);
    } else if (base.kind === 'grid') {
      this.grid = base;
    } else if (base.kind === 'aurora') {
      const { kind: _, colors, ...layout } = base;
      this.aurora = layout;
      this.setRampColors(colors);
    } else {
      this.ramp = { scale: 0.35, seed: 1, noiseStyle: 'contour', ...base };
    }
    this.kind = base.kind;
    this.warp = { ...design.warp };
    this.finish = structuredClone({ ...noFinish, ...design.finish });
    this.transform = { ...(design.transform ?? identityTransform) };
    this.clampSelection();
  }

  /** The design after `change`, worked out on a copy: this editor is left alone. */
  designAfter(change: (trial: EditorState) => void): Design {
    const trial = new EditorState({ shuffle: false });
    trial.aspect = this.aspect;
    trial.restore(this.snapshot());
    change(trial);
    return trial.design;
  }

  /** Show what `change` would do on the main canvas; null clears the preview. */
  previewChange(change: ((trial: EditorState) => void) | null): void {
    this.preview = change ? this.designAfter(change) : null;
  }

  /** Everything undo brings back: every kind's config and the palette's state. */
  snapshot(): EditorSnapshot {
    return {
      kind: this.kind,
      ramp: $state.snapshot(this.ramp) as RampGradient,
      mesh: $state.snapshot(this.mesh) as PointMesh,
      planes: $state.snapshot(this.planes),
      aurora: $state.snapshot(this.aurora),
      grid: $state.snapshot(this.grid) as GridMesh,
      warp: $state.snapshot(this.warp),
      finish: $state.snapshot(this.finish),
      transform: $state.snapshot(this.transform),
      palette: this.palette.snapshot(),
    };
  }

  restore(s: EditorSnapshot): void {
    const copy = structuredClone(s);
    this.kind = copy.kind;
    this.ramp = copy.ramp;
    this.mesh = copy.mesh;
    this.planes = copy.planes;
    this.aurora = copy.aurora;
    this.grid = copy.grid;
    this.warp = copy.warp;
    this.finish = copy.finish;
    this.transform = copy.transform;
    this.palette.restore(copy.palette);
    this.clampSelection();
  }

  private clampSelection(): void {
    this.selectedPoint = clamp(this.selectedPoint, 0, this.mesh.points.length - 1);
    this.selectedNode = clamp(this.selectedNode, 0, this.grid.nodes.length - 1);
    this.selectedStop = clamp(this.selectedStop, 0, this.ramp.stops.length - 1);
    if (this.selectedPlane >= planeCount(this.planes.count)) this.selectedPlane = -1;
  }

  /** Planes colors onto the ramp's stops, in position order; evenly spaced stops if the count changed. */
  private setRampColors(colors: Oklch[]): void {
    const stops = this.ramp.stops;
    if (stops.length === colors.length) {
      const byPosition = stops.map((_, i) => i).sort((a, b) => stops[a].position - stops[b].position);
      byPosition.forEach((stop, k) => (stops[stop].color = colors[k]));
      return;
    }
    const ramp = colors.length === 1 ? [colors[0], colors[0]] : colors;
    this.ramp.stops = ramp.map((color, i) => ({ position: i / (ramp.length - 1), color }));
    this.selectedStop = 0;
  }

  // ---- Warp -----------------------------------------------------------------

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
    this.clearPlaneEdits();
  }

  /** A different number of planes deals a different collage, so hand edits go; the slider moving within one count keeps them. */
  setPlanesCount(count: number): void {
    if (planeCount(count) !== planeCount(this.planes.count)) this.clearPlaneEdits();
    this.planes.count = count;
  }

  // ---- Planes: move and reorder (D88) ----------------------------------------

  private get warpActive(): boolean {
    return this.warp.shape !== 'none' && this.warp.amount > 0;
  }

  get planeTotal(): number {
    return planeCount(this.planes.count);
  }

  /** Layout indexes, back to front. */
  get planeStack(): number[] {
    return planeOrder(this.planes.edits, this.planeTotal);
  }

  /**
   * The planes back to front with their corners in screen (composition) coords. A warp moves what is drawn
   * where, so each corner is put where the warp shows it (found by iterating, which holds for the gentle
   * displacements of a warp); the edges stay straight, so under a warp the outlines are close, not exact.
   */
  planeShapes(): { id: number; corners: [number, number][] }[] {
    const base = this.design.base;
    if (base.kind !== 'planes') return [];
    const p = preparePlanes(base, { width: 1920, height: 1080 });
    const warp = this.warpActive ? createWarp($state.snapshot(this.warp)) : null;
    const shown = (cx: number, cy: number): [number, number] => {
      let tx = cx;
      let ty = cy;
      for (let i = 0; warp && i < WARP_INVERSE_STEPS; i++) {
        const [wx, wy] = warp(tx, ty);
        tx -= wx - cx;
        ty -= wy - cy;
      }
      return this.toScreen(tx, ty);
    };
    return p.ids.map((id, slot) => ({
      id,
      corners: [0, 1, 2, 3].map((k) => shown(p.corners[slot * 8 + k * 2], p.corners[slot * 8 + k * 2 + 1])),
    }));
  }

  /** The pattern point a screen point shows: the transform, then the warp. Moving by the difference of two keeps a grabbed plane under the pointer. */
  patternAt(x: number, y: number): [number, number] {
    const [px, py] = this.toPattern(x, y);
    return this.warpActive ? warpPoint($state.snapshot(this.warp), px, py) : [px, py];
  }

  get hasWarp(): boolean {
    return this.warpActive;
  }

  planeShift(id: number): [number, number] {
    const s = this.planes.edits?.shifts[id];
    return s ? [s[0], s[1]] : [0, 0];
  }

  /** A screen-space move as the pattern-space offset it makes. */
  patternDelta(dx: number, dy: number): [number, number] {
    const [x0, y0] = this.toPattern(0, 0);
    const [x1, y1] = this.toPattern(dx, dy);
    return [x1 - x0, y1 - y0];
  }

  setPlaneShift(id: number, x: number, y: number): void {
    const shifts = (this.planes.edits?.shifts ?? []).map((s): [number, number] => [s[0], s[1]]);
    while (shifts.length <= id) shifts.push([0, 0]);
    shifts[id] = [x, y];
    this.writePlaneEdits(this.planes.edits?.order ?? [], shifts);
  }

  /** Move a plane one step in the stack, or to the very front or back. */
  restack(id: number, to: 'back' | 'forward' | 'front' | 'backmost'): void {
    const order = this.planeStack;
    const at = order.indexOf(id);
    if (at < 0) return;
    order.splice(at, 1);
    const target = { back: at - 1, forward: at + 1, front: order.length, backmost: 0 }[to];
    order.splice(Math.max(0, Math.min(order.length, target)), 0, id);
    this.writePlaneEdits(order, this.planes.edits?.shifts ?? []);
  }

  resetPlane(id: number): void {
    const shifts = (this.planes.edits?.shifts ?? []).map((s): [number, number] => [s[0], s[1]]);
    if (id < shifts.length) shifts[id] = [0, 0];
    this.writePlaneEdits(this.planes.edits?.order ?? [], shifts);
  }

  clearPlaneEdits(): void {
    delete this.planes.edits;
    this.selectedPlane = -1;
  }

  /** Stores the edits, or none at all when they say nothing, so an untouched layout saves as it always did. */
  private writePlaneEdits(order: number[], shifts: [number, number][]): void {
    let last = shifts.length;
    while (last > 0 && shifts[last - 1][0] === 0 && shifts[last - 1][1] === 0) last--;
    const kept = shifts.slice(0, last);
    const moved = order.some((id, i) => id !== i);
    if (!moved && kept.length === 0) delete this.planes.edits;
    else this.planes.edits = { order: moved ? [...order] : [], shifts: kept };
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

  /** Mirror the image as seen on screen. Flips live in pattern space (before the rotation), so the rotation is negated. */
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

  /** The grid's node count is set by its rows and columns, not by adding colors. */
  get canAddColor(): boolean {
    if (this.kind === 'grid') return false;
    return this.kind === 'mesh' ? this.canAddPoint : this.ramp.stops.length < MAX_STOPS;
  }

  get canRemoveColor(): boolean {
    if (this.kind === 'grid') return false;
    return this.kind === 'mesh' ? this.canRemovePoint : this.ramp.stops.length > MIN_STOPS;
  }

  private get colorItems(): { color: Oklch }[] {
    if (this.kind === 'grid') return this.grid.nodes;
    return this.kind === 'mesh' ? this.mesh.points : this.ramp.stops;
  }

  /** Mesh: a point in the emptiest spot of the frame. Linear: a stop in the widest gap. */
  addColor(): void {
    if (this.kind === 'grid') return;
    if (this.kind === 'mesh') {
      if (!this.canAddPoint) return;
      const points = this.mesh.points.map((p) => this.toScreen(p.x, p.y));
      this.addPoint(...emptiestSpot(points, this.aspect));
    } else {
      this.addStop(widestGapCenter(this.ramp.stops.map((s) => s.position)));
    }
  }

  removeColor(i: number): void {
    if (this.kind === 'grid') return;
    if (this.kind === 'mesh') this.removePoint(i);
    else this.removeStop(i);
  }

  // ---- Palette from image ---------------------------------------------------

  async importImage(file: Blob): Promise<void> {
    this.imageStatus = 'reading image…';
    try {
      this.applyImagePalette(await paletteFromImage(file));
      // The pins window opens with the import, so the picked colors can be adjusted right away.
      this.pins.pinning = this.pins.canPin;
      this.imageStatus = '';
    } catch {
      this.imageStatus = "can't read that image";
    }
  }

  /**
   * Replace the active pattern's colors with an image's palette, one point or stop per color (D25).
   * No rule made it, so the palette is custom, with no adjustment.
   */
  applyImagePalette({ palette, aspect: imageAspect, source }: ImagePalette): void {
    if (palette.length === 0) return;
    if (source) this.pins.source = { ...source, aspect: imageAspect };
    const colors = palette.map((c) => oklabToOklch(c.color));
    const geo = imageLayout(palette, { imageAspect, frameAspect: this.aspect });
    if (this.kind === 'mesh') {
      this.mesh.points = geo.map((g, i) => {
        const [x, y] = this.toPattern(...this.clampPosition(g.x, g.y));
        const radius = clamp(g.radius, MIN_RADIUS, MAX_RADIUS) / this.transform.zoom;
        return { x, y, radius, color: colors[i] };
      });
      this.selectedPoint = 0;
    } else if (this.kind === 'grid') {
      // Each node takes the image color that sits nearest to it on screen.
      for (const node of this.grid.nodes) {
        const [x, y] = this.toScreen(node.x, node.y);
        let best = 0;
        geo.forEach((g, i) => {
          if (Math.hypot(g.x - x, g.y - y) < Math.hypot(geo[best].x - x, geo[best].y - y)) best = i;
        });
        node.color = [...colors[best]];
      }
      // Nodes share the picked colors, so their pins are spread by color match instead of stacked on one peak.
      this.pins.setSpots('nodes', []);
    } else {
      const shape = prepareRampShape(
        {
          ...this.ramp,
          kind: this.kind === 'planes' || this.kind === 'aurora' ? 'linear' : (this.kind as RampGradient['kind']),
        },
        { width: this.aspect, height: 1 },
        this.transform,
      );
      const along = geo.map((g) => rampT(shape, ...this.toPattern(g.x, g.y)));
      const order = colors.map((_, i) => i).sort((i, j) => along[i] - along[j]);
      if (order.length === 1) order.push(order[0]);
      this.ramp.stops = order.map((i, k) => ({ position: k / (order.length - 1), color: [...colors[i]] }));
      this.pins.setSpots(
        'stops',
        order.map((i) => ({ u: palette[i].x, v: palette[i].y })),
      );
      this.selectedStop = 0;
    }
    this.palette.adopt(null);
  }

  // ---- Selection ------------------------------------------------------------

  /** Index of the selected mesh point, grid node or stop, whichever is active. */
  get selectedIndex(): number {
    const i = this.kind === 'mesh' ? this.selectedPoint : this.kind === 'grid' ? this.selectedNode : this.selectedStop;
    return Math.min(i, this.colorItems.length - 1);
  }

  set selectedIndex(i: number) {
    if (this.kind === 'mesh') this.selectedPoint = i;
    else if (this.kind === 'grid') this.selectedNode = i;
    else this.selectedStop = i;
  }

  // ---- Linear stops ---------------------------------------------------------

  addStop(t: number): number | null {
    const stops = this.ramp.stops;
    if (stops.length >= MAX_STOPS) return null;
    const sorted = ($state.snapshot(stops) as ColorStop[]).sort((a, b) => a.position - b.position);
    stops.push({ position: t, color: oklabToOklch(evaluateRamp(sorted, t)) });
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

  // ---- Grid nodes -----------------------------------------------------------

  nodeCell(i: number): [row: number, col: number] {
    return [Math.floor(i / this.grid.cols), i % this.grid.cols];
  }

  /**
   * Move node i to screen (x, y). Edge nodes slide along their edge and each node stays inside its row and column
   * neighbors, so the grid spans its frame and can't fold.
   */
  moveNode(i: number, x: number, y: number): void {
    const g = this.grid;
    const node = g.nodes[i];
    if (!node) return;
    const [r, c] = this.nodeCell(i);
    let [px, py] = this.toPattern(x, y);
    const [rx, ry] = restPoint(g, r, c);
    const gapX = (2 * g.rest[0]) / (g.cols - 1);
    const gapY = (2 * g.rest[1]) / (g.rows - 1);
    const margin = 0.08;
    if (c === 0 || c === g.cols - 1) px = rx;
    else px = clamp(px, g.nodes[i - 1].x + margin * gapX, g.nodes[i + 1].x - margin * gapX);
    if (r === 0 || r === g.rows - 1) py = ry;
    else py = clamp(py, g.nodes[i - g.cols].y + margin * gapY, g.nodes[i + g.cols].y - margin * gapY);
    node.x = px;
    node.y = py;
  }

  /** New size, same picture: new nodes take the color of the current grid at their rest spots. */
  setGridSize(rows: number, cols: number): void {
    rows = clamp(Math.round(rows), MIN_GRID, MAX_GRID);
    cols = clamp(Math.round(cols), MIN_GRID, MAX_GRID);
    const g = $state.snapshot(this.grid) as GridMesh;
    if (rows === g.rows && cols === g.cols) return;
    const prepared = prepareGrid({ ...g, lines: 0 });
    const resized = { ...g, rows, cols };
    const nodes = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const [x, y] = forwardMap(prepared, ...restPoint(resized, r, c));
        nodes.push({ x, y, color: oklabToOklch(evaluateGrid(prepared, x, y)) });
      }
    }
    this.grid = { ...resized, nodes };
    this.selectedNode = Math.min(this.selectedNode, nodes.length - 1);
  }

  // ---- Mesh points ----------------------------------------------------------

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

  movePoint(i: number, x: number, y: number): void {
    const p = this.mesh.points[i];
    if (p) [p.x, p.y] = this.toPattern(...this.clampPosition(x, y));
  }
}
