// Numeric helpers shared by the color, engine and UI code.

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** x in [0, 1]; non-finite input (NaN, ±Infinity) becomes 0. */
export function clamp01(x: number): number {
  return Number.isFinite(x) ? clamp(x, 0, 1) : 0;
}

/** Degrees → [0, 360); non-finite input becomes 0. */
export function normalizeDegrees(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const r = deg % 360;
  const n = r < 0 ? r + 360 : r;
  // A tiny negative r rounds up to exactly 360.
  return n >= 360 ? 0 : n;
}

/** Signed shortest turn from angle a to angle b, degrees in [-180, 180). */
export function shortestTurn(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}
