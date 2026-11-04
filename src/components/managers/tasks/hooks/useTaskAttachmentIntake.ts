import { useQueryClient } from '@tanstack/react-query';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { mediaKeys } from 'components/managers/media/utils/useMediaQuery';
import { isMediaFile } from 'components/managers/media/utils/usePasteFiles';
import { uploadMediaInput } from 'components/managers/media/utils/useUploadMedia';
import { barFraction, type QueueRow } from 'components/managers/files/upload/queue';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useUploadQueueStore } from 'lib/stores/upload-queue';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type HTMLAttributes,
} from 'react';
import { rememberMedia } from '../api/tasksService';

type AttachId = (id: number) => Promise<void> | void;

export type TaskAttachmentDropProps = Pick<
  HTMLAttributes<HTMLElement>,
  'onDragEnterCapture' | 'onDragOverCapture' | 'onDragLeaveCapture' | 'onDropCapture'
>;

type IntakeOptions = {
  enabled: boolean;
  onMedia: AttachId;
  onFile: AttachId;
};

type UploadOutcome =
  | { ok: true; fileId: number }
  | { ok: false; reason: string }
  | { ok: false; aborted: true };

const hasFiles = (dataTransfer: DataTransfer | null): boolean =>
  !!dataTransfer && Array.from(dataTransfer.types ?? []).includes('Files');

/** React events cross portals: a window opened from the zone keeps its own drops. */
const inZone = (event: ReactDragEvent<HTMLElement>): boolean =>
  event.currentTarget.contains(event.target as Node);

/**
 * A directory is reported as a zero-byte File by `dataTransfer.files`. The entry API is the only
 * signal that distinguishes it from a real empty file, which the library upload path accepts.
 */
function filesFromDrop(dataTransfer: DataTransfer | null): {
  files: File[];
  folders: string[];
} {
  const files: File[] = [];
  const folders: string[] = [];
  const items = Array.from(dataTransfer?.items ?? []).filter((item) => item.kind === 'file');
  const entries = items.map((item) => (item.webkitGetAsEntry ? item.webkitGetAsEntry() : null));

  if (!items.length || entries.every((entry) => entry === null)) {
    return { files: Array.from(dataTransfer?.files ?? []), folders };
  }

  items.forEach((item, index) => {
    const entry = entries[index];
    if (entry?.isDirectory) {
      folders.push(entry.name);
      return;
    }
    const file = item.getAsFile();
    if (file) files.push(file);
  });

  return { files, folders };
}

function rowFailure(row: QueueRow): string {
  if (row.status === 'big') return 'too big';
  if (row.status === 'lost') return 'upload dropped';
  return 'upload failed';
}

function waitForLibraryUpload(
  rowId: string,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<UploadOutcome> {
  return new Promise((resolve) => {
    let unsubscribe = () => {};
    let seen = false;

    const finish = (outcome: UploadOutcome) => {
      unsubscribe();
      signal.removeEventListener('abort', abort);
      resolve(outcome);
    };
    const abort = () => finish({ ok: false, aborted: true });
    const inspect = () => {
      if (signal.aborted) {
        abort();
        return;
      }
      const row = useUploadQueueStore.getState().queue.rows.find((item) => item.id === rowId);
      if (!row) {
        if (seen) finish({ ok: false, reason: 'upload removed' });
        return;
      }
      seen = true;
      onProgress(barFraction(row));
      if (row.status === 'done' || row.status === 'dup') {
        const fileId = Number(row.fileId ?? 0);
        finish(fileId > 0 ? { ok: true, fileId } : { ok: false, reason: 'upload failed' });
      } else if (row.status === 'big' || row.status === 'lost' || row.status === 'fail') {
        finish({ ok: false, reason: rowFailure(row) });
      }
    };

    unsubscribe = useUploadQueueStore.subscribe(inspect);
    signal.addEventListener('abort', abort, { once: true });
    inspect();
  });
}

/** A ready file through the library upload queue, for those who may upload. */
export async function uploadLibraryFile(file: File): Promise<number> {
  const [rowId] = useUploadQueueStore.getState().enqueue([file], { topicIds: [], newTopics: [] });
  if (!rowId) throw new Error('upload failed');
  const outcome = await waitForLibraryUpload(rowId, new AbortController().signal, () => {});
  if ('aborted' in outcome) throw new Error('upload stopped');
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.fileId;
}

/**
 * One intake path for task detail and task forms.
 *
 * Raster images and videos first use the existing media uploader. If that path refuses the file,
 * the same source is queued in the private file library with no topics. Every item is processed
 * independently, so one refusal never stops the rest of a drop.
 */
export function useTaskAttachmentIntake({ enabled, onMedia, onFile }: IntakeOptions) {
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
  const mayUploadFiles = canWrite(SECTION.files);
  const enqueue = useUploadQueueStore((state) => state.enqueue);
  const { showMessage } = useSnackBarStore();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const mounted = useRef(true);
  const depth = useRef(0);
  const pending = useRef<File[]>([]);
  const processing = useRef(false);
  const total = useRef(0);
  const completed = useRef(0);
  const waits = useRef<Set<AbortController>>(new Set());
  // Bumped when the intake is switched off: a form reopened mid-upload must not get the old file.
  const session = useRef(0);
  const live = useRef({ enabled, mayUploadFiles, onMedia, onFile });
  live.current = { enabled, mayUploadFiles, onMedia, onFile };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      waits.current.forEach((controller) => controller.abort());
      waits.current.clear();
    };
  }, []);

  useEffect(() => {
    if (enabled) return;
    depth.current = 0;
    setDragging(false);
    session.current += 1;
    pending.current = [];
    waits.current.forEach((controller) => controller.abort());
    waits.current.clear();
  }, [enabled]);

  // A file missing every drop zone would otherwise replace the whole page with that file.
  useEffect(() => {
    if (!enabled) return;
    const refuse = (event: DragEvent) => {
      if (event.defaultPrevented || !hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', refuse);
    window.addEventListener('drop', refuse);
    return () => {
      window.removeEventListener('dragover', refuse);
      window.removeEventListener('drop', refuse);
    };
  }, [enabled]);

  const publishProgress = useCallback((current = 0) => {
    if (!mounted.current) return;
    const denominator = Math.max(1, total.current);
    setProgress(((completed.current + current) / denominator) * 100);
  }, []);

  const uploadLibrary = useCallback(
    async (file: File): Promise<number> => {
      if (!live.current.mayUploadFiles) throw new Error('no upload right');
      const [rowId] = enqueue([file], { topicIds: [], newTopics: [] });
      if (!rowId) throw new Error('upload failed');

      const controller = new AbortController();
      waits.current.add(controller);
      const outcome = await waitForLibraryUpload(rowId, controller.signal, publishProgress);
      waits.current.delete(controller);
      if ('aborted' in outcome) throw new Error('upload stopped');
      if (!outcome.ok) throw new Error(outcome.reason);
      return outcome.fileId;
    },
    [enqueue, publishProgress],
  );

  const processFile = useCallback(
    async (file: File) => {
      const started = session.current;
      const alive = () => mounted.current && session.current === started;
      if (isMediaFile(file)) {
        try {
          const media = await uploadMediaInput(file);
          if (!alive()) return;
          const id = Number(media.id ?? 0);
          if (!id) throw new Error('empty media response');
          rememberMedia([
            {
              id,
              thumbnail: media.media?.thumbnail?.mediaUrl,
              fullSize: media.media?.fullSize?.mediaUrl,
              blurhash: media.media?.blurhash,
            },
          ]);
          queryClient.invalidateQueries({ queryKey: mediaKeys.all });
          try {
            await live.current.onMedia(id);
          } catch {
            throw new Error('not attached');
          }
          return;
        } catch (error) {
          if (error instanceof Error && error.message === 'not attached') throw error;
          if (!alive()) return;
          // A media refusal is not terminal: the private file library accepts any type.
        }
      }

      const fileId = await uploadLibrary(file);
      if (!alive()) return;
      try {
        await live.current.onFile(fileId);
      } catch {
        throw new Error('not attached');
      }
    },
    [queryClient, uploadLibrary],
  );

  const run = useCallback(async () => {
    if (processing.current) return;
    processing.current = true;
    if (mounted.current) setBusy(true);

    while (pending.current.length) {
      const file = pending.current.shift();
      if (!file || !mounted.current) break;
      publishProgress();
      try {
        await processFile(file);
      } catch (error) {
        if (mounted.current) {
          const reason = error instanceof Error ? error.message : 'upload failed';
          showMessage(`${file.name}: ${reason}`, 'error');
        }
      }
      completed.current += 1;
      publishProgress();
    }

    processing.current = false;
    if (!mounted.current) return;
    setBusy(false);
    setProgress(0);
    total.current = 0;
    completed.current = 0;
  }, [processFile, publishProgress, showMessage]);

  const openFiles = useCallback(
    (files: File[]) => {
      if (!live.current.enabled || !files.length) return;
      pending.current.push(...files);
      total.current += files.length;
      publishProgress();
      void run();
    },
    [publishProgress, run],
  );

  const resetDrag = useCallback(() => {
    depth.current = 0;
    if (mounted.current) setDragging(false);
  }, []);

  const dropProps = useMemo<TaskAttachmentDropProps>(
    () => ({
      onDragEnterCapture: (event) => {
        if (!live.current.enabled || !inZone(event) || !hasFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        depth.current += 1;
        setDragging(true);
      },
      onDragOverCapture: (event) => {
        if (!live.current.enabled || !inZone(event) || !hasFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
      },
      onDragLeaveCapture: (event) => {
        if (!live.current.enabled || depth.current === 0 || !inZone(event)) return;
        event.preventDefault();
        event.stopPropagation();
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) resetDrag();
      },
      onDropCapture: (event) => {
        if (!live.current.enabled || !inZone(event) || !hasFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        resetDrag();
        const dropped = filesFromDrop(event.dataTransfer);
        dropped.folders.forEach((name) => showMessage(`${name}: folder skipped`, 'error'));
        openFiles(dropped.files);
      },
    }),
    [openFiles, resetDrag, showMessage],
  );

  return { busy, dragging, dropProps, openFiles, progress };
}
