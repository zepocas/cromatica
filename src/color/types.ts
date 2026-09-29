import type { ColorStop, Oklch } from '../design/design';

/** Oklab color: L in [0, 1], a and b roughly in [-0.4, 0.4]. */
export type Oklab = [l: number, a: number, b: number];
/** RGB triple; whether it is linear or sRGB-encoded is stated at each use. */
export type Rgb = [r: number, g: number, b: number];

/** Number of entries in the baked ramp lookup texture. */
export const RAMP_SIZE = 4096;

/**
 * Implemented in src/color/oklab.ts (pure math, no dependencies; culori is
 * the test oracle only):
 *   oklchToOklab(c: Oklch): Oklab
 *   oklabToOklch(c: Oklab): Oklch            // h in [0, 360); h = 0 when C ≈ 0
 *   oklabToLinearSrgb(c: Oklab): Rgb         // unclamped
 *   linearSrgbToOklab(c: Rgb): Oklab
 *   srgbEncode(x: number): number            // linear → sRGB transfer, per channel
 *   srgbDecode(x: number): number            // sRGB → linear
 *   inSrgbGamut(c: Oklch, eps?: number): boolean
 *   gamutMapSrgb(c: Oklch): Oklch            // CSS Color 4 algorithm (chroma
 *                                            // reduction at constant L/h, ΔE_OK JND 0.02)
 *   gamutMapToLinearSrgb(c: Oklch): Rgb      // same mapping, returns linear sRGB in [0, 1]
 *   oklchToHex(c: Oklch): string             // gamut-mapped, '#rrggbb'
 *   hexToOklch(hex: string): Oklch
 *
 * Implemented in src/color/ramp.ts:
 *   evaluateRamp(stops: ColorStop[], t: number): Oklab
 *     Stops sorted by position. t clamped to [0, 1]; before the first / after
 *     the last stop the end color is held. Segments use their blend mode and a
 *     monotone cubic (Fritsch–Carlson) so the color path has no slope kinks at
 *     stops (avoids Mach bands). Stops at equal positions make a hard edge;
 *     the color after the edge wins (CSS-style).
 *   bakeRamp(stops: ColorStop[], size?: number): Float32Array
 *     size (default RAMP_SIZE) RGBA entries, LINEAR sRGB, gamut-mapped, alpha 1.
 *     Entry i corresponds to t = i / (size - 1).
 */
export type RampStops = ColorStop[];
export type { Oklch };
