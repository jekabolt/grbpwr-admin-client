import { useQueries } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { LibraryFile } from 'api/proto-http/admin';
import { filesService } from 'components/managers/files/api/filesService';
import {
  filesKeys,
  useFileTopics,
  useFilesTotal,
  useLibraryFiles,
  type FilesSort,
} from 'components/managers/files/hooks/useFiles';
import { extensionOf, formatWhenShort, kindWord } from 'components/managers/files/utils/format';
// ВЕС БЕРЁТСЯ У ОБЩЕГО ФОРМАТТЕРА, а не у раздела «файлы», хотя рядом с ним стоит
// `extensionOf` оттуда же. Расширение языка не имеет, а единицы имеют: у раздела «файлы»
// формат русский («500 кб»), и эта строка — собственная подпись ЭКРАНА ЗАДАЧ, английского
// целиком. Арифметика у обоих одна и та же, различаются только слова.
import { formatBytes } from 'utils/pattern';
import { Button, Chip, ChipRow, ConfirmationModal, Input, Media, Text, Tile, Tiles } from 'ui';
import { PHONE_QUERY, useMediaQuery } from '../hooks/useMediaQuery';
import { OptionRow, PickerSheet, TaskPageShell } from './task-form-shell';

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
export function FilePicker({
  selected,
  onDone,
  onClose,
}: {
  selected: number[];
  onDone: (ids: number[]) => void;
  onClose: () => void;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [draft, setDraft] = useState<number[]>(() => [...selected]);
  const [search, setSearch] = useState('');
  // Строка запроса отстаёт от поля: иначе каждое нажатие создаёт отдельный ключ и отдельный
  // серверный запрос. Сбросы ниже чистят обе строки сразу, потому что это один явный жест.
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const [topicId, setTopicId] = useState(0);
  const [sort, setSort] = useState<FilesSort>('new');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const topicsQuery = useFileTopics();
  const filter = {
    topicIds: topicId ? [topicId] : [],
    untopiced: false,
    search: query,
    sort,
  };
  const filesQuery = useLibraryFiles(filter);

  const files = useMemo(
    () => (filesQuery.data?.pages ?? []).flatMap((p) => p.files ?? []),
    [filesQuery.data],
  );
  const topics = topicsQuery.data?.topics ?? [];
  const activeTopic = topics.find((topic) => Number(topic.id) === topicId);
  const topicName = activeTopic?.name ?? 'topic';
  const total = Number(filesQuery.data?.pages?.[0]?.total ?? 0);
  const libraryEmpty = topicsQuery.isSuccess && Number(topicsQuery.data?.totalFiles ?? 0) === 0;
  const noFiles = !filesQuery.isLoading && !filesQuery.isError && files.length === 0;
  const allTopicsQuery = useFilesTotal(
    { ...filter, topicIds: [] },
    topicId > 0 && noFiles && !libraryEmpty,
  );
  const allTopicsTotal = Number(allTopicsQuery.data?.total ?? 0);

  const imageFiles = files.filter(
    (file) => !!file.previewUrl || (file.contentType ?? '').toLowerCase().startsWith('image/'),
  );
  const documentFiles = files.filter((file) => !imageFiles.includes(file));
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
  const reset = () => {
    setSearch('');
    setQuery('');
    setTopicId(0);
  };
  const commit = () => {
    if (draft.length === 0 && unchanged) return;
    onDone(draft);
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

  const footer = (
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

  const content = (
    <div className='flex flex-col gap-2.5'>
      <div className='flex items-stretch gap-2'>
        <Input
          name='pickerSearch'
          value={search}
          placeholder='search files'
          className='min-h-11 md:min-h-8'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />
        <PickerSheet
          phone={phone}
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          title='filters'
          trigger={
            <Button
              type='button'
              size='sm'
              variant={topicId ? 'main' : 'secondary'}
              aria-pressed={topicId > 0}
              className='min-h-11 shrink-0 md:min-h-8'
            >
              filters{topicId ? ' · 1' : ''}
            </Button>
          }
        >
          <Text
            size='micro'
            variant='label'
            tracking='label'
            className='bg-pageBg px-4 py-1 uppercase md:px-1'
          >
            topic
          </Text>
          <OptionRow selected={topicId === 0} onClick={() => setTopicId(0)}>
            all
          </OptionRow>
          {topics.map((topic) => {
            const id = Number(topic.id);
            return (
              <OptionRow key={id} selected={topicId === id} onClick={() => setTopicId(id)}>
                <span className='min-w-0 truncate'>{topic.name}</span>
              </OptionRow>
            );
          })}
          <Text
            size='micro'
            variant='label'
            tracking='label'
            className='bg-pageBg px-4 py-1 uppercase md:px-1'
          >
            sort
          </Text>
          <OptionRow selected={sort === 'new'} onClick={() => setSort('new')}>
            newest
          </OptionRow>
          <OptionRow selected={sort === 'name'} onClick={() => setSort('name')}>
            name
          </OptionRow>
        </PickerSheet>
      </div>

      {topicId > 0 && (
        <ChipRow>
          <Chip
            selected
            pressed
            onClick={() => setTopicId(0)}
            onRemove={() => setTopicId(0)}
            className='min-h-11 md:min-h-0'
          >
            {topicName}
          </Chip>
        </ChipRow>
      )}

      <Text size='micro' variant='label'>
        {total} files · {topicId ? topicName : 'all topics'}
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
          {!libraryEmpty && (
            <>
              <Text size='micro' variant='label'>
                {topicId ? topicName : 'all topics'}
                {query ? ` · "${query}"` : ''}
              </Text>
              <div className='flex flex-wrap gap-2'>
                {topicId > 0 && allTopicsTotal > 0 && (
                  <Button
                    type='button'
                    size='sm'
                    variant='secondary'
                    className='min-h-11 md:min-h-0'
                    onClick={() => setTopicId(0)}
                  >
                    all topics · {allTopicsTotal}
                  </Button>
                )}
                <Button
                  type='button'
                  size='sm'
                  variant='secondary'
                  className='min-h-11 md:min-h-0'
                  onClick={reset}
                >
                  reset
                </Button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div
          className={
            phone ? 'flex flex-col gap-4' : 'flex max-h-[50vh] flex-col gap-4 overflow-y-auto pr-1'
          }
        >
          {imageFiles.length > 0 && (
            <div className='flex flex-col gap-2'>
              <Text size='micro' variant='label' tracking='group' className='uppercase'>
                images · {imageFiles.length}
              </Text>
              <Tiles min={110}>
                {imageFiles.map((file) => {
                  const id = Number(file.id);
                  const name = file.fileName ?? '';
                  const imageUrl = file.previewUrl || file.url;
                  const order = draft.indexOf(id) + 1;
                  return (
                    <Tile
                      key={id}
                      title={name}
                      name={name}
                      sub={`${kindWord(file.contentType ?? undefined, name)} · ${formatBytes(
                        Number(file.sizeBytes ?? 0),
                      )}`}
                      selected={order > 0}
                      pressed={order > 0}
                      onClick={() => toggle(id)}
                      media={
                        <div className='relative aspect-square w-full bg-pageBg'>
                          {imageUrl ? (
                            <Media src={imageUrl} alt='' aspectRatio='1/1' fit='contain' />
                          ) : (
                            <div className='flex h-full w-full items-center justify-center'>
                              <Text size='micro' variant='label' className='uppercase'>
                                {extensionOf(name)}
                              </Text>
                            </div>
                          )}
                          {order > 0 && (
                            <span className='absolute top-1 right-1'>{selectionMarker(id)}</span>
                          )}
                        </div>
                      }
                    />
                  );
                })}
              </Tiles>
            </div>
          )}

          {documentFiles.length > 0 && (
            <div className='flex flex-col gap-2'>
              <Text size='micro' variant='label' tracking='group' className='uppercase'>
                documents · {documentFiles.length}
              </Text>
              <div className='flex flex-col'>
                {documentFiles.map((file) => {
                  const id = Number(file.id);
                  const name = file.fileName ?? '';
                  const topicNames = (file.topics ?? [])
                    .map((topic) => topic.name)
                    .filter((value): value is string => !!value)
                    .join(', ');
                  const meta = [
                    topicNames || 'no topic',
                    formatWhenShort(file.createdAt),
                    formatBytes(Number(file.sizeBytes ?? 0)),
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  const order = draft.indexOf(id) + 1;
                  return (
                    <Button
                      key={id}
                      type='button'
                      variant='default'
                      aria-pressed={order > 0}
                      className='flex min-h-12 w-full items-center gap-2 border-b border-hairline px-1 py-2 text-left last:border-b-0 md:min-h-0 md:py-1.5'
                      onClick={() => toggle(id)}
                    >
                      <span className='flex h-8 w-10 shrink-0 items-center justify-center border border-borderColor bg-pageBg'>
                        <Text size='nano' variant='label' component='span' className='uppercase'>
                          {extensionOf(name)}
                        </Text>
                      </span>
                      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                        <Text size='micro' component='span' className='truncate'>
                          {name}
                        </Text>
                        <Text size='nano' variant='label' component='span' className='truncate'>
                          {meta}
                        </Text>
                      </span>
                      <span className='flex w-5 shrink-0 justify-end'>{selectionMarker(id)}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

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

  if (phone) {
    return (
      <TaskPageShell open onRequestClose={onClose} title='attach files' footer={footer}>
        {content}
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
      title='attach a file'
      width='lg'
      hideActions
    >
      <div className='flex flex-col'>
        {content}
        <div className='mt-2.5 border-t border-borderColor pt-2.5'>{footer}</div>
      </div>
    </ConfirmationModal>
  );
}
