import type { common_MediaFull } from 'api/proto-http/admin';
import type { LibraryItem, LibraryKind, LibraryRef } from '../api/types';
import { refKey, refOf } from '../api/types';

/**
 * The library kinds a MediaSelector field shows, from its old props (02-DESIGN §6, D6).
 *
 * MediaManager in selection mode listed every media row that is not a video when `showVideos`
 * was off, 3D models included, so MODEL stays in. `vectorOnly` narrows to vectors; a field
 * without `allowSvg` does not show vectors.
 */
export function visualKinds({
  showVideos = true,
  allowSvg = false,
  vectorOnly = false,
}: {
  showVideos?: boolean;
  allowSvg?: boolean;
  vectorOnly?: boolean;
}): LibraryKind[] {
  if (vectorOnly) return ['LIBRARY_KIND_VECTOR'];
  const kinds: LibraryKind[] = ['LIBRARY_KIND_IMAGE'];
  if (allowSvg) kinds.push('LIBRARY_KIND_VECTOR');
  kinds.push('LIBRARY_KIND_MODEL');
  if (showVideos) kinds.push('LIBRARY_KIND_VIDEO');
  return kinds;
}

/**
 * A task keeps media and library files apart (D6): the picker answers one mixed selection and
 * this splits it, keeping the order of selection within each side. `media` carries the picked
 * media rows that the browser has loaded (new picks always are), for `mergePickedMedia`.
 */
export function splitRefs(
  refs: LibraryRef[],
  items: LibraryItem[],
): { mediaIds: number[]; fileIds: number[]; media: common_MediaFull[] } {
  const byKey = new Map(
    items.flatMap((item) => {
      const ref = refOf(item);
      return ref ? [[refKey(ref), item] as const] : [];
    }),
  );
  const mediaIds: number[] = [];
  const fileIds: number[] = [];
  const media: common_MediaFull[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = refKey(ref);
    if (seen.has(key) || !ref.id) continue;
    seen.add(key);
    if (ref.source === 'file') {
      fileIds.push(ref.id);
      continue;
    }
    mediaIds.push(ref.id);
    const row = byKey.get(key)?.media;
    if (row) media.push(row.id ? row : { ...row, id: ref.id });
  }
  return { mediaIds, fileIds, media };
}

export const mediaRef = (id: number): LibraryRef => ({ source: 'media', id });
export const fileRef = (id: number): LibraryRef => ({ source: 'file', id });
