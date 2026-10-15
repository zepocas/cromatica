import {
  frameToImage,
  imageToFrame,
  nearestSample,
  sampleColor,
  sampleGrid,
  visibleImage,
  type SamplePoint,
} from '../../color/extract';
import { oklabDistance } from '../../color/gamut';
import { oklabToOklch, oklchToOklab } from '../../color/oklab';
import type { Oklab, Oklch } from '../../color/types';
import type { ImageSource } from './image-palette';

/** A place on the image: x and y in [0, 1], y down. */
interface ImageSpot {
  u: number;
  v: number;
}

/** How close (ΔE_OK) the image at a remembered pin spot must still be to its color to keep the spot. */
const SPOT_MATCH = 0.08;

/** What the pins need from the editor that owns them. */
export interface PinsHost {
  kind(): string;
  aspect(): number;
  /** The mesh points, grid nodes or stops, whichever is active. */
  colorItems(): { color: Oklch }[];
  meshPoints(): { x: number; y: number; color: Oklch }[];
  canAddColor(): boolean;
  canRemoveColor(): boolean;
  selectedIndex(): number;
  toScreen(x: number, y: number): [number, number];
  movePoint(i: number, x: number, y: number): void;
  addColor(): void;
  removeColor(i: number): void;
  /** The colors no longer come from a rule. */
  adoptCustomPalette(): void;
}

/**
 * Picking colors on the image the palette came from: one pin per color, as a position on the image.
 * Session only: never saved, never an undo step.
 */
export class PinsEditor {
  /** The last image the colors were taken from. */
  source = $state.raw<(ImageSource & { aspect: number }) | null>(null);
  /** Picking colors on the image instead of editing the design's handles. Only while `canPin`. */
  pinning = $state(false);
  /** Where the pin of item `i` of the stops or nodes sits, remembered while the color there still matches. */
  private spots = $state.raw<{ stops: ImageSpot[]; nodes: ImageSpot[] }>({ stops: [], nodes: [] });
  private samples = new WeakMap<object, SamplePoint[]>();

  constructor(private host: PinsHost) {}

  get canPin(): boolean {
    return this.source !== null;
  }

  private get spotKey(): 'stops' | 'nodes' {
    return this.host.kind() === 'grid' ? 'nodes' : 'stops';
  }

  /** Forget the remembered pin spots of the stops or the nodes (new colors have no place on the image yet). */
  setSpots(key: 'stops' | 'nodes', spots: ImageSpot[]): void {
    this.spots = { ...this.spots, [key]: spots };
  }

  /** The part of the image pins may sit on: on the mesh what the frame shows (the rest is cropped), else all of it. */
  get area(): { u0: number; v0: number; u1: number; v1: number } {
    const source = this.source;
    if (!source || this.host.kind() !== 'mesh') return { u0: 0, v0: 0, u1: 1, v1: 1 };
    return visibleImage(this.imageFit(source));
  }

  /**
   * One pin per color. Stops and nodes have no place in the frame, so their pins are remembered where the
   * color was picked and move to the best match once the image there stops matching.
   */
  get items(): { u: number; v: number; color: Oklch }[] {
    const source = this.source;
    if (!source) return [];
    if (this.host.kind() === 'mesh') {
      return this.host.meshPoints().map((p) => {
        const [u, v] = frameToImage(...this.host.toScreen(p.x, p.y), this.imageFit(source));
        return { u, v, color: p.color };
      });
    }
    const remembered = this.spots[this.spotKey];
    const placed: ImageSpot[] = [];
    return this.host.colorItems().map((item, i) => {
      const lab = oklchToOklab(item.color);
      const spot = remembered[i];
      const there = spot && sampleColor(source.data, source.width, source.height, spot.u, spot.v);
      const found = there && oklabDistance(there, lab) < SPOT_MATCH ? spot : this.findSpot(source, lab, placed);
      placed.push(found);
      return { ...found, color: item.color };
    });
  }

  private findSpot(source: ImageSource, color: Oklab, taken: ImageSpot[]): ImageSpot {
    let grid = this.samples.get(source);
    if (!grid) this.samples.set(source, (grid = sampleGrid(source.data, source.width, source.height)));
    const best = nearestSample(grid, color, taken);
    return best ? { u: best.u, v: best.v } : { u: 0.5, v: 0.5 };
  }

  private imageFit(source: { aspect: number }) {
    return { imageAspect: source.aspect, frameAspect: this.host.aspect() };
  }

  /** The image's color around (u, v), or null with no image or over a transparent area. */
  private colorAt(u: number, v: number): Oklch | null {
    const source = this.source;
    const lab = source && sampleColor(source.data, source.width, source.height, u, v);
    return lab ? oklabToOklch(lab) : null;
  }

  /** Remember where every pin of the stops or nodes sits now, with pin `i` moved to `spot` (or dropped when null). */
  private rememberSpots(i: number, spot: ImageSpot | null): void {
    const list: ImageSpot[] = this.items.map(({ u, v }) => ({ u, v }));
    if (spot) list[i] = spot;
    else list.splice(i, 1);
    this.setSpots(this.spotKey, list);
  }

  /** Give item `i` the color found at image position (u, v). On the mesh the point moves there too. */
  move(i: number, u: number, v: number): void {
    const source = this.source;
    const item = this.host.colorItems()[i];
    if (!source || !item) return;
    if (this.host.kind() === 'mesh') {
      this.host.movePoint(i, ...imageToFrame(u, v, this.imageFit(source)));
    } else {
      // Positions of the other pins as they are now, before this color changes.
      this.rememberSpots(i, { u, v });
    }
    const color = this.colorAt(u, v);
    if (color) item.color = color;
    this.host.adoptCustomPalette();
  }

  /** A click on the bare image at (u, v): adds a color there, or replaces the selected one when the pattern can't grow. Returns the pin index, or null with no image. */
  add(u: number, v: number): number | null {
    if (!this.source) return null;
    if (!this.host.canAddColor()) {
      const i = this.host.selectedIndex();
      if (i < 0) return null;
      this.move(i, u, v);
      return i;
    }
    this.host.addColor();
    // The new point or stop is the last one, and addColor selected it.
    const i = this.host.colorItems().length - 1;
    this.move(i, u, v);
    return i;
  }

  remove(i: number): void {
    if (!this.host.canRemoveColor() || i < 0 || i >= this.host.colorItems().length) return;
    if (this.host.kind() !== 'mesh') this.rememberSpots(i, null);
    this.host.removeColor(i);
  }
}
