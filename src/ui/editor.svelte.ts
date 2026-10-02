import { oklabToOklch } from '../color/oklab';
import { evaluateMesh } from '../color/mesh';
import {
  defaultDesign,
  defaultMesh,
  MAX_MESH_POINTS,
  type BasePattern,
  type Design,
  type LinearGradient,
  type PointMesh,
} from '../design/design';

export type PatternKind = BasePattern['kind'];

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
 */
export class EditorState {
  kind = $state<PatternKind>('mesh');
  linear = $state<LinearGradient>(structuredClone(defaultDesign.base as LinearGradient));
  mesh = $state<PointMesh>(structuredClone(defaultMesh));
  selectedPoint = $state(0);
  showHandles = $state(true);
  /** "Add point" armed: the next click on the canvas adds a point there. */
  adding = $state(false);
  /** Frame aspect (width / height), for clamping drags to the frame. */
  aspect = $state(16 / 9);

  /** Plain (non-proxy) design with stops sorted, as the renderer and worker expect. */
  get design(): Design {
    const base = $state.snapshot(this.kind === 'mesh' ? this.mesh : this.linear) as BasePattern;
    if (base.kind === 'linear') base.stops.sort((a, b) => a.position - b.position);
    return { engineVersion: 1, base };
  }

  get point() {
    return this.mesh.points[Math.min(this.selectedPoint, this.mesh.points.length - 1)];
  }

  get canAddPoint(): boolean {
    return this.mesh.points.length < MAX_MESH_POINTS;
  }

  get canRemovePoint(): boolean {
    return this.mesh.points.length > 1;
  }

  /** Keep points within reach: inside the frame plus a margin. */
  clampPosition(x: number, y: number): [number, number] {
    const hx = this.aspect / 2 + OUTSIDE_MARGIN;
    const hy = 0.5 + OUTSIDE_MARGIN;
    return [clamp(x, -hx, hx), clamp(y, -hy, hy)];
  }

  /** Add a point at (x, y) colored like the mesh there, with the median radius. */
  addPoint(x: number, y: number): number | null {
    this.adding = false;
    if (!this.canAddPoint) return null;
    const plain = $state.snapshot(this.mesh) as PointMesh;
    const radii = plain.points.map((p) => p.radius).sort((a, b) => a - b);
    const mid = radii.length >> 1;
    const radius = radii.length % 2 ? radii[mid] : (radii[mid - 1] + radii[mid]) / 2;
    const [cx, cy] = this.clampPosition(x, y);
    this.mesh.points.push({ x: cx, y: cy, color: oklabToOklch(evaluateMesh(plain, cx, cy)), radius });
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
    if (!p) return;
    [p.x, p.y] = this.clampPosition(x, y);
  }
}
