import { useQueryClient } from '@tanstack/react-query';
import type { common_MediaFull, CopyLibraryFileToMediaResponse } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useRef, useState } from 'react';
import { copyLibraryFileToMedia, LIBRARY_ERROR_WORD, libraryErrorCode } from '../api/library';
import type { LibraryItem, LibraryRef, RefKey } from '../api/types';
import { refKey, refOf } from '../api/types';
import { invalidateLibrary } from '../hooks/useLibraryMutations';

export type CopyFn = (fileId: number) => Promise<CopyLibraryFileToMediaResponse>;

export type ResolveFailure = { ref: LibraryRef; name: string; word: string };

export type ResolveResult = {
  /** Media rows in the order of selection; a failed or unknown ref is left out. */
  media: common_MediaFull[];
  /** Which ref every resolved row came from (same order as `media`). */
  origins: LibraryRef[];
  failed: ResolveFailure[];
  /** How many server copies were made by this call (cache hits do not count). */
  copied: number;
};

/** The 1–2 word reason a FILE ref did not become media. */
export function copyFailureWord(error: unknown): string {
  const code = libraryErrorCode(error);
  return code ? LIBRARY_ERROR_WORD[code] : 'not copied';
}

/**
 * Turns a mixed library selection into media rows, sequentially and in the order of selection.
 *
 * - MEDIA refs pass through: the browser's row, or else a row the host already holds (`known`),
 *   because the browser only knows rows it has loaded since it mounted.
 * - FILE refs go through `CopyLibraryFileToMedia` (D7). A copy is cached by file id, so a tray
 *   that re-sends its whole set on every click never copies the same file twice.
 * - One failure leaves the rest: it is reported and dropped.
 */
export async function resolveRefsToMedia(
  refs: LibraryRef[],
  items: LibraryItem[],
  opts: {
    copy: CopyFn;
    cache: Map<number, common_MediaFull>;
    known?: Map<RefKey, common_MediaFull>;
  },
): Promise<ResolveResult> {
  const byKey = new Map<RefKey, LibraryItem>();
  for (const item of items) {
    const ref = refOf(item);
    if (ref) byKey.set(refKey(ref), item);
  }

  const out: ResolveResult = { media: [], origins: [], failed: [], copied: 0 };
  const seen = new Set<RefKey>();
  for (const ref of refs) {
    const key = refKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    const item = byKey.get(key);

    if (ref.source === 'media') {
      const row = item?.media ?? opts.known?.get(key);
      if (!row) continue;
      out.media.push(row.id ? row : { ...row, id: ref.id });
      out.origins.push(ref);
      continue;
    }

    const cached = opts.cache.get(ref.id) ?? opts.known?.get(key);
    if (cached) {
      out.media.push(cached);
      out.origins.push(ref);
      continue;
    }
    try {
      const res = await opts.copy(ref.id);
      out.copied += 1;
      if (!res.media?.id) throw new Error('not copied');
      opts.cache.set(ref.id, res.media);
      out.media.push(res.media);
      out.origins.push(ref);
    } catch (error) {
      out.failed.push({ ref, name: item?.name ?? '', word: copyFailureWord(error) });
    }
  }
  return out;
}

/**
 * The visual picker's FILE → media step (C2). `resolve` answers `undefined` when a newer call
 * started meanwhile, so a slow copy never overwrites a later click.
 */
export function useCopyToMedia(copy: CopyFn = copyLibraryFileToMedia) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const cache = useRef(new Map<number, common_MediaFull>());
  /** media id → the FILE ref it was copied from, so the grid keeps that tile selected. */
  const origin = useRef(new Map<number, LibraryRef>());
  const turn = useRef(0);
  const [busy, setBusy] = useState(false);
  /** Tiles whose copy runs now; the grid dims them and says «copying». */
  const [busyKeys, setBusyKeys] = useState<RefKey[]>([]);
  /** The last word a tile's copy failed with; a later success clears it. */
  const [errors, setErrors] = useState<Partial<Record<RefKey, string>>>({});

  const resolve = useCallback(
    async (
      refs: LibraryRef[],
      items: LibraryItem[],
      held: common_MediaFull[] = [],
    ): Promise<common_MediaFull[] | undefined> => {
      const mine = ++turn.current;
      const known = new Map<RefKey, common_MediaFull>();
      for (const m of held) {
        if (!m.id) continue;
        known.set(refKey(origin.current.get(m.id) ?? { source: 'media', id: m.id }), m);
      }
      const copying = refs
        .filter((r) => r.source === 'file' && !cache.current.has(r.id) && !known.has(refKey(r)))
        .map(refKey);
      if (copying.length) {
        setBusy(true);
        setBusyKeys(copying);
      }
      try {
        const res = await resolveRefsToMedia(refs, items, { copy, cache: cache.current, known });
        res.media.forEach((m, i) => {
          const from = res.origins[i];
          if (m.id && from?.source === 'file') origin.current.set(m.id, from);
        });
        if (copying.length) {
          setErrors((prev) => {
            const next = { ...prev };
            for (const key of copying) delete next[key];
            for (const f of res.failed) next[refKey(f.ref)] = f.word;
            return next;
          });
        }
        for (const f of res.failed) {
          showMessage(f.name ? `${f.name} · ${f.word}` : f.word, 'error');
        }
        // A copy made a new media row: the grid and the old screens must see it.
        if (res.copied > 0) void invalidateLibrary(qc);
        return mine === turn.current ? res.media : undefined;
      } finally {
        if (mine === turn.current) {
          setBusy(false);
          setBusyKeys([]);
        }
      }
    },
    [copy, qc, showMessage],
  );

  /** The ref a held media row is shown under in the grid: its FILE origin, if it was copied. */
  const refFor = useCallback(
    (m: common_MediaFull): LibraryRef =>
      (m.id && origin.current.get(m.id)) || { source: 'media', id: m.id ?? 0 },
    [],
  );

  return { resolve, refFor, busy, busyKeys, errors };
}
