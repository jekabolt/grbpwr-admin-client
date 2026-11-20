import { useQueryClient } from '@tanstack/react-query';
import { barFraction, type QueueRow } from 'components/managers/files/upload/queue';
import { uploadMediaInput } from 'components/managers/media/utils/useUploadMedia';
import { useSnackBarStore } from 'lib/stores/store';
import { useUploadQueueStore } from 'lib/stores/upload-queue';
import { useCallback, useEffect, useRef, useState } from 'react';
import { moveLibraryItems, uploadFileName } from '../api/library';
import type { LibraryRef } from '../api/types';
import { invalidateLibrary } from '../hooks/useLibraryMutations';
import { engineOf, type UploadAs } from './route';

/** A file on its way: the grid draws it as a hatched tile with its percent. */
export type PendingUpload = { key: string; name: string; progress: number };

type Outcome = { ok: true; ref: LibraryRef } | { ok: false; reason: string };

function rowFailure(row: QueueRow): string {
  if (row.status === 'big') return 'too big';
  if (row.status === 'lost') return 'upload dropped';
  return 'upload failed';
}

/** Puts one file in the files queue and follows its row to the end. */
function queueFile(file: File, onProgress: (p: number) => void): Promise<Outcome> {
  const [rowId] = useUploadQueueStore.getState().enqueue([file], { topicIds: [], newTopics: [] });
  if (!rowId) return Promise.resolve({ ok: false, reason: 'upload failed' });
  return new Promise((resolve) => {
    let seen = false;
    let unsubscribe = () => {};
    const finish = (o: Outcome) => {
      unsubscribe();
      resolve(o);
    };
    const inspect = () => {
      const row = useUploadQueueStore.getState().queue.rows.find((r) => r.id === rowId);
      if (!row) {
        if (seen) finish({ ok: false, reason: 'upload removed' });
        return;
      }
      seen = true;
      onProgress(barFraction(row));
      if (row.status === 'done' || row.status === 'dup') {
        const id = Number(row.fileId ?? 0);
        finish(
          id > 0 ? { ok: true, ref: { source: 'file', id } } : { ok: false, reason: 'failed' },
        );
      } else if (row.status === 'big' || row.status === 'lost' || row.status === 'fail') {
        finish({ ok: false, reason: rowFailure(row) });
      }
    };
    unsubscribe = useUploadQueueStore.subscribe(inspect);
    inspect();
  });
}

async function uploadMedia(file: File): Promise<Outcome> {
  try {
    const media = await uploadMediaInput(file, uploadFileName(file));
    const id = media.id ?? 0;
    return id > 0 ? { ok: true, ref: { source: 'media', id } } : { ok: false, reason: 'failed' };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'failed' };
  }
}

/**
 * The one upload entry of the library. Pictures and video go to the media doors (svg to the
 * vector door), everything else to the files queue; when a folder is open, every new row is then
 * moved into it with one `MoveLibraryItems`. Media go one by one; the files queue paces itself.
 */
export function useLibraryUpload({ folderId, as = 'auto' }: { folderId: number; as?: UploadAs }) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const seq = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const live = useRef({ folderId, as });
  live.current = { folderId, as };

  const setProgress = useCallback((key: string, progress: number) => {
    if (!mounted.current) return;
    setPending((list) => list.map((p) => (p.key === key ? { ...p, progress } : p)));
  }, []);

  const upload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const { folderId: target, as: mode } = live.current;
      const batch = files.map((file) => ({ file, key: `u${++seq.current}` }));
      setPending((list) => [
        ...batch.map(({ file, key }) => ({ key, name: file.name, progress: 0 })),
        ...list,
      ]);

      const done = (key: string) => {
        if (mounted.current) setPending((list) => list.filter((p) => p.key !== key));
      };

      const mediaJobs = batch.filter(({ file }) => engineOf(file, mode) === 'media');
      const fileJobs = batch.filter(({ file }) => engineOf(file, mode) === 'file');

      const mediaRun = (async () => {
        const out: Outcome[] = [];
        for (const { file, key } of mediaJobs) {
          setProgress(key, 0.1);
          out.push(await uploadMedia(file));
          setProgress(key, 1);
        }
        return out;
      })();
      const fileRun = Promise.all(
        fileJobs.map(({ file, key }) => queueFile(file, (p) => setProgress(key, p))),
      );
      const outcomes = [...(await mediaRun), ...(await fileRun)];

      const refs = outcomes.flatMap((o) => (o.ok ? [o.ref] : []));
      const failed = outcomes.filter((o) => !o.ok).length;
      if (target > 0 && refs.length) {
        try {
          await moveLibraryItems(refs, target);
        } catch {
          showMessage('not moved', 'error');
        }
      }
      await invalidateLibrary(qc);
      batch.forEach(({ key }) => done(key));
      if (failed) showMessage(`${failed} failed`, 'error');
      else showMessage(`uploaded ${refs.length}`, 'success');
    },
    [qc, setProgress, showMessage],
  );

  const progress = pending.length
    ? pending.reduce((sum, p) => sum + p.progress, 0) / pending.length
    : 0;

  return { upload, pending, progress, busy: pending.length > 0 };
}
