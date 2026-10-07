export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
/** Below this the view snaps back to fit, so pinching out never leaves it a hair off-centre. */
const SNAP = 1.01;

/**
 * Zoom and pan of the preview, in screen terms only: it moves the frame on the
 * page and never reaches the design or the export. Offsets are in CSS pixels from
 * the centred, fitted frame, so `p -> offset + zoom * p` for a point `p` measured
 * from the frame's centre.
 */
export class CanvasView {
  zoom = $state(1);
  x = $state(0);
  y = $state(0);

  get zoomed(): boolean {
    return this.zoom > 1;
  }

  reset(): void {
    this.zoom = 1;
    this.x = 0;
    this.y = 0;
  }

  /**
   * Scale by `factor`, keeping the point under (cx, cy) still. Coordinates are
   * from the frame's centre; w and h are the fitted frame's size.
   */
  zoomAt(factor: number, cx: number, cy: number, w: number, h: number): void {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    if (next < SNAP) return this.reset();
    const k = next / this.zoom;
    this.zoom = next;
    this.x = cx - (cx - this.x) * k;
    this.y = cy - (cy - this.y) * k;
    this.clamp(w, h);
  }

  panBy(dx: number, dy: number, w: number, h: number): void {
    if (!this.zoomed) return;
    this.x += dx;
    this.y += dy;
    this.clamp(w, h);
  }

  /** Keeps the frame covering its own fitted rect, so it can't be flung off screen. */
  private clamp(w: number, h: number): void {
    const mx = ((this.zoom - 1) * w) / 2;
    const my = ((this.zoom - 1) * h) / 2;
    this.x = Math.min(mx, Math.max(-mx, this.x));
    this.y = Math.min(my, Math.max(-my, this.y));
  }
}
