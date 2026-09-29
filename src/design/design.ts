// M1 design model: a single linear gradient with perceptual (Oklch) stops.
// Replaced by the full versioned schema (pipeline stages) in M6.

/**
 * Oklch color. L in [0, 1], C >= 0 (roughly [0, 0.4]), h in degrees [0, 360).
 * Stored as floats, never hex (D5). May lie outside sRGB; gamut mapping
 * happens when the ramp is baked.
 */
export type Oklch = [l: number, c: number, h: number];

/**
 * How the segment from a stop to the NEXT stop is interpolated (D5).
 * - 'oklab': straight line in Oklab (default).
 * - 'oklab-chroma': chroma-preserving Oklab — lerp L and C, rotate hue along
 *   the shorter arc, with hue progress weighted by chroma so it equals plain
 *   'oklab' when an end is gray and stays continuous as chroma approaches 0.
 * - 'oklch-short' / 'oklch-long': hue path around the shorter / longer arc.
 */
export type BlendMode = 'oklab' | 'oklab-chroma' | 'oklch-short' | 'oklch-long';

export interface ColorStop {
  /** Position along the gradient, in [0, 1]. */
  position: number;
  color: Oklch;
  /** Blend mode of the segment to the next stop. Ignored on the last stop. */
  blend: BlendMode;
}

export interface LinearGradient {
  kind: 'linear';
  /** Direction in degrees. 0 = left→right, 90 = bottom→top (counter-clockwise). */
  angle: number;
  /** Sorted by position, at least 2 stops. At most MAX_STOPS. */
  stops: ColorStop[];
}

export interface Design {
  engineVersion: 1;
  base: LinearGradient;
}

export const MAX_STOPS = 8;

export const defaultDesign: Design = {
  engineVersion: 1,
  base: {
    kind: 'linear',
    angle: 30,
    stops: [
      { position: 0, color: [0.2264, 0.1093, 280.42], blend: 'oklab' },
      { position: 0.5, color: [0.6031, 0.2141, 352.9], blend: 'oklab' },
      { position: 1, color: [0.8452, 0.1383, 76.58], blend: 'oklab' },
    ],
  },
};
