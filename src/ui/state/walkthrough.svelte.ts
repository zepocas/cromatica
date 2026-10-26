/** What the walkthrough watches: the app events its steps wait for. */
export interface Signals {
  /** Shuffles recorded so far; a shuffle by any route raises it. */
  reel: number;
  exploring: boolean;
  collapsed: boolean;
  /** An OS screen is drawn over the image. */
  context: boolean;
  /** The pattern kind and the warp shape, which the pattern and warp steps wait on. */
  kind: string;
  warpShape: string;
  /** The warp, finishes and transform serialized: any slider of the adjust section changes it. */
  adjust: string;
  /** Every pattern's own settings (planes count and torn edges, aurora glow, mesh points…), serialized. */
  pattern: string;
  /** The colors in their order, serialized. */
  colors: string;
  /** Hand edits to planes and blobs, serialized. */
  arrange: string;
  shortcuts: boolean;
  /** Designs kept as favourites. */
  favourites: number;
}

export interface Step {
  title: string;
  text: string;
  /** What the user does with `keys`, shown before it; default "press". */
  verb?: string;
  /** Shown as the key to press; a step with none is done by what the user does to the app. */
  keys: string;
  /** How many times `done` must fire before the step is over; default 1. */
  need?: number;
  /** `key` is the lowercased key just pressed outside a text field, if any. */
  done: (prev: Signals, now: Signals, key: string | null) => boolean;
  /** The settings a change touched. With it, `need` counts different settings: a slider drag fires a change per tick, and one setting counts once. */
  settings?: (prev: Signals, now: Signals) => string[];
}

/** The leaf settings that differ between two serialized values, as paths under `name`; a plain string that is not JSON counts as one setting. */
export function changedSettings(name: string, before: string, after: string): string[] {
  if (before === after) return [];
  let a: unknown;
  let b: unknown;
  try {
    a = JSON.parse(before);
    b = JSON.parse(after);
  } catch {
    return [name];
  }
  const out: string[] = [];
  const walk = (x: unknown, y: unknown, path: string) => {
    if (x && y && typeof x === 'object' && typeof y === 'object') {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
        walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], `${path}.${k}`);
      }
    } else if (JSON.stringify(x) !== JSON.stringify(y)) out.push(path);
  };
  walk(a, b, name);
  return out;
}

export const STEPS: Step[] = [
  {
    title: 'shuffle',
    text: 'Shuffle to find a starting point: every press makes a new design from a curated set. Try a few; ← → step back and forward through the ones that went by.',
    keys: 'space',
    need: 3,
    done: (prev, now) => now.reel > prev.reel,
  },
  {
    title: 'more like this',
    text: 'Variations of the design on screen. Click one to take it.',
    keys: 'm',
    done: (prev, now) => prev.exploring && !now.exploring,
  },
  {
    title: 'see it on your screen',
    text: "The canvas starts at your screen's size (the size is in the panel, the format in the bar below). Preview it with your OS on top.",
    keys: 'o',
    done: (prev, now) => prev.context !== now.context,
  },
  {
    title: 'open the panel',
    text: 'Everything so far works with the panel folded. Open it for the rest.',
    keys: 'p',
    done: (prev, now) => prev.collapsed && !now.collapsed,
  },
  {
    title: 'look and colors',
    text: 'q shuffles the pattern and its adjustments and keeps your palette. w shuffles only the palette, built on a harmony rule (analogous, complementary, triadic…): hues in a fixed relation on the color wheel, which is why they sit well together.',
    keys: 'q w',
    need: 2,
    done: (_prev, _now, key) => key === 'q' || key === 'w',
  },
  {
    title: 'pattern',
    text: 'The pattern draws the picture. Step through the patterns and stop on one you like.',
    keys: 'l ;',
    done: (prev, now) => prev.kind !== now.kind,
  },
  {
    title: 'warp',
    text: 'The warp bends the pattern. Step through its shapes.',
    keys: ', .',
    done: (prev, now) => prev.warpShape !== now.warpShape,
  },
  {
    title: 'adjust',
    text: 'Adjust finishes the picture: warp amount, grain, lighting. Move any slider.',
    verb: 'move',
    keys: 'a slider',
    done: (prev, now) => prev.adjust !== now.adjust,
  },
  {
    title: 'arrange by hand',
    text: 'Planes and blobs can be moved piece by piece. Switch the pattern to planes or blobs (l ;), then drag one on the canvas.',
    verb: 'drag',
    keys: 'a blob or plane',
    done: (prev, now) => prev.arrange !== now.arrange,
  },
  {
    title: 'colors',
    text: 'Swap the same colors around, or change one yourself in the colors section.',
    keys: 'r',
    done: (prev, now) => prev.colors !== now.colors,
  },
  {
    title: 'keep what you like',
    text: 'Keep the design on screen as a favourite, so a later shuffle cannot lose it: k, or the ♡ at the bottom of the panel. Favourites are listed there and stay in this browser.',
    keys: 'k',
    done: (prev, now) => now.favourites > prev.favourites,
  },
  {
    title: 'make it yours',
    text: 'The panel is yours to explore: every section, slider and color is fair game. Change a few settings and see what happens.',
    verb: 'change',
    keys: 'settings in the panel',
    need: 3,
    settings: (prev, now) => [
      ...changedSettings('kind', prev.kind, now.kind),
      ...changedSettings('warpShape', prev.warpShape, now.warpShape),
      ...changedSettings('adjust', prev.adjust, now.adjust),
      ...changedSettings('pattern', prev.pattern, now.pattern),
      ...changedSettings('colors', prev.colors, now.colors),
      ...changedSettings('arrange', prev.arrange, now.arrange),
    ],
    done: (prev, now) =>
      prev.kind !== now.kind ||
      prev.warpShape !== now.warpShape ||
      prev.adjust !== now.adjust ||
      prev.pattern !== now.pattern ||
      prev.colors !== now.colors ||
      prev.arrange !== now.arrange,
  },
  {
    title: 'there is more',
    text: 'That is the core. The shortcut list has the rest, and its tricks page has more on color harmony, share links and reopening an export. The panel is full of settings worth exploring.',
    keys: '?',
    done: (prev, now) => !prev.shortcuts && now.shortcuts,
  },
];

/** A forced sequence: no next or skip, each step waits for the user to do what it names. */
export class Walkthrough {
  index = $state(0);
  /** How many times the current step's action has happened. */
  progress = $state(0);
  active = $state(false);
  #prev: Signals | null = null;
  #seen = new Set<string>();

  constructor(
    private readonly steps: Step[] = STEPS,
    private readonly onend: () => void = () => {},
  ) {}

  get step(): Step | null {
    return this.active ? (this.steps[this.index] ?? null) : null;
  }

  get total(): number {
    return this.steps.length;
  }

  start(): void {
    this.index = 0;
    this.progress = 0;
    this.active = true;
    this.#prev = null;
    this.#seen.clear();
  }

  /** Esc: it does not come back. */
  leave(): void {
    this.#finish();
  }

  /** Feed the current signals (after every change) and the key just pressed, if any. */
  update(now: Signals, key: string | null = null): void {
    const step = this.step;
    const prev = this.#prev;
    this.#prev = { ...now };
    if (!step || !prev) return;
    if (!step.done(prev, now, key)) return;
    if (step.settings) {
      // One new setting per change, so a shuffle that moves many counts once.
      const fresh = step.settings(prev, now).find((id) => !this.#seen.has(id));
      if (!fresh) return;
      this.#seen.add(fresh);
    }
    this.progress += 1;
    if (this.progress >= (step.need ?? 1)) {
      this.progress = 0;
      this.#seen.clear();
      this.index += 1;
      if (this.index >= this.steps.length) this.#finish();
    }
  }

  #finish(): void {
    if (!this.active) return;
    this.active = false;
    this.onend();
  }
}
