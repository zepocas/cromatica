// The design travels inside exported PNGs (D45) as a share payload (D110), so a
// dropped export reopens through the same schema and migrations as a link.
import type { Design } from '../design/design';
import { loadDesign, type SavedDesign } from '../design/schema';
import { decodeShare, encodeShare, SHARE_PREFIX } from '../design/share';
import type { OutputSize } from '../engine/types';
import { readPngInfo } from './png-read';

export const DESIGN_KEYWORD = 'cromatica.design';

/** PNG text entries that carry `design`. */
export async function designText(design: Design): Promise<Record<string, string>> {
  return { [DESIGN_KEYWORD]: await encodeShare(design) };
}

/** The design in an embedded text: a share payload, or the save-envelope JSON that exports before D110 carry. */
export function readDesignText(text: string): Promise<SavedDesign> | SavedDesign {
  return text.startsWith(SHARE_PREFIX) ? decodeShare(text) : loadDesign(JSON.parse(text));
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
  const text = info?.text[DESIGN_KEYWORD];
  if (!info || text === undefined) return null;
  return { design: await readDesignText(text), size: info.size };
}
