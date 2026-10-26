// `?debug`: a ring buffer of what the user did and which design fields it changed, to read back when something
// looks wrong. Memory only (nothing is stored), and nothing is recorded without the flag.
import type { Design } from '../../design/design';
import { saveDesign } from '../../design/schema';

export interface LogEntry {
  at: number;
  action: string;
  /** `path: old → new`, capped. */
  changes: string[];
  /** Only on errors: the whole design the error happened with. */
  design?: unknown;
  error?: string;
}

const MAX_ENTRIES = 200;
const MAX_CHANGES = 12;

/** Leaves of a design as `path → JSON`, with a color (three numbers) as one leaf. */
function leaves(value: unknown, path: string, out: Map<string, string>): void {
  const color = Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'number');
  if (value !== null && typeof value === 'object' && !color) {
    for (const [k, v] of Object.entries(value)) leaves(v, path ? `${path}.${k}` : k, out);
  } else {
    out.set(path, JSON.stringify(value));
  }
}

export function designChanges(before: Design | null, after: Design): string[] {
  const a = new Map<string, string>();
  const b = new Map<string, string>();
  if (before) leaves(before, '', a);
  leaves(after, '', b);
  const changes: string[] = [];
  for (const [path, now] of b) {
    const was = a.get(path);
    if (was !== now) changes.push(`${path}: ${was ?? '∅'} → ${now}`);
  }
  for (const path of a.keys()) if (!b.has(path)) changes.push(`${path}: removed`);
  return changes.length > MAX_CHANGES
    ? [...changes.slice(0, MAX_CHANGES), `+${changes.length - MAX_CHANGES} more`]
    : changes;
}

/** One line per entry, for the console and the dev terminal. */
export function formatEntry(e: LogEntry): string {
  const head = `[cromatica ${new Date(e.at).toISOString().slice(11, 23)}] ${e.action}`;
  const body = e.error ? `\n${e.error}\n${JSON.stringify(e.design)}` : e.changes.map((c) => `\n  ${c}`).join('');
  return head + body;
}

export class DebugLog {
  /** `sink` gets every entry as it is recorded. */
  constructor(private readonly sink?: (entry: LogEntry) => void) {}

  private entries: LogEntry[] = [];
  private last: Design | null = null;
  private pending = '';

  /** What the user just did; the next design change is recorded under it. */
  note(action: string): void {
    this.pending = action;
  }

  /** The design changed (or this is the first one seen). */
  record(design: Design): void {
    const changes = designChanges(this.last, design);
    this.last = structuredClone(design);
    if (changes.length === 0 && this.last !== null && this.entries.length > 0) return;
    this.push({ at: Date.now(), action: this.pending || 'edit', changes });
    this.pending = '';
  }

  /** Keeps the design as it was, since the buffer will have rolled over by the time anyone looks. */
  error(err: unknown): void {
    const text = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err);
    this.push({
      at: Date.now(),
      action: 'error',
      changes: [],
      error: text,
      design: this.last ? saveDesign(this.last).design : undefined,
    });
  }

  /** The log and the current design in the save format, so a bug can be reloaded from it. */
  dump(): { entries: LogEntry[]; design: unknown } {
    return { entries: this.entries.slice(), design: this.last ? saveDesign(this.last).design : null };
  }

  private push(entry: LogEntry): void {
    this.entries.push(entry);
    this.sink?.(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();
  }
}
