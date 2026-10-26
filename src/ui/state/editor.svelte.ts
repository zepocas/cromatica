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
  type BlobsPattern,
  PLANE_SCALE,
  type GridMesh,
  MAX_GRID,
  MIN_GRID,
  type PlanesPattern,
  type RampGradient,
  type PointMesh,
  type Transform,
  type Warp,
  type WarpShape,
} from '../../design/design';
import { randomSeed } from '../../design/random';
import { gridLayout, shuffleDesign, WARP_SHUFFLE_TABLE } from '../../design/shuffle';
import { evaluateGrid, forwardMap, prepareGrid, restPoint } from '../../engine/grid';
import { blobCount, blobDistance, blobOutline, blobReach, prepareBlobs } from '../../engine/blobs';
import { contourPath } from './contour';
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

/** The order of the pattern list, and of `l` and `;` through it. */
export const PATTERN_KINDS = [
  'mesh',
  'grid',
  'linear',
  'radial',
  'conic',
  'noise',
  'cells',
  'planes',
  'aurora',
  'blobs',
] as const satisfies readonly PatternKind[];
export type PlanesLayout = Omit<PlanesPattern, 'kind' | 'colors'>;
export type AuroraLayout = Omit<AuroraPattern, 'kind' | 'colors'>;
export type BlobsLayout = Omit<BlobsPattern, 'kind' | 'colors'>;

export interface EditorSnapshot {
  kind: PatternKind;
  ramp: RampGradient;
  mesh: PointMesh;
  planes: PlanesLayout;
  aurora: AuroraLayout;
  blobs: BlobsLayout;
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
/** Grid of the traced blob outline under a warp: samples across the frame width. */
const OUTLINE_GRID = 160;
/** Grid points further than a blob's reach plus this are not measured against it: they are outside, and the cell edge is never that far. */
const OUTLINE_MARGIN = 0.2;
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
  planes = $state<PlanesLayout>({ count: 0.7333, roughness: 0.5, blend: 0, seed: 1 });
  /** Aurora layout; its colors are the ramp's stops. */
  aurora = $state<AuroraLayout>({ count: 0.5, glow: 0.5, blend: AURORA_BLEND, seed: 1 });
  /** Blobs layout; its colors are the ramp's stops. */
  blobs = $state<BlobsLayout>({ count: 0.5, size: 0.5, wobble: 0.65, grain: 0.25, base: 'black', seed: 1 });
  grid = $state<GridMesh>(defaultGrid());
  warp = $state<Warp>({ ...defaultWarp });
  finish = $state<Finish>(structuredClone(noFinish));
  transform = $state<Transform>({ ...identityTransform });
  selectedPoint = $state(0);
  /** Index into grid.nodes. */
  selectedNode = $state(0);
  /** Index into linear.stops (user order, not position order). */
  selectedStop = $state(0);
  /** Layout index of the plane picked on the preview (D88); -1 = none. */
  selectedPlane = $state(-1);
  /** Mesh points and grid nodes are shown on the preview; each net kind has its own switch. */
  showMeshPoints = $state(true);
  showGridNodes = $state(true);
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
    } else if (this.kind === 'planes' || this.kind === 'aurora' || this.kind === 'blobs') {
      const stops = ($state.snapshot(this.ramp.stops) as ColorStop[]).sort((a, b) => a.position - b.position);
      const colors = stops.map((s) => s.color);
      base =
        this.kind === 'planes'
          ? { kind: 'planes', colors, ...$state.snapshot(this.planes) }
          : this.kind === 'blobs'
            ? { kind: 'blobs', colors, ...$state.snapshot(this.blobs) }
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

  /** Shuffle everything: the pattern shuffle also picks the pattern kind. */
  shuffle(): void {
    this.reeled(() => this.applyShuffle(true, true, true, true));
  }

  /** Pattern and adjust only, leaving the palette alone. */
  shuffleLook(): void {
    this.reeled(() => this.applyShuffle(false, true, true, true));
  }

  /** New palette only. */
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
    } else if (base.kind === 'blobs') {
      const { kind: _, colors, ...layout } = base;
      this.blobs = layout;
      this.setRampColors(colors);
    } else {
      this.ramp = { scale: 0.35, seed: 1, noiseStyle: 'contour', ...base };
    }
    // The picked plane or blob belongs to the kind it was picked in.
    if (base.kind !== this.kind) this.selectedPlane = -1;
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
      blobs: $state.snapshot(this.blobs),
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
    this.blobs = copy.blobs;
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
    if (this.selectedPlane >= this.planeTotal) this.selectedPlane = -1;
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

  cycleKind(step: 1 | -1): void {
    const n = PATTERN_KINDS.length;
    const i = PATTERN_KINDS.indexOf(this.kind as (typeof PATTERN_KINDS)[number]);
    this.switchKind(PATTERN_KINDS[(i + step + n) % n]);
  }

  /**
   * Mesh points, grid nodes and ramp stops each keep their own colors, so a palette shuffled in one would leave the
   * others on an older one. Switching between them carries the colors on screen across, spread over the new items.
   */
  switchKind(kind: PatternKind): void {
    const owner = (k: PatternKind) => (k === 'mesh' || k === 'grid' ? k : 'ramp');
    if (owner(kind) === owner(this.kind)) {
      this.kind = kind;
      return;
    }
    const colors = this.palette.colors;
    this.kind = kind;
    const items = this.colorItems;
    const last = Math.max(1, items.length - 1);
    items.forEach((item, i) => {
      item.color = colors[Math.round((i * (colors.length - 1)) / last)];
    });
    this.palette.adopt(null);
  }

  cycleWarpShape(step: 1 | -1): void {
    const n = WARP_SHAPES.length;
    const i = WARP_SHAPES.indexOf(this.warp.shape);
    this.setWarpShape(WARP_SHAPES[(i + step + n) % n]);
  }

  /** From no warp (amount 0) a new shape would change nothing on screen, so it starts at its usual middle strength. */
  setWarpShape(shape: WarpShape): void {
    if (shape !== 'none' && this.warp.amount === 0) {
      const [lo, hi] = WARP_SHUFFLE_TABLE[shape].amount;
      this.warp.amount = (lo + hi) / 2;
    }
    this.warp.shape = shape;
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

  // ---- Planes and blobs: move and reorder (D88) -------------------------------

  private get warpActive(): boolean {
    return this.warp.shape !== 'none' && this.warp.amount > 0;
  }

  /** The layout hand edits go on: the blobs', or else the planes'. */
  private get shapeLayout(): PlanesLayout | BlobsLayout {
    return this.kind === 'blobs' ? this.blobs : this.planes;
  }

  /** How many planes or blobs the layout holds. */
  get planeTotal(): number {
    return this.kind === 'blobs' ? blobCount(this.blobs.count) : planeCount(this.planes.count);
  }

  /** Layout indexes, back to front. */
  get planeStack(): number[] {
    return planeOrder(this.shapeLayout.edits, this.planeTotal);
  }

  /** Whether the layout has any hand edit. */
  get hasShapeEdits(): boolean {
    return !!this.shapeLayout.edits;
  }

  /**
   * The planes back to front with their corners in screen (composition) coords. A warp moves what is drawn
   * where, so each corner is put where the warp shows it (found by iterating, which holds for the gentle
   * displacements of a warp); the edges stay straight, so under a warp the outlines are close, not exact.
   */
  planeShapes(): { id: number; corners: [number, number][] }[] {
    const base = this.design.base;
    if (base.kind !== 'planes') return [];
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
    const size = { width: 1920, height: 1080 };
    const p = preparePlanes(base, size);
    return p.ids.map((id, slot) => ({
      id,
      corners: [0, 1, 2, 3].map((k) => shown(p.corners[slot * 8 + k * 2], p.corners[slot * 8 + k * 2 + 1])),
    }));
  }

  /** Screen (composition) coords to the pattern point they show: the transform, then the warp. */
  private patternMap(): (x: number, y: number) => [number, number] {
    const warp = this.warpActive ? createWarp($state.snapshot(this.warp)) : null;
    return (x, y) => {
      const [px, py] = this.toPattern(x, y);
      return warp ? warp(px, py) : [px, py];
    };
  }

  /** The blob drawn at a screen point (its layout index), or -1: the topmost whose outline contains it, through the warp. */
  blobAt(x: number, y: number): number {
    const base = this.design.base;
    if (base.kind !== 'blobs') return -1;
    const p = prepareBlobs(base, { height: 1080 });
    const [px, py] = this.patternMap()(x, y);
    for (let slot = p.count - 1; slot >= 0; slot--) if (blobDistance(p, slot, px, py) < 0) return p.ids[slot];
    return -1;
  }

  /** The pattern point of every grid point over the frame: it depends on the warp, the transform and the frame, not on any blob, so it is kept until one of them changes. */
  private outlineGrid: {
    key: string;
    cols: number;
    rows: number;
    x0: number;
    y0: number;
    px: Float64Array;
    py: Float64Array;
  } | null = null;

  private warpedGrid() {
    const key = JSON.stringify([$state.snapshot(this.warp), $state.snapshot(this.transform), this.aspect]);
    if (this.outlineGrid?.key === key) return this.outlineGrid;
    const map = this.patternMap();
    const cols = OUTLINE_GRID;
    const rows = Math.max(2, Math.round(cols / this.aspect));
    const x0 = -this.aspect / 2;
    const y0 = -0.5;
    const px = new Float64Array((cols + 1) * (rows + 1));
    const py = new Float64Array((cols + 1) * (rows + 1));
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        [px[j * (cols + 1) + i], py[j * (cols + 1) + i]] = map(x0 + (i / cols) * this.aspect, y0 + j / rows);
      }
    }
    return (this.outlineGrid = { key, cols, rows, x0, y0, px, py });
  }

  /**
   * An SVG path (overlay coords: screen with y down) around blob `id`. Without a warp it is the blob's
   * outline. Under a warp that outline is not where the blob is drawn (the warp can fold it), so the edge
   * of what is drawn is traced on a grid instead.
   */
  blobOutlinePath(id: number): string {
    const base = this.design.base;
    if (base.kind !== 'blobs') return '';
    const p = prepareBlobs(base, { height: 1080 });
    const slot = p.ids.indexOf(id);
    if (slot < 0) return '';
    if (!this.warpActive) {
      const points = blobOutline(p, slot).map(([x, y]) => this.toScreen(x, y));
      return `M${points.map(([x, y]) => `${x} ${-y}`).join('L')}Z`;
    }
    const grid = this.warpedGrid();
    const { cols, rows, x0, y0, px, py } = grid;
    const [cx, cy] = p.shape0.subarray(slot * 4, slot * 4 + 2);
    const near = blobReach(p, slot) + OUTLINE_MARGIN;
    const field = new Float32Array((cols + 1) * (rows + 1)).fill(1);
    for (let k = 0; k < field.length; k++) {
      if (Math.hypot(px[k] - cx, py[k] - cy) <= near) field[k] = blobDistance(p, slot, px[k], py[k]);
    }
    return contourPath(field, cols, rows, (i, j) => [x0 + (i / cols) * this.aspect, -(y0 + j / rows)]);
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
    const s = this.shapeLayout.edits?.shifts[id];
    return s ? [s[0], s[1]] : [0, 0];
  }

  /** A screen-space move as the pattern-space offset it makes. */
  patternDelta(dx: number, dy: number): [number, number] {
    const [x0, y0] = this.toPattern(0, 0);
    const [x1, y1] = this.toPattern(dx, dy);
    return [x1 - x0, y1 - y0];
  }

  setPlaneShift(id: number, x: number, y: number): void {
    const shifts = (this.shapeLayout.edits?.shifts ?? []).map((s): [number, number] => [s[0], s[1]]);
    while (shifts.length <= id) shifts.push([0, 0]);
    shifts[id] = [x, y];
    this.writePlaneEdits(this.shapeLayout.edits?.order ?? [], shifts);
  }

  /** Move a plane or blob one step in the stack, or to the very front or back. */
  restack(id: number, to: 'back' | 'forward' | 'front' | 'backmost'): void {
    const order = this.planeStack;
    const at = order.indexOf(id);
    if (at < 0) return;
    order.splice(at, 1);
    const target = { back: at - 1, forward: at + 1, front: order.length, backmost: 0 }[to];
    order.splice(Math.max(0, Math.min(order.length, target)), 0, id);
    this.writePlaneEdits(order, this.shapeLayout.edits?.shifts ?? []);
  }

  resetPlane(id: number): void {
    const shifts = (this.shapeLayout.edits?.shifts ?? []).map((s): [number, number] => [s[0], s[1]]);
    if (id < shifts.length) shifts[id] = [0, 0];
    const scales = [...(this.shapeLayout.edits?.scales ?? [])];
    if (id < scales.length) scales[id] = 1;
    this.writePlaneEdits(this.shapeLayout.edits?.order ?? [], shifts, scales);
  }

  clearPlaneEdits(): void {
    delete this.shapeLayout.edits;
    this.selectedPlane = -1;
  }

  /** A plane's or blob's own size, as a multiple of what the layout dealt it (1 = as dealt). */
  planeScale(id: number): number {
    return this.shapeLayout.edits?.scales?.[id] ?? 1;
  }

  setPlaneScale(id: number, scale: number): void {
    const scales = [...(this.shapeLayout.edits?.scales ?? [])];
    while (scales.length <= id) scales.push(1);
    scales[id] = Math.min(PLANE_SCALE[1], Math.max(PLANE_SCALE[0], scale));
    const shifts = (this.shapeLayout.edits?.shifts ?? []).map((s): [number, number] => [s[0], s[1]]);
    this.writePlaneEdits(this.shapeLayout.edits?.order ?? [], shifts, scales);
  }

  /** Stores the edits, or none at all when they say nothing, so an untouched layout saves as it always did. */
  private writePlaneEdits(
    order: number[],
    shifts: [number, number][],
    scales = this.shapeLayout.edits?.scales ?? [],
  ): void {
    let last = shifts.length;
    while (last > 0 && shifts[last - 1][0] === 0 && shifts[last - 1][1] === 0) last--;
    const kept = shifts.slice(0, last);
    let lastScale = scales.length;
    while (lastScale > 0 && scales[lastScale - 1] === 1) lastScale--;
    const keptScales = scales.slice(0, lastScale);
    const moved = order.some((id, i) => id !== i);
    const none = !moved && kept.length === 0 && keptScales.length === 0;
    const edits = {
      order: moved ? [...order] : [],
      shifts: kept,
      ...(keptScales.length ? { scales: keptScales } : {}),
    };
    const layout = this.shapeLayout;
    if (none) delete layout.edits;
    else layout.edits = edits;
  }

  newAuroraLayout(): void {
    this.aurora.seed = randomSeed();
  }

  newBlobsLayout(): void {
    this.blobs.seed = randomSeed();
    this.clearPlaneEdits();
  }

  /** A different number of blobs deals a different layout, so hand edits go; the slider moving within one count keeps them. */
  setBlobsCount(count: number): void {
    if (blobCount(count) !== blobCount(this.blobs.count)) this.clearPlaneEdits();
    this.blobs.count = count;
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
          kind:
            this.kind === 'planes' || this.kind === 'aurora' || this.kind === 'blobs'
              ? 'linear'
              : (this.kind as RampGradient['kind']),
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
