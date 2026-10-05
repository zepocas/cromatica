export const REEL_LIMIT = 20;

/**
 * The recent shuffles, stepped through with ← and →. Each slot holds the last
 * state seen in it, so edits made after stepping to a shuffle are still there
 * when stepping back. A new shuffle always goes at the end.
 */
export class Reel<T> {
  position = $state(0);
  length = $state(0);
  private slots: T[] = [];

  constructor(private readonly limit = REEL_LIMIT) {}

  get canBack(): boolean {
    return this.position > 0;
  }

  get canForward(): boolean {
    return this.position < this.length - 1;
  }

  /** A shuffle turned `before` into `after`. */
  push(before: T, after: T): void {
    if (this.slots.length === 0) this.slots.push(before);
    else this.slots[this.position] = before;
    this.slots.push(after);
    if (this.slots.length > this.limit) this.slots.splice(0, this.slots.length - this.limit);
    this.sync(this.slots.length - 1);
  }

  /** The state one slot back (-1) or forward (1), or null at either end; `current` is kept in the slot being left. */
  step(direction: -1 | 1, current: T): T | null {
    const target = this.position + direction;
    if (target < 0 || target >= this.slots.length) return null;
    this.slots[this.position] = current;
    this.sync(target);
    return this.slots[target];
  }

  private sync(position: number): void {
    this.position = position;
    this.length = this.slots.length;
  }
}
