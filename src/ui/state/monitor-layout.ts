/**
 * Monitor arrangement for the multi-monitor preview: rectangles in physical
 * space (hundredths of an inch), like the arrangement view of macOS and
 * Windows. The monitors always form one block: every monitor touches another
 * along an edge, and none overlap.
 */
export interface Monitor {
  id: number;
  w: number;
  h: number;
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

/** A rectangle in the same space: the wallpaper, which a monitor is kept inside. */
export interface Bounds {
  left: number;
  top: number;
  w: number;
  h: number;
}

const overlaps = (a: Monitor, b: Monitor) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Positive length two spans share. */
const shared = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

/** Edge to edge with a stretch in common; a corner touch doesn't count. */
export function touching(a: Monitor, b: Monitor): boolean {
  const sideBySide = a.x + a.w === b.x || b.x + b.w === a.x;
  const stacked = a.y + a.h === b.y || b.y + b.h === a.y;
  return (
    (sideBySide && shared(a.y, a.y + a.h, b.y, b.y + b.h) > 0) ||
    (stacked && shared(a.x, a.x + a.w, b.x, b.x + b.w) > 0)
  );
}

export function isJoined(monitors: readonly Monitor[]): boolean {
  if (monitors.length < 2) return true;
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const a = monitors[queue.pop()!];
    monitors.forEach((b, i) => {
      if (!seen.has(i) && touching(a, b)) {
        seen.add(i);
        queue.push(i);
      }
    });
  }
  return seen.size === monitors.length;
}

function isValid(monitors: readonly Monitor[]): boolean {
  return monitors.every((a, i) => monitors.every((b, j) => i >= j || !overlaps(a, b))) && isJoined(monitors);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const within = (v: number, size: number, lo: number, hi: number) => v >= lo && v + size <= hi;

/** How far, as a share of its short side, a monitor must be pulled toward a slot beyond the bounds before it takes it. */
const BEYOND_PULL = 0.35;

/**
 * The slot nearest to (x, y) where monitor `id` sits against another monitor
 * and keeps the block joined. Along the shared edge it follows the pointer,
 * and lines up with the neighbour's start, middle or end, or with the edges of
 * `bounds`, within `snap`. A monitor stays inside `bounds`, except to make an
 * arrangement the image can't cover (stacking a pair), and then only when the
 * pointer is clearly there. The layout is unchanged when there is no slot.
 */
export function placeMonitor<T extends Monitor>(
  monitors: readonly T[],
  id: number,
  x: number,
  y: number,
  snap: number,
  bounds?: Bounds,
) {
  const me = monitors.find((m) => m.id === id);
  if (!me) return [...monitors];
  const others = monitors.filter((m) => m.id !== id);
  const [x0, x1] = bounds ? [bounds.left, bounds.left + bounds.w] : [-Infinity, Infinity];
  const [y0, y1] = bounds ? [bounds.top, bounds.top + bounds.h] : [-Infinity, Infinity];
  if (!others.length) {
    return monitors.map((m) => ({ ...m, x: clamp(x, x0, x1 - me.w), y: clamp(y, y0, y1 - me.h) }));
  }
  const beyond = (BEYOND_PULL * Math.min(me.w, me.h)) ** 2;

  /** Along the free axis: follow the target inside what touches, with alignment snaps. */
  const along = (
    target: number,
    size: number,
    o0: number,
    oSize: number,
    b0: number,
    b1: number,
    inBounds: boolean,
  ): number | null => {
    const lo = Math.max(o0 - size + 1, inBounds ? b0 : -Infinity);
    const hi = Math.min(o0 + oSize - 1, inBounds ? b1 - size : Infinity);
    if (lo > hi) return null;
    let best = clamp(target, lo, hi);
    let bestDelta = snap + 1;
    const flush = [b0, b1 - size].filter(Number.isFinite);
    for (const a of [o0, o0 + oSize - size, Math.round(o0 + (oSize - size) / 2), ...flush]) {
      const delta = Math.abs(a - best);
      if (a >= lo && a <= hi && delta <= snap && delta < bestDelta) {
        best = a;
        bestDelta = delta;
      }
    }
    return best;
  };

  let best: T | null = null;
  let bestCost = Infinity;
  const consider = (cx: number | null, cy: number | null) => {
    if (cx === null || cy === null) return;
    const candidate = { ...me, x: cx, y: cy };
    const next = monitors.map((m) => (m.id === id ? candidate : m));
    const inside = !bounds || (within(cx, me.w, x0, x1) && within(cy, me.h, y0, y1));
    // Beyond the bounds only where the block can't fit them at all, so the image has to grow to cover it.
    if (!inside && bounds) {
      const block = blockBounds(next);
      if (block.w <= bounds.w && block.h <= bounds.h) return;
    }
    const cost = (cx - x) ** 2 + (cy - y) ** 2 + (inside ? 0 : beyond);
    if (cost < bestCost && isValid(next)) {
      best = candidate;
      bestCost = cost;
    }
  };
  for (const o of others) {
    for (const inBounds of [true, false]) {
      for (const cx of [o.x + o.w, o.x - me.w]) consider(cx, along(y, me.h, o.y, o.h, y0, y1, inBounds));
      for (const cy of [o.y + o.h, o.y - me.h]) consider(along(x, me.w, o.x, o.w, x0, x1, inBounds), cy);
    }
  }
  const found: T | null = best;
  return monitors.map((m) => (m.id === id ? (found ?? m) : m));
}

/** A row from the left, tops aligned: always valid, the way out when nothing else is. */
function inRow<T extends Monitor>(monitors: readonly T[]): T[] {
  let x = 0;
  return monitors.map((m) => {
    const placed = { ...m, x, y: 0 };
    x += m.w;
    return placed;
  });
}

/** The monitors side by side, tops aligned. `sizes` come with whatever else a monitor carries. */
export function layoutRow<T extends Size>(monitors: readonly T[]): (T & Monitor)[] {
  return inRow(monitors.map((m, i) => ({ ...m, id: i + 1, x: 0, y: 0 })));
}

/** Another monitor against the right edge of the block, at the top. */
export function addMonitor<T extends Monitor>(monitors: readonly T[], added: Omit<T, 'id' | 'x' | 'y'>): T[] {
  const id = Math.max(0, ...monitors.map((m) => m.id)) + 1;
  if (!monitors.length) return layoutRow<T>([{ ...added, id, x: 0, y: 0 } as T]);
  const right = Math.max(...monitors.map((m) => m.x + m.w));
  const top = Math.min(...monitors.map((m) => m.y));
  return [...monitors, { ...added, id, x: right, y: top } as T];
}

export function removeMonitor<T extends Monitor>(monitors: readonly T[], id: number): T[] {
  const rest = monitors.filter((m) => m.id !== id);
  return isJoined(rest) ? rest : inRow(rest);
}

/** A new size (another screen, or a turn to portrait) keeping the top-left corner. */
export function resizeMonitor<T extends Monitor>(monitors: readonly T[], id: number, patch: Partial<T> & Size): T[] {
  const resized = monitors.map((m) => (m.id === id ? { ...m, ...patch } : m));
  if (isValid(resized)) return resized;
  const me = resized.find((m) => m.id === id)!;
  const moved = placeMonitor(resized, id, me.x, me.y, 0);
  return isValid(moved) ? moved : inRow(resized);
}

/** The smallest rectangle around all monitors. */
export function blockBounds(monitors: readonly Monitor[]): { left: number; top: number; w: number; h: number } {
  const left = Math.min(...monitors.map((m) => m.x));
  const top = Math.min(...monitors.map((m) => m.y));
  return {
    left,
    top,
    w: Math.max(...monitors.map((m) => m.x + m.w)) - left,
    h: Math.max(...monitors.map((m) => m.y + m.h)) - top,
  };
}
