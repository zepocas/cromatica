// The layout is made on the CPU and passed to shaders/gradient/blobs.glsl as uniforms;
// evaluateBlobs is the same per-pixel math in doubles. The pattern is stippled, so the lighting
// reads a separate smooth height (evaluateBlobsHeight) instead of the dots.
import { gamutMapToLinearSrgb } from '../color/gamut';
import { srgbDecode } from '../color/oklab';
import type { Oklch, Rgb } from '../color/types';
import { BLOB_SCALE, type BlobEdits, type BlobsPattern, MAX_BLOBS, MAX_STOPS } from '../design/design';
import { createRng } from '../design/random';
import { clamp01 } from '../math';
import { BLUE_NOISE_SIZE, blueNoiseRanks } from './blue-noise';
import { planeOrder } from './planes';

export { MAX_BLOBS };
const BLOB_COUNT: [few: number, many: number] = [1, MAX_BLOBS];
/** Half extents of the field the blobs are spread over. Fixed (D4): a wider frame shows more of it. */
const FIELD: [x: number, y: number] = [0.95, 0.52];
/** Mean radius at size 0 and 1, composition units; each blob draws 0.6 to 1.3 times it. */
const RADIUS: [small: number, large: number] = [0.08, 0.42];
const RADIUS_JITTER: [min: number, max: number] = [0.6, 1.3];
/** Elongation of a blob along its own axis: 1 = round. */
const STRETCH: [min: number, max: number] = [1, 2.6];
/** Outline lumps: the radius is 1 + Σ a_k cos(kφ + phase_k), k = 2 to 4; a_k is its weight times wobble times 0.5 to 1. */
const LUMP_WEIGHT = [0.35, 0.25, 0.15] as const;
/**
 * Stipple dot cell at the finest grain (just above 0) and at 1, composition units (image height = 1). Grain 0 is no
 * stipple at all. The size follows the slider squared, so the dots start under a pixel and grow slowly at first.
 */
const DOT: [fine: number, coarse: number] = [0.0007, 0.0055];
const DOT_CURVE = 2;
/** Dot radius in cells: base plus a random share. Dots sit at jittered spots, so they overlap a little. */
const DOT_RADIUS: [base: number, spread: number] = [0.48, 0.22];
const DOT_JITTER: [margin: number, range: number] = [0.15, 0.7];
/**
 * Ink density across a blob, from its depth as a share of the radius: none within RIM of the edge (the
 * black rim), then rising to full at FADE. The light side of a blob is shifted deeper by LIGHT_SHIFT
 * per radius along LIGHT_DIR, so it fills with ink sooner and the far side stays dark.
 */
const RIM = 0.1;
const FADE = 1;
const LIGHT_SHIFT = 0.3;
const LIGHT_DIR: [number, number] = [-0.6, 0.8];
/** Depth over which the height rises from the edge to the top of the dome, as a share of the radius. */
const DOME = 0.8;
const DENSITY_POWER = 1.1;
/** Rounds the peak at a blob's centre: the depth falls off with sqrt(length² + e²), e this share of the radius, so the lighting doesn't catch a crease there. 0 = a sharp cone. */
const PEAK = 0.15;
/**
 * Palette base: the body is the ink's own color, shaded with dots of a deeper shade of it (its hue, its lightness times
 * SHADE_LIGHTNESS, nearly all its chroma), thickest at the edge and on the dark side. They only start where the
 * density is below SHADE_CLEAR, so the middle of a blob stays clean ink.
 */
const SHADE_LIGHTNESS = 0.35;
const SHADE_CHROMA = 0.9;
const SHADE_CLEAR = 0.9;
/** With no stipple the ink is a smooth tone: its ramp reaches full ink at this share of the density ramp, so it is nearly solid and the ridge down a blob's middle doesn't show. */
const SMOOTH_SOLID = 0.55;
/** Edge antialiasing half width, output pixels. */
const AA_PIXELS = 0.75;
const BASE_SRGB: Rgb = [0.07, 0.065, 0.065];
const PAPER_SRGB: Rgb = [0.96, 0.95, 0.91];
/** Blue-noise taps for a dot's jitter and radius: offsets into the tile from the dot's cell. */
const TAP_X: [number, number] = [37, 11];
const TAP_Y: [number, number] = [5, 53];
const TAP_R: [number, number] = [23, 29];

const BASE: Rgb = [srgbDecode(BASE_SRGB[0]), srgbDecode(BASE_SRGB[1]), srgbDecode(BASE_SRGB[2])];
const PAPER: Rgb = [srgbDecode(PAPER_SRGB[0]), srgbDecode(PAPER_SRGB[1]), srgbDecode(PAPER_SRGB[2])];

export const BLOBS_SHADER_CONSTANTS = {
  MAX_BLOBS,
  MAX_INKS: MAX_STOPS,
  BLOB_RIM: glslFloat(RIM),
  BLOB_FADE: glslFloat(FADE),
  BLOB_LIGHT_SHIFT: glslFloat(LIGHT_SHIFT),
  BLOB_LIGHT_DIR: `vec2(${LIGHT_DIR.join(', ')})`,
  BLOB_DOME: glslFloat(DOME),
  BLOB_DENSITY_POWER: glslFloat(DENSITY_POWER),
  BLOB_PEAK: glslFloat(PEAK),
  BLOB_SMOOTH_SOLID: glslFloat(SMOOTH_SOLID),
  BLOB_SHADE_CLEAR: glslFloat(SHADE_CLEAR),
  DOT_RADIUS_BASE: glslFloat(DOT_RADIUS[0]),
  DOT_RADIUS_SPREAD: glslFloat(DOT_RADIUS[1]),
  DOT_JITTER_MARGIN: glslFloat(DOT_JITTER[0]),
  DOT_JITTER_RANGE: glslFloat(DOT_JITTER[1]),
  TAP_X: `ivec2(${TAP_X.join(', ')})`,
  TAP_Y: `ivec2(${TAP_Y.join(', ')})`,
  TAP_R: `ivec2(${TAP_R.join(', ')})`,
};

function glslFloat(x: number): string {
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

/** Colors are linear sRGB; lengths are composition units. */
export interface PreparedBlobs {
  count: number;
  background: Rgb;
  base: Rgb;
  inkCount: number;
  inks: Float64Array;
  /** Per ink: the color of its dots, then how they are used: 0 = the ink over the black base, 1 = a deeper shade of the ink shading it. */
  inkDots: Float64Array;
  /** Per blob, back to front: centre x, y, radius, turn (radians). */
  shape0: Float64Array;
  /** Per blob: elongation, then the weights of the 2-, 3- and 4-lobed lumps. */
  shape1: Float64Array;
  /** Per blob: the phases of those lumps, then the ink index. */
  shape2: Float64Array;
  /** Layout index of each blob in drawing order (back to front). */
  ids: number[];
  /** Stipple dot cell; 0 = no stipple, the ink is a smooth tone. */
  dot: number;
  /** Edge half width: antialiasing. */
  soft: number;
}

export function blobCount(count: number): number {
  const c = clamp01(Number.isFinite(count) ? count : 0.5);
  return Math.round(BLOB_COUNT[0] + (BLOB_COUNT[1] - BLOB_COUNT[0]) * c);
}

const lerp = (range: readonly [number, number], t: number) =>
  range[0] + (range[1] - range[0]) * clamp01(Number.isFinite(t) ? t : 0.5);

/**
 * Trial (#60): the background is the palette's first color, whatever its lightness, so it can be judged on dark
 * ones. Set to true to go back to the lightest color, the paper the blobs were designed on (D83).
 */
export const BACKGROUND_IS_LIGHTEST = false;

/** The palette color the blobs sit on. */
export function backgroundIndex(colors: readonly Oklch[]): number {
  if (!BACKGROUND_IS_LIGHTEST) return 0;
  return colors.reduce((best, c, i) => (c[0] > colors[best][0] ? i : best), 0);
}

export function prepareBlobs(blobs: BlobsPattern, output: { height: number }): PreparedBlobs {
  const k = blobs.colors.length;
  if (k < 1 || k > MAX_STOPS) throw new RangeError(`Blobs need 1 to ${MAX_STOPS} colors, got ${k}.`);
  const rng = createRng(blobs.seed >>> 0);
  const n = blobCount(blobs.count);
  const radius = lerp(RADIUS, blobs.size);
  const wobble = clamp01(Number.isFinite(blobs.wobble) ? blobs.wobble : 0.5);
  // One color alone is an ink on paper. The inks keep the palette's order, so swapping the colors around deals them
  // to other blobs.
  const back = backgroundIndex(blobs.colors);
  const inkColors = k > 1 ? blobs.colors.map((_, i) => i).filter((i) => i !== back) : [0];
  const background = k > 1 ? gamutMapToLinearSrgb(blobs.colors[back]) : PAPER;
  const inks = new Float64Array(inkColors.length * 3);
  inkColors.forEach((c, i) => inks.set(gamutMapToLinearSrgb(blobs.colors[c]), i * 3));
  const inkDots = new Float64Array(inkColors.length * 4);
  inkColors.forEach((c, i) => {
    if (blobs.base !== 'palette') inkDots.set([...inks.subarray(i * 3, i * 3 + 3), 0], i * 4);
    else {
      const [l, chroma, hue] = blobs.colors[c];
      inkDots.set([...gamutMapToLinearSrgb([l * SHADE_LIGHTNESS, chroma * SHADE_CHROMA, hue]), 1], i * 4);
    }
  });
  const shape0 = new Float64Array(n * 4);
  const shape1 = new Float64Array(n * 4);
  const shape2 = new Float64Array(n * 4);
  const start = rng.int(inkColors.length);
  for (let i = 0; i < n; i++) {
    shape0.set(
      [
        rng.range(-FIELD[0], FIELD[0]),
        rng.range(-FIELD[1], FIELD[1]),
        radius * rng.range(...RADIUS_JITTER),
        rng.range(0, Math.PI),
      ],
      i * 4,
    );
    // Drawn whatever the wobble, so the layout doesn't change as the slider moves.
    const lumps = LUMP_WEIGHT.map((w) => w * wobble * rng.range(0.5, 1));
    shape1.set([rng.range(...STRETCH), ...lumps], i * 4);
    shape2.set(
      [rng.range(0, 2 * Math.PI), rng.range(0, 2 * Math.PI), rng.range(0, 2 * Math.PI), (start + i) % inkColors.length],
      i * 4,
    );
  }
  const prepared: PreparedBlobs = {
    count: n,
    background,
    base: BASE,
    inkCount: inkColors.length,
    inks,
    inkDots,
    shape0,
    shape1,
    shape2,
    ids: Array.from({ length: n }, (_, i) => i),
    dot: blobs.grain > 0 ? lerp(DOT, clamp01(blobs.grain) ** DOT_CURVE) : 0,
    soft: AA_PIXELS / output.height,
  };
  applyEdits(prepared, blobs.edits);
  return prepared;
}

/** Reorders and moves the blobs as `edits` say. Without edits the arrays are left as they are. */
function applyEdits(p: PreparedBlobs, edits: BlobEdits | undefined): void {
  const order = planeOrder(edits, p.count);
  const shift = (id: number, k: 0 | 1) => {
    const s = edits?.shifts[id]?.[k];
    return Number.isFinite(s) ? (s as number) : 0;
  };
  const scale = (id: number) => {
    const s = edits?.scales?.[id];
    return Number.isFinite(s) ? Math.min(BLOB_SCALE[1], Math.max(BLOB_SCALE[0], s as number)) : 1;
  };
  const moved =
    order.some((id, i) => id !== i) || order.some((id) => shift(id, 0) !== 0 || shift(id, 1) !== 0 || scale(id) !== 1);
  if (!moved) return;
  const shape0 = new Float64Array(p.count * 4);
  const shape1 = new Float64Array(p.count * 4);
  const shape2 = new Float64Array(p.count * 4);
  order.forEach((id, slot) => {
    shape0.set(p.shape0.subarray(id * 4, id * 4 + 4), slot * 4);
    shape0[slot * 4] += shift(id, 0);
    shape0[slot * 4 + 1] += shift(id, 1);
    shape0[slot * 4 + 2] *= scale(id);
    shape1.set(p.shape1.subarray(id * 4, id * 4 + 4), slot * 4);
    shape2.set(p.shape2.subarray(id * 4, id * 4 + 4), slot * 4);
  });
  p.shape0 = shape0;
  p.shape1 = shape1;
  p.shape2 = shape2;
  p.ids = order;
}

/** [distance from blob i's centre, how far its outline is in that direction], in its own stretched, turned frame. */
function blobPolar(p: PreparedBlobs, i: number, x: number, y: number): [number, number] {
  const [cx, cy, radius, turn] = p.shape0.subarray(i * 4, i * 4 + 4);
  const [stretch, a2, a3, a4] = p.shape1.subarray(i * 4, i * 4 + 4);
  const [p2, p3, p4] = p.shape2.subarray(i * 4, i * 4 + 3);
  const dx = x - cx;
  const dy = y - cy;
  const cs = Math.cos(turn);
  const sn = Math.sin(turn);
  const s = Math.sqrt(stretch);
  const qx = (cs * dx + sn * dy) / s;
  const qy = (-sn * dx + cs * dy) * s;
  const phi = Math.atan2(qy, qx);
  const r = radius * (1 + a2 * Math.cos(2 * phi + p2) + a3 * Math.cos(3 * phi + p3) + a4 * Math.cos(4 * phi + p4));
  return [Math.hypot(qx, qy), r];
}

/** Distance-like value to blob i's outline (negative inside). */
export function blobDistance(p: PreparedBlobs, i: number, x: number, y: number): number {
  const [length, r] = blobPolar(p, i, x, y);
  return length - r;
}

/**
 * How deep (x, y) is inside blob i: the radius times the share of the way from the outline to the centre, so the
 * contours of constant depth are scaled copies of the outline and the ink follows the blob's own form (a little rounded at the centre, see PEAK).
 */
function blobDepth(p: PreparedBlobs, i: number, x: number, y: number): number {
  const [length, r] = blobPolar(p, i, x, y);
  const radius = p.shape0[i * 4 + 2];
  const e = PEAK * radius;
  return radius * (1 - (Math.hypot(length, e) - e) / (Math.hypot(r, e) - e));
}

/** Blue noise in (0, 1) for a dot cell shifted by (ox, oy), the same ranks the dither reads. */
function noiseAt(cx: number, cy: number, [ox, oy]: readonly [number, number] = [0, 0]): number {
  const m = BLUE_NOISE_SIZE - 1;
  return (
    (blueNoiseRanks()[((cy + oy) & m) * BLUE_NOISE_SIZE + ((cx + ox) & m)] + 0.5) / (BLUE_NOISE_SIZE * BLUE_NOISE_SIZE)
  );
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/**
 * Share of ink at composition coords: round dots, one per cell where the density beats the cell's
 * blue noise, at a jittered spot with its own radius, so nothing lines up on a grid.
 */
function stipple(p: PreparedBlobs, cx: number, cy: number, density: number): number {
  // No dot ever beats the noise at density 0 (the black rim).
  if (density <= 0) return 0;
  const gx = cx / p.dot;
  const gy = cy / p.dot;
  const aa = Math.min(p.soft / p.dot, 0.5);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  let cover = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (density <= noiseAt(x, y)) continue;
      const px = x + DOT_JITTER[0] + DOT_JITTER[1] * noiseAt(x, y, TAP_X);
      const py = y + DOT_JITTER[0] + DOT_JITTER[1] * noiseAt(x, y, TAP_Y);
      const r = DOT_RADIUS[0] + DOT_RADIUS[1] * noiseAt(x, y, TAP_R);
      cover = Math.max(cover, 1 - smoothstep(r - aa, r + aa, Math.hypot(gx - px, gy - py)));
    }
  }
  return cover;
}

/** Points around blob `slot`'s outline (pattern coords), for drawing and picking it on the preview. */
export const OUTLINE_POINTS = 72;
export function blobOutline(p: PreparedBlobs, slot: number): [number, number][] {
  const [cx, cy, radius, turn] = p.shape0.subarray(slot * 4, slot * 4 + 4);
  const [stretch, a2, a3, a4] = p.shape1.subarray(slot * 4, slot * 4 + 4);
  const [p2, p3, p4] = p.shape2.subarray(slot * 4, slot * 4 + 3);
  const cs = Math.cos(turn);
  const sn = Math.sin(turn);
  const s = Math.sqrt(stretch);
  return Array.from({ length: OUTLINE_POINTS }, (_, k) => {
    const phi = (k / OUTLINE_POINTS) * 2 * Math.PI;
    const r = radius * (1 + a2 * Math.cos(2 * phi + p2) + a3 * Math.cos(3 * phi + p3) + a4 * Math.cos(4 * phi + p4));
    // The inverse of the stretched, turned frame blobDist works in.
    const ux = r * Math.cos(phi) * s;
    const uy = (r * Math.sin(phi)) / s;
    return [cx + cs * ux - sn * uy, cy + sn * ux + cs * uy];
  });
}

/**
 * How far blob i can reach from its centre, edge softness included: the outline never passes the radius
 * with every lump aligned, and the stretch moves a point at most sqrt(stretch) times as far as it moves
 * in the blob's own frame.
 */
export function blobReach(p: PreparedBlobs, i: number): number {
  const [, , radius] = p.shape0.subarray(i * 4, i * 4 + 4);
  const [stretch, a2, a3, a4] = p.shape1.subarray(i * 4, i * 4 + 4);
  return (radius * (1 + a2 + a3 + a4) + p.soft) * Math.sqrt(stretch);
}

function reaches(p: PreparedBlobs, i: number, x: number, y: number): boolean {
  return Math.hypot(x - p.shape0[i * 4], y - p.shape0[i * 4 + 1]) <= blobReach(p, i);
}

/** Share of full ink at (x, y) inside blob i. */
function inkDensity(p: PreparedBlobs, i: number, x: number, y: number): number {
  const radius = p.shape0[i * 4 + 2];
  const lit = ((x - p.shape0[i * 4]) * LIGHT_DIR[0] + (y - p.shape0[i * 4 + 1]) * LIGHT_DIR[1]) / radius;
  const depth = Math.max(blobDepth(p, i, x, y), 0) / radius + LIGHT_SHIFT * lit;
  return clamp01((depth - RIM) / (FADE - RIM)) ** DENSITY_POWER;
}

/** (x, y): pattern coords, the shapes; (cx, cy): composition coords, which the stipple follows so a warp bends the shapes, not the dots. */
export function evaluateBlobs(p: PreparedBlobs, x: number, y: number, cx = x, cy = y): Rgb {
  const rgb: Rgb = [0, 0, 0];
  let remaining = 1;
  // Front to back: each blob takes its share of what the ones above left uncovered.
  for (let i = p.count - 1; i >= 0 && remaining > 0.001; i--) {
    if (!reaches(p, i, x, y)) continue;
    const d = blobDistance(p, i, x, y);
    const cover = 1 - smoothstep(-p.soft, p.soft, d);
    if (cover <= 0) continue;
    const density = inkDensity(p, i, x, y);
    const ink = p.shape2[i * 4 + 3];
    const [dr, dg, db, mode] = p.inkDots.subarray(ink * 4, ink * 4 + 4);
    // The share of the dots' color over the body: the ink's own density on the black base, its mirror for the deeper
    // shade of a colored body (none in the middle of the blob).
    const tone = smoothstep(0, SMOOTH_SOLID, density);
    const dotDensity = mode === 0 ? density : Math.max(0, 1 - density / SHADE_CLEAR);
    const smoothShare = mode === 0 ? tone : 1 - tone;
    const share = p.dot > 0 ? stipple(p, cx, cy, dotDensity) : smoothShare;
    const dot = [dr, dg, db];
    for (let c = 0; c < 3; c++) {
      const body = mode === 0 ? p.base[c] : p.inks[ink * 3 + c];
      rgb[c] += remaining * cover * (body + (dot[c] - body) * share);
    }
    remaining *= 1 - cover;
  }
  return rgb.map((v, c) => v + remaining * p.background[c]) as Rgb;
}

/** Smooth dome height, [0, 1], as a gray whose Oklab lightness is the height: what the lighting reads. */
export function evaluateBlobsHeight(p: PreparedBlobs, x: number, y: number): Rgb {
  let height = 0;
  let remaining = 1;
  for (let i = p.count - 1; i >= 0 && remaining > 0.001; i--) {
    if (!reaches(p, i, x, y)) continue;
    const d = blobDistance(p, i, x, y);
    const cover = 1 - smoothstep(-p.soft, p.soft, d);
    if (cover <= 0) continue;
    const inside = clamp01(blobDepth(p, i, x, y) / (DOME * p.shape0[i * 4 + 2]));
    height += remaining * cover * (1 - (1 - inside) ** 2);
    remaining *= 1 - cover;
  }
  const gray = height * height * height;
  return [gray, gray, gray];
}

/** How deep (x, y) is inside the blobs, the visible ones weighted by how much of it they cover: the room the glass has to refract before an outline. */
export function evaluateBlobsRoom(p: PreparedBlobs, x: number, y: number): number {
  let room = 0;
  let remaining = 1;
  for (let i = p.count - 1; i >= 0 && remaining > 0.001; i--) {
    if (!reaches(p, i, x, y)) continue;
    const cover = 1 - smoothstep(-p.soft, p.soft, blobDistance(p, i, x, y));
    if (cover <= 0) continue;
    room += remaining * cover * Math.max(blobDepth(p, i, x, y), 0);
    remaining *= 1 - cover;
  }
  return room;
}
