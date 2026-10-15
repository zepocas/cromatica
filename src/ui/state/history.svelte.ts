export const UNDO_LIMIT = 100;

/**
 * Undo and redo over snapshots of some state. Changes come in through
 * `record` and collect into one pending step until `commit`, so everything
 * between two commits (a whole slider drag, say) is undone at once. The app
 * commits at the start of every pointer press and key press.
 */
export class History<T> {
  canUndo = $state(false);
  canRedo = $state(false);
  private past: T[] = [];
  private future: T[] = [];
  private current: T;
  private currentKey: string;
  private pending: T | null = null;

  constructor(
    initial: T,
    private readonly limit = UNDO_LIMIT,
  ) {
    this.current = initial;
    this.currentKey = JSON.stringify(initial);
  }

  /** The state is now `next`; ignored when nothing changed. */
  record(next: T): void {
    this.pending = JSON.stringify(next) === this.currentKey ? null : next;
    // A pending change is undoable already, and it will drop the redo steps.
    this.canUndo = this.past.length > 0 || this.pending !== null;
    this.canRedo = this.future.length > 0 && this.pending === null;
  }

  /** Close the pending step, if any. */
  commit(): void {
    if (this.pending === null) return;
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    this.setCurrent(this.pending);
  }

  /** The state to go back to, or null. */
  undo(): T | null {
    this.commit();
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.current);
    this.setCurrent(prev);
    return prev;
  }

  redo(): T | null {
    this.commit();
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.setCurrent(next);
    return next;
  }

  private setCurrent(state: T): void {
    this.current = state;
    this.currentKey = JSON.stringify(state);
    this.record(state);
  }
}
