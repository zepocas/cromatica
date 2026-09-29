// M0 design model: a single linear gradient. Replaced by the full versioned
// schema (Oklch stops, pipeline stages) in M1/M6.

/** sRGB-encoded color, each channel in [0, 1]. M1 switches stops to Oklch. */
export type Rgb = [r: number, g: number, b: number];

export interface ColorStop {
  /** Position along the gradient, in [0, 1]. */
  position: number;
  color: Rgb;
}

export interface LinearGradient {
  kind: 'linear';
  /** Direction in degrees. 0 = left→right, 90 = bottom→top (counter-clockwise). */
  angle: number;
  /** Sorted by position, at least 2 stops. At most MAX_STOPS. */
  stops: ColorStop[];
}

export interface Design {
  engineVersion: 0;
  base: LinearGradient;
}

export const MAX_STOPS = 8;

export const defaultDesign: Design = {
  engineVersion: 0,
  base: {
    kind: 'linear',
    angle: 30,
    stops: [
      { position: 0, color: [0.09, 0.05, 0.3] },
      { position: 0.5, color: [0.85, 0.2, 0.55] },
      { position: 1, color: [1.0, 0.75, 0.35] },
    ],
  },
};
