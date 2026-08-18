import { useQueries } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { LibraryFile } from 'api/proto-http/admin';
import { filesService } from 'components/managers/files/api/filesService';
import {
  filesKeys,
  useFileTopics,
  useLibraryFiles,
} from 'components/managers/files/hooks/useFiles';
import { extensionOf } from 'components/managers/files/utils/format';
// ВЕС БЕРЁТСЯ У ОБЩЕГО ФОРМАТТЕРА, а не у раздела «файлы», хотя рядом с ним стоит
// `extensionOf` оттуда же. Расширение языка не имеет, а единицы имеют: у раздела «файлы»
// формат русский («500 кб»), и эта строка — собственная подпись ЭКРАНА ЗАДАЧ, английского
// целиком. Арифметика у обоих одна и та же, различаются только слова.
import { formatBytes } from 'utils/pattern';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';

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
        <Button type='button' size='xs' variant='secondary' onClick={() => setPickerOpen(true)}>
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
            <div key={f.id} className='flex items-center gap-2 border-b border-hairline py-1'>
              <div className='flex h-8 w-8 flex-none items-center justify-center bg-bgSecondary'>
                {f.previewUrl ? (
                  <img src={f.previewUrl} alt='' className='h-full w-full object-contain' />
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
              {(f.url || f.downloadUrl) && (
                <Button asChild size='xs' variant='secondary'>
                  <a href={f.url || f.downloadUrl} target='_blank' rel='noopener noreferrer'>
                    open
                  </a>
                </Button>
              )}
              <Button type='button' size='xs' variant='secondary' onClick={() => remove(Number(f.id))}>
                remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {pickerOpen && (
        <FilePicker
          selected={value}
          onClose={() => setPickerOpen(false)}
          onPick={(id) => onChange(value.includes(id) ? value : [...value, id])}
        />
      )}
    </div>
  );
}

/** Browse the library from inside a task. Same grid, same rail semantics, smaller. */
function FilePicker({
  selected,
  onPick,
  onClose,
}: {
  selected: number[];
  onPick: (id: number) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [topicId, setTopicId] = useState(0);
  const topicsQuery = useFileTopics();
  const filesQuery = useLibraryFiles({
    topicIds: topicId ? [topicId] : [],
    untopiced: false,
    search,
    sort: 'new',
  });

  const files = useMemo(
    () => (filesQuery.data?.pages ?? []).flatMap((p) => p.files ?? []),
    [filesQuery.data],
  );
  const topics = topicsQuery.data?.topics ?? [];

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
      <div className='flex flex-col gap-2.5'>
        <Input
          name='pickerSearch'
          value={search}
          placeholder='file name or topic'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />
        <ChipRow>
          <Chip selected={topicId === 0} onClick={() => setTopicId(0)}>
            all
          </Chip>
          {topics.map((t) => (
            <Chip
              key={t.id}
              selected={topicId === Number(t.id)}
              onClick={() => setTopicId(Number(t.id))}
            >
              {t.name}
            </Chip>
          ))}
        </ChipRow>

        {filesQuery.isLoading ? (
          <Text size='micro' variant='label'>
            loading…
          </Text>
        ) : files.length === 0 ? (
          <Text size='micro' variant='label'>
            {search ? 'nothing found' : 'the library has no files yet'}
          </Text>
        ) : (
          <div className='max-h-[50vh] overflow-y-auto'>
            <Tiles min={120}>
              {files.map((f) => (
                <Tile
                  key={f.id}
                  title={f.fileName ?? ''}
                  name={f.fileName ?? ''}
                  sub={formatBytes(Number(f.sizeBytes ?? 0))}
                  selected={selected.includes(Number(f.id))}
                  onClick={() => onPick(Number(f.id))}
                  media={
                    f.previewUrl ? (
                      <img
                        src={f.previewUrl}
                        alt=''
                        loading='lazy'
                        className='aspect-square w-full bg-bgSecondary object-contain'
                      />
                    ) : (
                      <div className='flex aspect-square w-full items-center justify-center bg-bgSecondary'>
                        <Text size='micro' variant='label' className='uppercase'>
                          {extensionOf(f.fileName ?? '')}
                        </Text>
                      </div>
                    )
                  }
                />
              ))}
            </Tiles>
          </div>
        )}

        {filesQuery.hasNextPage && (
          <Button
            type='button'
            size='sm'
            variant='secondary'
            disabled={filesQuery.isFetchingNextPage}
            onClick={() => filesQuery.fetchNextPage()}
          >
            show more
          </Button>
        )}

        <Button type='button' size='sm' onClick={onClose}>
          done
        </Button>
      </div>
    </ConfirmationModal>
  );
}
