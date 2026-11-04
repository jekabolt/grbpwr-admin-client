import { useQueryClient } from '@tanstack/react-query';
import type { LibraryFile } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { filesKeys } from 'components/managers/files/hooks/useFiles';
import { SECTION } from 'constants/routes';
import { notify } from 'lib/stores/store';
import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { tasksService, type TaskFileContent } from '../../api/tasksService';
import { uploadLibraryFile } from '../../hooks/useTaskAttachmentIntake';
import { tasksKeys, useTaskFileContent } from '../../hooks/useTasks';
import { base64FromBytes } from './file-view';
import { SheetEmbedsContext } from './sheet-context';
import { copyName, loadSheetDoc, type SheetDoc } from './sheet-doc';
import { addressOf, parseAddress, type SheetEdits } from './sheet-edit';
import {
  draftCount,
  NO_SESSION,
  sheetSessionKey,
  useSheetSessions,
  type SheetSession,
} from './sheet-session';

const NO_EDITS: Record<string, string> = {};
const NO_TOTALS = new Map<string, number>();

/** Чтение → разобранный файл. Пока новое разбирается, на экране остаётся старое. */
function useSheetDoc(fileName: string, data: TaskFileContent | undefined) {
  const [state, setState] = useState<{ doc: SheetDoc | null; failed: boolean }>({
    doc: null,
    failed: false,
  });
  useEffect(() => {
    if (!data || data.tooLarge) return;
    let alive = true;
    loadSheetDoc(fileName, data)
      .then((doc) => alive && setState({ doc, failed: false }))
      .catch(() => alive && setState({ doc: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [fileName, data]);
  return state;
}

/** Всё состояние и все действия одной таблицы. Вид — в `sheet-view.tsx`. */
export function useSheetEditor(taskId: number, file: LibraryFile, onClosed?: () => void) {
  const fileId = file.id ?? 0;
  const fileName = file.fileName ?? 'file';
  const key = sheetSessionKey(taskId, fileId);
  const host = useId();
  const qc = useQueryClient();
  const { canWrite } = usePermissions();
  const embeds = useContext(SheetEmbedsContext);

  const patchStore = useSheetSessions((state) => state.patch);
  const session = useSheetSessions((state) => state.sessions[key]) ?? NO_SESSION;
  const patch = useCallback(
    (next: Partial<SheetSession>) => patchStore(key, next),
    [key, patchStore],
  );

  const query = useTaskFileContent(taskId, fileId);
  const data = session.editing && session.data ? session.data : query.data;
  const { doc, failed } = useSheetDoc(fileName, data);

  const sheets = doc?.sheets ?? [];
  const sheetIndex = Math.min(session.sheet, Math.max(0, sheets.length - 1));
  const sheet = sheets[sheetIndex];
  const book = doc?.book ?? null;
  const bookIndexOf = useCallback(
    (index: number) => {
      const name = doc?.sheets[index]?.name;
      return book && name !== undefined ? book.sheets.findIndex((s) => s.name === name) : -1;
    },
    [book, doc],
  );
  const bookIndex = bookIndexOf(sheetIndex);
  const sheetEditable = bookIndex >= 0 && !!book?.sheets[bookIndex].editable;
  const viewOnly = !!doc && !sheetEditable;
  const canEdit = canWrite(SECTION.tasks) && sheetEditable && !data?.tooLarge;

  const count = draftCount(session.drafts);
  const draft = session.drafts[sheetIndex] ?? NO_EDITS;
  const totals = useMemo(() => {
    if (!session.editing || !book || bookIndex < 0) return NO_TOTALS;
    return book.recalc(bookIndex, new Map(Object.entries(draft)));
  }, [book, bookIndex, draft, session.editing]);

  // Вкладку закрывают так же легко, как окно просмотра, а спросить там можно только браузером.
  useEffect(() => {
    if (count === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [count]);

  const ended = useMemo<Partial<SheetSession>>(
    () => ({
      editing: false,
      data: null,
      drafts: {},
      sel: null,
      active: null,
      host: null,
      conflict: null,
      closing: false,
      saving: false,
      error: null,
    }),
    [],
  );

  const startEdit = useCallback(() => {
    if (!query.data) return;
    patch({ ...ended, editing: true, data: query.data });
  }, [ended, patch, query.data]);

  const cancel = useCallback(() => patch(ended), [ended, patch]);

  const setSheet = useCallback(
    (index: number) => patch({ sheet: index, sel: null, active: null }),
    [patch],
  );

  const press = useCallback(
    (addr: string) => {
      if (!session.editing || !book || bookIndex < 0) return;
      const locked = book.cell(bookIndex, addr).locked;
      patch({ sel: addr, active: locked ? null : addr, host });
    },
    [book, bookIndex, host, patch, session.editing],
  );

  const setCell = useCallback(
    (addr: string, text: string) => {
      if (!book || bookIndex < 0) return;
      const current = useSheetSessions.getState().sessions[key] ?? NO_SESSION;
      const nextSheet = { ...(current.drafts[sheetIndex] ?? {}) };
      if (book.sameValue(bookIndex, addr, text)) delete nextSheet[addr];
      else nextSheet[addr] = text;
      patch({ drafts: { ...current.drafts, [sheetIndex]: nextSheet }, error: null });
    },
    [book, bookIndex, key, patch, sheetIndex],
  );

  /** Esc: ячейка возвращается к файлу, поле ввода закрывается. */
  const revertCell = useCallback(() => {
    const current = useSheetSessions.getState().sessions[key] ?? NO_SESSION;
    if (!current.active) return;
    const nextSheet = { ...(current.drafts[sheetIndex] ?? {}) };
    delete nextSheet[current.active];
    patch({ drafts: { ...current.drafts, [sheetIndex]: nextSheet }, active: null });
  }, [key, patch, sheetIndex]);

  const move = useCallback(
    (dx: number, dy: number) => {
      if (!book || bookIndex < 0 || !sheet) return;
      const from = parseAddress(session.active ?? '');
      if (!from) return;
      const originRow = sheet.originRow ?? 0;
      const originCol = sheet.originCol ?? 0;
      const width = sheet.rows.reduce((max, row) => Math.max(max, row.length), 0);
      let r = from.r;
      let c = from.c;
      for (;;) {
        r += dy;
        c += dx;
        const inside =
          r >= originRow &&
          r < originRow + sheet.rows.length &&
          c >= originCol &&
          c < originCol + width;
        if (!inside) return;
        const addr = addressOf(r, c);
        if (!book.cell(bookIndex, addr).locked) {
          patch({ sel: addr, active: addr, host });
          return;
        }
      }
    },
    [book, bookIndex, host, patch, session.active, sheet],
  );

  /** Правки всех листов, с индексами книги. */
  const collectEdits = useCallback((): Map<number, SheetEdits> => {
    const edits = new Map<number, SheetEdits>();
    for (const [index, cells] of Object.entries(session.drafts)) {
      const entries = Object.entries(cells);
      if (entries.length) edits.set(bookIndexOf(Number(index)), new Map(entries));
    }
    return edits;
  }, [bookIndexOf, session.drafts]);

  /** Старые ссылки на файл после записи мертвы: перечитывается всё, кроме только что записанного. */
  const invalidateReads = useCallback(() => {
    const own = tasksKeys.fileContent(taskId, fileId);
    qc.invalidateQueries({
      queryKey: tasksKeys.all,
      predicate: (q) => JSON.stringify(q.queryKey) !== JSON.stringify(own),
    });
    qc.invalidateQueries({ queryKey: filesKeys.all });
  }, [fileId, qc, taskId]);

  const inFlight = useRef(false);

  const write = useCallback(
    async (force: boolean) => {
      const base = session.data;
      if (!book || !base || inFlight.current) return;
      const closeAfter = session.closing;
      inFlight.current = true;
      patch({ saving: true, error: null, active: null });
      try {
        const content = base64FromBytes(book.apply(collectEdits()));
        const saved = await tasksService.saveTaskFileContent({
          taskId,
          fileId,
          content,
          baseSha256: base.sha256,
          force,
        });
        if (saved.conflict) {
          patch({
            saving: false,
            closing: false,
            conflict: { by: saved.lastEditedBy, at: saved.lastEditedAt },
          });
          return;
        }
        qc.setQueryData<TaskFileContent>(tasksKeys.fileContent(taskId, fileId), {
          content,
          tooLarge: false,
          sha256: saved.currentSha256,
          lastEditedBy: saved.lastEditedBy,
          lastEditedAt: saved.lastEditedAt,
        });
        patch(ended);
        invalidateReads();
        notify({ sev: 'ok', subject: 'FILE', text: 'saved' });
        if (closeAfter) onClosed?.();
      } catch {
        patch({ saving: false, closing: false, error: 'not saved' });
      } finally {
        inFlight.current = false;
      }
    },
    [
      book,
      collectEdits,
      ended,
      fileId,
      invalidateReads,
      onClosed,
      patch,
      qc,
      session.closing,
      session.data,
      taskId,
    ],
  );

  /** Чужую версию читаем заново, мимо кэша: правка остаётся открытой, черновик сброшен. */
  const takeTheirs = useCallback(async () => {
    patch({ saving: true, error: null });
    try {
      const fresh = await tasksService.getTaskFileContent(taskId, fileId);
      qc.setQueryData(tasksKeys.fileContent(taskId, fileId), fresh);
      invalidateReads();
      patch({ data: fresh, drafts: {}, sel: null, active: null, conflict: null, saving: false });
    } catch {
      patch({ saving: false, error: 'not opened' });
    }
  }, [fileId, invalidateReads, patch, qc, taskId]);

  /** Копия садится рядом с оригиналом: тот же файл не трогается вовсе. */
  const saveAsCopy = useCallback(async () => {
    if (!book || !session.data || inFlight.current) return;
    inFlight.current = true;
    patch({ saving: true, error: null, active: null });
    try {
      if (!canWrite(SECTION.files)) throw new Error('no upload right');
      const bytes = book.apply(collectEdits());
      const copy = new File([bytes as BlobPart], copyName(fileName), {
        type: file.contentType ?? 'application/octet-stream',
      });
      const copyId = await uploadLibraryFile(copy);
      if (!(await embeds?.attachFile(copyId))) throw new Error('not attached');
      patch(ended);
      notify({ sev: 'ok', subject: 'FILE', text: 'copy attached' });
    } catch (error) {
      const reason = error instanceof Error && error.message === 'no upload right';
      patch({ saving: false, error: reason ? 'no upload right' : 'not saved' });
    } finally {
      inFlight.current = false;
    }
  }, [
    book,
    canWrite,
    collectEdits,
    embeds,
    ended,
    file.contentType,
    fileName,
    patch,
    session.data,
  ]);

  /** Закрытие окна просмотра. С правками сначала вопрос, без них правка просто кончается. */
  const requestClose = useCallback(() => {
    if (session.editing && count > 0) {
      patch({ closing: true, active: null });
      return;
    }
    if (session.editing) patch(ended);
    onClosed?.();
  }, [count, ended, onClosed, patch, session.editing]);

  const keepEditing = useCallback(() => patch({ closing: false }), [patch]);

  const discard = useCallback(() => {
    patch(ended);
    onClosed?.();
  }, [ended, onClosed, patch]);

  return {
    host,
    session,
    data,
    query,
    doc,
    failed,
    sheets,
    sheet,
    sheetIndex,
    book,
    bookIndex,
    canEdit,
    viewOnly,
    count,
    draft,
    totals,
    startEdit,
    cancel,
    setSheet,
    press,
    setCell,
    revertCell,
    move,
    save: () => write(false),
    overwrite: () => write(true),
    takeTheirs,
    saveAsCopy,
    requestClose,
    keepEditing,
    discard,
  };
}

export type SheetEditor = ReturnType<typeof useSheetEditor>;
