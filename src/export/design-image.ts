// Reopening a design from an exported image, whichever format it was in (D45, D72).
import { loadDesign } from '../design/schema';
import { type ExportedDesign, readPngDesign } from './design-png';
import { readJpegInfo } from './jpeg';

export type { ExportedDesign };

/** The design JSON (as in `designText`'s one entry) of a JPEG exported by this app, as `readPngDesign` reads a PNG's. */
async function readJpegDesign(file: Blob): Promise<ExportedDesign | null> {
  const info = await readJpegInfo(file);
  if (!info || info.design === null) return null;
  return { design: loadDesign(JSON.parse(info.design)), size: info.size };
}

/**
 * The design and size of a PNG or JPEG exported by this app, or null for any
 * other file. Throws when the embedded design can't be read or loaded.
 */
export async function readExportedDesign(file: Blob): Promise<ExportedDesign | null> {
  return (await readPngDesign(file)) ?? (await readJpegDesign(file));
}
