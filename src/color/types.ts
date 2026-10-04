/**
 * Oklch color. L in [0, 1], C >= 0 (roughly [0, 0.4]), h in degrees [0, 360).
 * Stored as floats, never hex (D5). May lie outside sRGB; gamut mapping
 * happens when a color is rendered.
 */
export type Oklch = [l: number, c: number, h: number];
/** Oklab color: L in [0, 1], a and b roughly in [-0.4, 0.4]. */
export type Oklab = [l: number, a: number, b: number];
/** RGB triple; whether it is linear or sRGB-encoded is stated at each use. */
export type Rgb = [r: number, g: number, b: number];
