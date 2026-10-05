// The design travels inside exported PNGs (D45), as the same envelope the
// autosave uses, so a dropped export reopens with the schema's migrations.
import type { Design } from '../design/design';
import { loadDesign, saveDesign, type SavedDesign } from '../design/schema';
import type { OutputSize } from '../engine/types';
import { readPngInfo } from './png-read';

export const DESIGN_KEYWORD = 'cromatica.design';

/** PNG text entries that carry `design`. */
export function designText(design: Design): Record<string, string> {
  return { [DESIGN_KEYWORD]: JSON.stringify(saveDesign(design)) };
}

export interface ExportedDesign {
  design: SavedDesign;
  size: OutputSize;
}

/**
 * The design and size of a PNG exported by this app, or null for any other
 * file. Throws when the embedded design can't be read or loaded.
 */
export async function readPngDesign(file: Blob): Promise<ExportedDesign | null> {
  const info = await readPngInfo(file);
  const json = info?.text[DESIGN_KEYWORD];
  if (!info || json === undefined) return null;
  return { design: loadDesign(JSON.parse(json)), size: info.size };
}
