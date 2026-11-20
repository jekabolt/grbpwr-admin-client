import { useQueries } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { common_MediaFull, LibraryFile } from 'api/proto-http/admin';
import { filesService } from 'components/managers/files/api/filesService';
import { filesKeys } from 'components/managers/files/hooks/useFiles';
import { extensionOf } from 'components/managers/files/utils/format';
import {
  type LibraryItem,
  type LibraryRef,
  refKey,
  refOf,
} from 'components/managers/library/api/types';
import { LibraryPicker } from 'components/managers/library/picker/library-picker';
import { fileRef, mediaRef, splitRefs } from 'components/managers/library/picker/refs';
// ВЕС БЕРЁТСЯ У ОБЩЕГО ФОРМАТТЕРА, а не у раздела «файлы», хотя рядом с ним стоит
// `extensionOf` оттуда же. Расширение языка не имеет, а единицы имеют: у раздела «файлы»
// формат русский («500 кб»), и эта строка — собственная подпись ЭКРАНА ЗАДАЧ, английского
// целиком. Арифметика у обоих одна и та же, различаются только слова.
import { formatBytes } from 'utils/pattern';
import { Button, Media, Text } from 'ui';
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
 * Library files attached to a card.
 *
 * Sits directly under the media attachments and shares their heading, because the
 * split between "public media" and "private library file" is a storage fact, not a
 * distinction anyone should have to hold while filling in a task. What it does change
 * is where the file ends up: media goes to the public CDN, this does not.
 */
export function FileAttachments({
  value,
  onChange,
}: {
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  // A few files per card at most, so one query each is cheaper than a new RPC and
  // keeps every card's attachments individually cached.
  const resolved = useQueries({
    queries: value.map((id) => ({
      queryKey: filesKeys.file(id),
      queryFn: () => filesService.getFile(id),
      staleTime: 30 * 60 * 1000,
    })),
  });
  const files = resolved.map((q) => q.data?.file).filter((f): f is LibraryFile => !!f);

  const remove = (id: number) => onChange(value.filter((x) => x !== id));

  return (
    <div className='flex flex-col gap-1'>
      <div className='flex items-center justify-between'>
        <Text size='micro' variant='label' className='uppercase'>
          library files{value.length ? ` · ${value.length}` : ''}
        </Text>
        {/* ЯВНЫЙ `type`. Этот блок живёт ВНУТРИ `<form>` правки задачи, а у кнопки без типа
            браузер подразумевает `submit`: клик открывал пикер И отправлял форму — модалка
            правки закрывалась вместе с пикером, и в ответ прилетало «task saved». */}
        <Button
          type='button'
          size='xs'
          variant='secondary'
          className='min-h-11 sm:min-h-0'
          onClick={() => setPickerOpen(true)}
        >
          attach
        </Button>
      </div>

      {files.length === 0 ? (
        <Text size='micro' variant='label'>
          nothing attached
        </Text>
      ) : (
        <div className='flex flex-col'>
          {files.map((f) => (
            <div
              key={f.id}
              className='flex flex-wrap items-center gap-2 border-b border-hairline py-1 last:border-b-0'
            >
              <div className='flex h-8 w-8 flex-none items-center justify-center bg-pageBg'>
                {f.previewUrl ? (
                  <Media src={f.previewUrl} alt='' aspectRatio='auto' fit='contain' />
                ) : (
                  <Text size='nano' variant='label' className='uppercase'>
                    {extensionOf(f.fileName ?? '')}
                  </Text>
                )}
              </div>
              <Text size='micro' className='min-w-0 flex-1 truncate'>
                {f.fileName}
              </Text>
              <Text size='micro' variant='label'>
                {formatBytes(Number(f.sizeBytes ?? 0))}
              </Text>
              <div className='flex w-full items-center justify-end gap-2 sm:w-auto'>
                {(f.url || f.downloadUrl) && (
                  <Button asChild size='xs' variant='secondary' className='min-h-11 sm:min-h-0'>
                    <a href={f.url || f.downloadUrl} target='_blank' rel='noopener noreferrer'>
                      open
                    </a>
                  </Button>
                )}
                <Button
                  type='button'
                  size='xs'
                  variant='secondary'
                  className='min-h-11 sm:min-h-0'
                  onClick={() => remove(Number(f.id))}
                >
                  remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pickerOpen && (
        <FilePicker selected={value} onDone={onChange} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}

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
