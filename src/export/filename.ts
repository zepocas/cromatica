import type { ExportFormat } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The local timestamp keeps repeated exports from colliding, and the
 * date-before-time order makes names sort chronologically.
 */
export function exportFilename(format: ExportFormat, at: Date = new Date()): string {
  const date = `${pad(at.getFullYear() % 100)}${pad(at.getMonth() + 1)}${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return `cromatica-${date}${time}.${format === 'png' ? 'png' : 'jpg'}`;
}
