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
  /** The colors in their order, serialized. */
  colors: string;
  /** Hand edits to planes and blobs, serialized. */
  arrange: string;
  shortcuts: boolean;
  /** Exports finished and designs reopened from an exported image, counted. */
  exports: number;
  reopened: number;
}

export interface Step {
  title: string;
  text: string;
  /** The step shows something only some designs have; the app switches to one that does. */
  needs?: 'arrangeable';
  /** What the user does with `keys`, shown before it; default "press". */
  verb?: string;
  /** Shown as the key to press; a step with none is done by what the user does to the app. */
  keys: string;
  /** How many times `done` must fire before the step is over; default 1. */
  need?: number;
  /** `key` is the lowercased key just pressed outside a text field, if any. */
  done: (prev: Signals, now: Signals, key: string | null) => boolean;
}

export const STEPS: Step[] = [
  {
    title: 'shuffle',
    text: 'Shuffle to find a starting point: every press makes a new design from a curated set. Try a few.',
    keys: 'space',
    need: 3,
    done: (prev, now) => now.reel > prev.reel,
  },
  {
    title: 'go back',
    text: 'Liked one that went by? Step back and forward through your shuffles, and stop on the one you like.',
    keys: '← →',
    need: 2,
    done: (_prev, _now, key) => key === 'arrowleft' || key === 'arrowright',
  },
  {
    title: 'more like this',
    text: 'Variations of the design on screen. Click one to take it.',
    keys: 'm',
    done: (prev, now) => prev.exploring && !now.exploring,
  },
  {
    title: 'new look, same colors',
    text: 'Shuffles the pattern and its adjustments and keeps your palette.',
    keys: 'q',
    done: (_prev, _now, key) => key === 'q',
  },
  {
    title: 'new colors, same look',
    text: 'Shuffles only the palette.',
    keys: 'w',
    done: (_prev, _now, key) => key === 'w',
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
    text: 'Planes and blobs can be moved piece by piece. Drag one on the canvas.',
    verb: 'drag',
    keys: 'a blob or plane',
    needs: 'arrangeable',
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
    text: 'The locks keep a part safe from shuffles: 1 pattern, 2 adjust, 3 colors. Lock one, then shuffle.',
    keys: '1 2 3',
    done: (_prev, _now, key) => key === '1' || key === '2' || key === '3',
  },
  {
    title: 'export',
    text: 'Export the image at the canvas size.',
    keys: 'e',
    done: (prev, now) => now.exports > prev.exports,
  },
  {
    title: 'move on',
    text: 'Make something different, so you can see the next step work.',
    keys: 'space',
    done: (prev, now) => now.reel > prev.reel,
  },
  {
    title: 'and back in',
    text: 'The exported file carries its settings. Drop it on the window and the design you exported is back, ready to keep editing.',
    verb: 'drop',
    keys: 'the exported file',
    done: (prev, now) => now.reopened > prev.reopened,
  },
  {
    title: 'make it yours',
    text: 'The panel is yours to explore: every section, slider and color is fair game. Change a few settings and see what happens.',
    verb: 'change',
    keys: 'settings in the panel',
    need: 3,
    done: (prev, now) =>
      prev.kind !== now.kind ||
      prev.warpShape !== now.warpShape ||
      prev.adjust !== now.adjust ||
      prev.colors !== now.colors ||
      prev.arrange !== now.arrange,
  },
  {
    title: 'there is more',
    text: 'That is the core. The shortcut list has the rest, and the panel is full of settings worth exploring.',
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
    this.progress += 1;
    if (this.progress >= (step.need ?? 1)) {
      this.progress = 0;
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
