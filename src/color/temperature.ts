// Temperature (M4 step 8), the painter's rule that the light's temperature
// sets the shadows' opposite: warm light gives cool shadows (sunset,
// lamplight), cool light gives warm shadows (overcast, north light). Lighter
// colors turn toward the light's hue, darker ones toward the shadow's.
// Applied to a finished palette, so it works the same on generated,
// hand-edited and imported palettes.
import type { Oklch } from '../design/design';
import { maxChroma } from './harmony';
import { normalizeHue } from './oklab';

export type Temperature = 'off' | 'warm' | 'cool';

/** Warm (amber) and cool (blue-violet) target hues. */
export const WARM_HUE = 75;
export const COOL_HUE = 275;
/** Turn at the palette's lightest and darkest colors, in degrees; mid-tones keep their hue. */
export const MAX_HUE_SHIFT = 30;
/** Below this chroma a color has no hue to speak of and is left alone. */
const NEUTRAL_C = 0.01;

/** Signed shortest rotation from a to b, in [-180, 180). */
const hueDelta = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

/**
 * Hue change per color. Each color turns by its place in the palette's own
 * lightness range (t from -1 at the darkest to +1 at the lightest), so low-
 * and high-key palettes get lit highlights and shadows too. No color turns
 * past its target.
 */
export function temperatureDeltas(colors: readonly Oklch[], temperature: Temperature): number[] {
  const ls = colors.map((c) => c[0]);
  const lo = Math.min(...ls);
  const hi = Math.max(...ls);
  if (temperature === 'off' || !(hi - lo > 1e-6)) return colors.map(() => 0);
  const [light, shadow] = temperature === 'warm' ? [WARM_HUE, COOL_HUE] : [COOL_HUE, WARM_HUE];
  return colors.map(([l, c, h]) => {
    if (c < NEUTRAL_C) return 0;
    const t = (2 * (l - lo)) / (hi - lo) - 1;
    const d = hueDelta(h, t > 0 ? light : shadow);
    return Math.sign(d) * Math.min(Math.abs(d), MAX_HUE_SHIFT * Math.abs(t));
  });
}

/** The palette under warm or cool light; lightness kept, chroma capped to stay in sRGB. */
export function applyTemperature(colors: readonly Oklch[], temperature: Temperature): Oklch[] {
  const deltas = temperatureDeltas(colors, temperature);
  return colors.map(([l, c, h], i) => {
    if (deltas[i] === 0) return [l, c, h];
    const nh = normalizeHue(h + deltas[i]);
    return [l, Math.min(c, maxChroma(l, nh)), nh];
  });
}
