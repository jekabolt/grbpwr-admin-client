import { useMemo, useState } from 'react';
import type { common_MediaFull, LibraryFile } from 'api/proto-http/admin';
import {
  type LibraryItem,
  type LibraryRef,
  refKey,
  refOf,
} from 'components/managers/library/api/types';
import { LibraryPicker } from 'components/managers/library/picker/library-picker';
import { fileRef, mediaRef, splitRefs } from 'components/managers/library/picker/refs';
import { Button } from 'ui';
import { isTableFileName } from '../utils/sheet-token';

/** How a file chosen from the note format bar is inserted into its markdown. */
export type NoteFileInsert = 'link' | 'preview';

type AttachmentPickerProps = {
  selected: number[];
  onDone: (ids: number[]) => void;
  /** Media already on the task: shown selected beside the files. */
  mediaIds?: number[];
  /**
   * With it the window offers media too: the media part of the selection comes back here, every
   * media id in the order of selection plus the rows of the ones the window loaded.
   */
  onDoneMedia?: (ids: number[], picked: common_MediaFull[]) => void;
  onClose: () => void;
  insert?: never;
  onPick?: never;
  onPickTable?: never;
};

type NotePickerProps = {
  insert?: NoteFileInsert;
  onPick: (file: LibraryFile) => void;
  /** Есть — щелчок только выбирает файл, а ряд внизу предлагает `as table` и `as link`. */
  onPickTable?: (file: LibraryFile) => Promise<void>;
  onClose: () => void;
  selected?: never;
  onDone?: never;
  mediaIds?: never;
  onDoneMedia?: never;
};

type FilePickerProps = AttachmentPickerProps | NotePickerProps;

/**
 * Browse the library from inside a task or a note: the one library window (C2).
 *
 * Выбор сначала живёт ЗДЕСЬ черновиком: закрытие, Escape и ← не должны менять уже сохранённый
 * набор формы. Наружу он уходит целиком только через нижнюю кнопку.
 *
 * Task mode shows media and files together; media refs come in through `mediaIds` and go out
 * through `onDoneMedia`, files keep `selected` / `onDone`. Note mode offers files only, because a
 * note link is `/files/{id}`.
 */
export function FilePicker(props: FilePickerProps) {
  const notePicker = 'onPick' in props;
  const insert = notePicker ? props.insert ?? 'link' : undefined;
  const { onClose } = props;
  const asTable = notePicker ? props.onPickTable : undefined;
  const takesMedia = !notePicker && !!props.onDoneMedia;

  const initial = useMemo<LibraryRef[]>(
    () =>
      notePicker
        ? []
        : [
            ...(takesMedia ? (props.mediaIds ?? []).map(mediaRef) : []),
            ...props.selected.map(fileRef),
          ],
    // The draft is seeded once, when the window opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [draft, setDraft] = useState<LibraryRef[]>(initial);
  const [items, setItems] = useState<LibraryItem[]>([]);
  // Вставка в описание: щелчок выбирает файл, а чем он станет, решает ряд внизу окна.
  const [chosen, setChosen] = useState<LibraryFile | null>(null);
  // Окно держит описание закрытым, пока файл прикрепляется: метка встанет там, где был курсор.
  const [attaching, setAttaching] = useState(false);

  const initialKeys = initial.map(refKey).join(',');
  const unchanged = draft.map(refKey).join(',') === initialKeys;
  const count = draft.length;
  const commitLabel =
    count === 0
      ? unchanged
        ? 'select files'
        : 'detach all'
      : unchanged
        ? 'done'
        : `attach ${count}`;

  // Rows of everything picked so far: the browser answers only rows it has loaded.
  const keyOf = (item: LibraryItem) => {
    const ref = refOf(item);
    return ref ? refKey(ref) : '';
  };
  const remember = (next: LibraryItem[]) =>
    setItems((prev) => {
      const keys = new Set(next.map(keyOf));
      return [...prev.filter((i) => !keys.has(keyOf(i))), ...next];
    });

  const onSelectionChange = (refs: LibraryRef[], picked: LibraryItem[]) => {
    remember(picked);
    if (!notePicker) {
      setDraft(refs);
      return;
    }
    const file = picked[0]?.file;
    if (!file) {
      setChosen(null);
      setDraft([]);
      return;
    }
    if (asTable) {
      setChosen(file);
      setDraft(refs);
      return;
    }
    props.onPick?.(file);
    onClose();
  };

  const commit = () => {
    if (notePicker) return;
    const { mediaIds, fileIds, media } = splitRefs(draft, items);
    props.onDone(fileIds);
    if (takesMedia) props.onDoneMedia?.(mediaIds, media);
    onClose();
  };

  const noteActions = notePicker ? (
    <>
      {chosen && asTable && isTableFileName(chosen.fileName ?? '') && (
        <Button
          type='button'
          size='default'
          variant='main'
          disabled={attaching}
          onClick={() => {
            setAttaching(true);
            void asTable(chosen).finally(() => {
              setAttaching(false);
              onClose();
            });
          }}
        >
          as table
        </Button>
      )}
      {chosen && (
        <Button
          type='button'
          size='default'
          variant='secondary'
          disabled={attaching}
          onClick={() => {
            props.onPick?.(chosen);
            onClose();
          }}
        >
          as link
        </Button>
      )}
    </>
  ) : undefined;

  return (
    <LibraryPicker
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={notePicker ? (insert === 'preview' ? 'insert preview' : 'insert file') : 'attachments'}
      accept='any'
      sources={notePicker ? ['file'] : takesMedia ? undefined : ['file']}
      multiple={!notePicker}
      selected={draft}
      onSelectionChange={onSelectionChange}
      onDone={notePicker ? undefined : commit}
      doneLabel={commitLabel}
      doneDisabled={count === 0 && unchanged}
      hint={notePicker ? undefined : `${count} selected`}
      footerActions={noteActions}
      busy={attaching}
    />
  );
}
