/// <reference types="node" />
// Typed access to the in-page test harnesses (tests/e2e/harness/*). Pixel
// work happens in the page; only small summaries come back to Node.
import type { Page } from '@playwright/test';
import type { EngineHarness } from '../harness/engine';
import type { Harness as ExportHarness } from '../harness/export';

declare global {
  interface Window {
    engineHarness: EngineHarness;
  }
}

type Fn = (...args: never[]) => unknown;

function callIn<H extends Record<string, Fn>, K extends keyof H & string>(
  page: Page,
  global: 'harness' | 'engineHarness',
  name: K,
  args: Parameters<H[K]>,
): Promise<Awaited<ReturnType<H[K]>>> {
  return page.evaluate(
    ([g, n, a]) =>
      ((window as unknown as Record<string, Record<string, Fn>>)[g][n] as (...x: unknown[]) => unknown)(...a),
    [global, name, args] as const,
  ) as Promise<Awaited<ReturnType<H[K]>>>;
}

export async function openExportHarness(page: Page): Promise<void> {
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  await page.goto('/tests/e2e/harness/export.html');
  await page.waitForFunction(() => window.harnessReady === true);
}

/** Call a function of the export harness in the page. */
export function exportHarness<K extends keyof ExportHarness & string>(
  page: Page,
  name: K,
  ...args: Parameters<ExportHarness[K]>
) {
  return callIn<ExportHarness & Record<string, Fn>, K>(page, 'harness', name, args);
}

export async function openEngineHarness(page: Page): Promise<void> {
  await page.goto('/tests/e2e/harness/engine.html');
  await page.waitForFunction(() => window.engineHarness !== undefined);
}

/** Call a function of the engine harness in the page. */
export function engineHarness<K extends keyof EngineHarness & string>(
  page: Page,
  name: K,
  ...args: Parameters<EngineHarness[K]>
) {
  return callIn<EngineHarness & Record<string, Fn>, K>(page, 'engineHarness', name, args);
}

/** Timing and stats logs only when BENCH is set, so normal runs stay quiet. */
export function logBench(message: string): void {
  if (process.env.BENCH) console.log(message);
}

export const bench = !!process.env.BENCH;
