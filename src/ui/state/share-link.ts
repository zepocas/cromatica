import type { Design } from '../../design/design';
import { SHARE_PREFIX, decodeShare, encodeShare } from '../../design/share';
import type { SavedDesign } from '../../design/schema';

/** Past this many characters a link may be cut off by chat apps; the PNG carries the design instead. */
export const LONG_LINK = 2000;

/** The design in a `#v1.…` fragment; failed when there was a link but it couldn't be read. Never throws. */
export async function readShareHash(hash: string): Promise<{ design: SavedDesign | null; failed: boolean }> {
  const payload = hash.replace(/^#/, '');
  if (!payload.startsWith(SHARE_PREFIX)) return { design: null, failed: false };
  try {
    return { design: await decodeShare(payload), failed: false };
  } catch (err) {
    console.warn('share link: ignoring the link', err);
    return { design: null, failed: true };
  }
}

export async function shareUrl(design: Design, page: Location = location): Promise<string> {
  return `${page.origin}${page.pathname}#${await encodeShare(design)}`;
}

/** Drop the fragment, keeping the query (`?default`), without a history entry or a reload. */
export function clearShareHash(page: Location = location): void {
  if (page.hash) history.replaceState(null, '', page.pathname + page.search);
}
