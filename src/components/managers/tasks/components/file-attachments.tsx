import { useQueries, useQuery } from '@tanstack/react-query';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useState } from 'react';
import type { LibraryFile } from 'api/proto-http/admin';
import { filesService } from 'components/managers/files/api/filesService';
import { notesService } from 'components/managers/files/api/notesService';
import { filesKeys, useLibraryFiles } from 'components/managers/files/hooks/useFiles';
import { canShowInText } from 'components/managers/files/note/file-refs';
import { extensionOf, formatWhenShort, kindWord } from 'components/managers/files/utils/format';
import { isMarkdownNote } from 'components/managers/files/utils/reader-find';
// ВЕС БЕРЁТСЯ У ОБЩЕГО ФОРМАТТЕРА, а не у раздела «файлы», хотя рядом с ним стоит
// `extensionOf` оттуда же. Расширение языка не имеет, а единицы имеют: у раздела «файлы»
// формат русский («500 кб»), и эта строка — собственная подпись ЭКРАНА ЗАДАЧ, английского
// целиком. Арифметика у обоих одна и та же, различаются только слова.
import { formatBytes } from 'utils/pattern';
import {
  Button,
  Close,
  ConfirmationModal,
  InfoCircledIcon,
  Input,
  Media,
  Text,
  Tile,
  Tiles,
} from 'ui';
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { isTableFileName } from '../utils/sheet-token';
import { PickerSheet, TaskPageShell } from './task-form-shell';

/** How a file chosen from the note format bar is inserted into its markdown. */
export type NoteFileInsert = 'link' | 'preview';

type AttachmentPickerProps = {
  selected: number[];
  onDone: (ids: number[]) => void;
  onClose: () => void;
  insert?: never;
  onPick?: never;
  onPickTable?: never;
};

type NotePickerProps = {
  insert?: NoteFileInsert;
  onPick: (file: LibraryFile) => void;
  /** Есть — щелчок только выбирает файл, а ряд внизу предлагает `as table` и `as link`. */
  onPickTable?: (file: LibraryFile) => void;
  onClose: () => void;
  selected?: never;
  onDone?: never;
};

type FilePickerProps = AttachmentPickerProps | NotePickerProps;

function isPdf(file: LibraryFile): boolean {
  const contentType = (file.contentType ?? '').toLowerCase().split(';')[0].trim();
  return contentType === 'application/pdf' || (file.fileName ?? '').toLowerCase().endsWith('.pdf');
}

function FilePreviewDoor({
  active,
  onClick,
  className,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type='button'
      variant='default'
      aria-label='preview'
      aria-pressed={active}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex size-6 items-center justify-center border bg-bgColor p-0 max-md:size-11',
        active
          ? 'border-textColor text-textColor'
          : 'border-borderColor text-labelColor hover:text-textColor',
        className,
      )}
    >
      <InfoCircledIcon aria-hidden />
    </Button>
  );
}

function FilePreview({
  file,
  selected,
  actionLabel,
  onSelect,
}: {
  file: LibraryFile;
  selected: boolean;
  actionLabel: string;
  onSelect: () => void;
}) {
  const id = Number(file.id);
  const name = file.fileName ?? '';
  const markdown = isMarkdownNote(name, file.contentType);
  const noteQuery = useQuery({
    queryKey: [...filesKeys.all, 'note-content', id],
    queryFn: () => notesService.getContent(id),
    enabled: markdown && id > 0,
    staleTime: 5 * 60 * 1000,
  });
  const noteText = noteQuery.data?.content ?? file.contentExcerpt ?? '';
  const image = (file.contentType ?? '').toLowerCase().startsWith('image/');
  const pdf = isPdf(file);
  const previewUrl = image ? file.url || file.previewUrl : file.previewUrl;
  const meta = [
    kindWord(file.contentType ?? undefined, name),
    formatBytes(Number(file.sizeBytes ?? 0)),
    formatWhenShort(file.createdAt),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className='flex flex-col gap-2.5'>
      <div className='border border-borderColor bg-pageBg'>
        {markdown ? (
          noteText ? (
            <pre className='m-0 max-h-56 overflow-hidden whitespace-pre-wrap bg-bgColor p-2.5 font-family-mono text-micro leading-relaxed'>
              {noteText.split('\n').slice(0, 9).join('\n')}
            </pre>
          ) : (
            <div className='flex h-28 items-center justify-center'>
              <Text size='micro' variant='label' className='uppercase'>
                {noteQuery.isPending ? 'loading…' : 'md · no preview'}
              </Text>
            </div>
          )
        ) : previewUrl ? (
          <div className={cn('mx-auto', pdf ? 'w-3/5 py-2.5' : 'w-full')}>
            <Media src={previewUrl} alt='' aspectRatio={pdf ? '3/4' : '4/3'} fit='contain' />
          </div>
        ) : (
          <div className='flex h-28 items-center justify-center'>
            <Text size='micro' variant='label' className='uppercase'>
              {extensionOf(name)} · no preview
            </Text>
          </div>
        )}
      </div>
      <Text size='micro' className='break-all font-bold'>
        {name}
      </Text>
      <Text size='nano' variant='label' className='uppercase'>
        {meta}
      </Text>
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          size='xs'
          variant={selected ? 'main' : 'secondary'}
          className='min-h-11 md:min-h-0'
          onClick={onSelect}
        >
          {selected ? 'selected' : actionLabel}
        </Button>
        {(file.url || file.downloadUrl) && (
          <Button asChild size='xs' variant='secondary' className='min-h-11 md:min-h-0'>
            <a href={file.url || file.downloadUrl} target='_blank' rel='noopener noreferrer'>
              open
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

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
 * Browse the library from inside a task.
 *
 * Выбор сначала живёт ЗДЕСЬ черновиком: закрытие, Escape и ← не должны менять уже сохранённый
 * набор формы. Наружу он уходит целиком только через нижнюю кнопку.
 */
export function FilePicker(props: FilePickerProps) {
  const notePicker = 'onPick' in props;
  const selected = notePicker ? [] : props.selected;
  const insert = notePicker ? props.insert ?? 'link' : undefined;
  const { onClose } = props;
  const phone = useMediaQuery(PHONE_QUERY);
  const [draft, setDraft] = useState<number[]>(() => [...selected]);
  // Вставка в описание: щелчок выбирает файл, а чем он станет, решает ряд внизу окна.
  const [chosen, setChosen] = useState<LibraryFile | null>(null);
  const asTable = notePicker ? props.onPickTable : undefined;
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  // Строка запроса отстаёт от поля: иначе каждое нажатие создаёт отдельный ключ и отдельный
  // серверный запрос. Сбросы ниже чистят обе строки сразу, потому что это один явный жест.
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const filter = {
    topicIds: [],
    untopiced: false,
    search: query,
    sort: 'new' as const,
  };
  const filesQuery = useLibraryFiles(filter);

  const files = useMemo(
    () => (filesQuery.data?.pages ?? []).flatMap((p) => p.files ?? []),
    [filesQuery.data],
  );
  const previewFile = files.find((file) => Number(file.id) === previewId);
  const total = Number(filesQuery.data?.pages?.[0]?.total ?? 0);
  const noFiles = !filesQuery.isLoading && !filesQuery.isError && files.length === 0;
  const libraryEmpty = !query && noFiles;
  const unchanged =
    selected.length === draft.length && selected.every((id, index) => draft[index] === id);
  const showSelection = !unchanged || draft.length > 0;
  const commitLabel =
    draft.length === 0
      ? unchanged
        ? 'select files'
        : 'detach all'
      : unchanged
        ? 'done'
        : `attach ${draft.length} ${draft.length === 1 ? 'file' : 'files'}`;

  const toggle = (id: number) =>
    setDraft((current) =>
      current.includes(id) ? current.filter((fileId) => fileId !== id) : [...current, id],
    );
  const choose = (file: LibraryFile) => {
    if (asTable) {
      setChosen(file);
      return;
    }
    if (props.onPick) {
      props.onPick(file);
      onClose();
      return;
    }
    toggle(Number(file.id));
  };
  const togglePreview = (id: number) => setPreviewId((current) => (current === id ? null : id));
  const reset = () => {
    setSearch('');
    setQuery('');
  };
  const commit = () => {
    if (notePicker) return;
    if (draft.length === 0 && unchanged) return;
    props.onDone(draft);
    onClose();
  };

  const selectionMarker = (id: number) => {
    const order = draft.indexOf(id) + 1;
    if (order === 0) return null;
    return (
      <Text
        size='nano'
        variant='selected'
        component='span'
        className='flex h-5 min-w-5 items-center justify-center px-1 tabular-nums'
      >
        {order}
      </Text>
    );
  };

  const footer = notePicker ? (
    <div className='flex flex-wrap justify-end gap-2'>
      {chosen && asTable && isTableFileName(chosen.fileName ?? '') && (
        <Button
          type='button'
          size='sm'
          variant='main'
          className='min-h-11 md:min-h-0'
          onClick={() => {
            void asTable(chosen);
            onClose();
          }}
        >
          as table
        </Button>
      )}
      {chosen && (
        <Button
          type='button'
          size='sm'
          variant='secondary'
          className='min-h-11 md:min-h-0'
          onClick={() => {
            props.onPick?.(chosen);
            onClose();
          }}
        >
          as link
        </Button>
      )}
      <Button
        type='button'
        size='sm'
        variant='secondary'
        className='min-h-11 md:min-h-0'
        onClick={onClose}
      >
        close
      </Button>
    </div>
  ) : (
    <div className='flex items-center gap-2'>
      <div className='flex min-w-0 flex-1 items-center gap-1'>
        {showSelection && (
          <>
            <Text size='micro' variant='label' component='span' className='whitespace-nowrap'>
              {draft.length} selected ·
            </Text>
            <Button
              type='button'
              size='xs'
              variant='underline'
              className='min-h-11 md:min-h-0'
              onClick={() => setDraft([])}
            >
              clear
            </Button>
          </>
        )}
      </div>
      <Button
        type='button'
        size='sm'
        variant='main'
        className='min-h-11 shrink-0 md:min-h-0'
        disabled={draft.length === 0 && unchanged}
        onClick={commit}
      >
        {commitLabel}
      </Button>
    </div>
  );

  const browserContent = (
    <div className='flex flex-col gap-2.5'>
      <Input
        name={notePicker ? 'noteFileSearch' : 'pickerSearch'}
        value={search}
        placeholder='search files'
        className='min-h-11 md:min-h-8'
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
      />

      <Text size='micro' variant='label'>
        {total} {total === 1 ? 'file' : 'files'}
        {query ? ` · "${query}"` : ''}
      </Text>

      {filesQuery.isLoading ? (
        <Text size='micro' variant='label'>
          loading…
        </Text>
      ) : filesQuery.isError ? (
        <div className='flex flex-wrap items-center gap-2'>
          <Text size='micro' variant='label'>
            files failed
          </Text>
          <Button
            type='button'
            size='xs'
            variant='secondary'
            className='min-h-11 md:min-h-0'
            onClick={() => filesQuery.refetch()}
          >
            retry
          </Button>
        </div>
      ) : noFiles ? (
        <div className='flex flex-col items-start gap-2 py-6'>
          <Text size='micro' variant='uppercase' tracking='group'>
            {libraryEmpty ? 'no files yet' : 'no files'}
          </Text>
          {query && (
            <Button
              type='button'
              size='sm'
              variant='secondary'
              className='min-h-11 md:min-h-0'
              onClick={reset}
            >
              reset
            </Button>
          )}
        </div>
      ) : (
        <div
          className={
            phone ? 'flex flex-col gap-4' : 'flex max-h-[50vh] flex-col gap-4 overflow-y-auto pr-1'
          }
        >
          <Tiles min={110}>
            {files.map((file) => {
              const id = Number(file.id);
              const name = file.fileName ?? '';
              const order = draft.indexOf(id) + 1;
              return (
                <div key={id} className='relative'>
                  <Tile
                    title={name}
                    name={name}
                    sub={
                      notePicker && insert === 'preview' && !canShowInText(file)
                        ? 'no preview'
                        : `${kindWord(
                            file.contentType ?? undefined,
                            name,
                          )} · ${formatBytes(Number(file.sizeBytes ?? 0))}`
                    }
                    selected={order > 0 || chosen?.id === file.id}
                    pressed={
                      notePicker ? (asTable ? chosen?.id === file.id : undefined) : order > 0
                    }
                    onClick={() => choose(file)}
                    media={
                      <div className='relative aspect-square w-full bg-pageBg'>
                        {file.previewUrl ? (
                          <Media src={file.previewUrl} alt='' aspectRatio='1/1' fit='contain' />
                        ) : (
                          <div className='flex h-full w-full flex-col items-center justify-center gap-0.5'>
                            <Text className='font-bold uppercase'>{extensionOf(name)}</Text>
                            <Text size='micro' variant='label' className='uppercase'>
                              {kindWord(file.contentType ?? undefined, name)}
                            </Text>
                          </div>
                        )}
                        {order > 0 && (
                          <span className='absolute top-1 right-1'>{selectionMarker(id)}</span>
                        )}
                      </div>
                    }
                  />
                  <FilePreviewDoor
                    active={previewId === id}
                    onClick={() => togglePreview(id)}
                    className='absolute top-1 left-1'
                  />
                </div>
              );
            })}
          </Tiles>

          {filesQuery.hasNextPage && (
            <Button
              type='button'
              size='sm'
              variant='secondary'
              className='min-h-11 md:min-h-0'
              disabled={filesQuery.isFetchingNextPage}
              onClick={() => filesQuery.fetchNextPage()}
            >
              show more
            </Button>
          )}
        </div>
      )}
    </div>
  );

  const preview = previewFile ? (
    <FilePreview
      file={previewFile}
      selected={!notePicker && draft.includes(Number(previewFile.id))}
      actionLabel={notePicker ? 'insert' : 'select'}
      onSelect={() => choose(previewFile)}
    />
  ) : null;
  const content =
    !phone && preview ? (
      <div className='grid grid-cols-[minmax(0,1fr)_18rem] gap-4'>
        <div className='min-w-0'>{browserContent}</div>
        <aside className='border-l border-hairline pl-3' aria-label='file preview'>
          <div className='mb-2 flex items-center border-b border-borderColor pb-1'>
            <Text size='micro' variant='uppercase' tracking='group' component='span'>
              preview
            </Text>
            <Close
              size='sm'
              aria-label='close preview'
              className='ml-auto'
              onClick={() => setPreviewId(null)}
            />
          </div>
          {preview}
        </aside>
      </div>
    ) : (
      browserContent
    );
  const phonePreview = phone ? (
    <PickerSheet
      phone
      open={!!preview}
      onOpenChange={(open) => !open && setPreviewId(null)}
      title='preview'
      trigger={<span className='hidden' />}
    >
      <div className='p-4'>{preview}</div>
    </PickerSheet>
  ) : null;

  if (phone && !notePicker) {
    return (
      <TaskPageShell open onRequestClose={onClose} title='attach files' footer={footer}>
        {content}
        {phonePreview}
      </TaskPageShell>
    );
  }

  return (
    <ConfirmationModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      onConfirm={onClose}
      title={
        notePicker ? (insert === 'preview' ? 'insert preview' : 'insert file') : 'attach a file'
      }
      width='lg'
      hideActions
    >
      <div className='flex flex-col'>
        {content}
        <div className='mt-2.5 border-t border-borderColor pt-2.5'>{footer}</div>
      </div>
      {phonePreview}
    </ConfirmationModal>
  );
}
