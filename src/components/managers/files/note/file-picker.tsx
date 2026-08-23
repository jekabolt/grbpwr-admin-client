import { useEffect, useMemo, useState } from 'react';
import type { LibraryFile } from 'api/proto-http/admin';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { useFileTopics, useLibraryFiles } from '../hooks/useFiles';
import { extensionOf, formatBytes } from '../utils/format';
import { canShowInText } from './file-refs';

/**
 * Чем станет выбранный файл в тексте: ССЫЛКОЙ (картинке `!` ставится сам) или ПРЕВЬЮ чему
 * угодно — у pdf и чертежа есть отрисованная миниатюра, и это единственный способ вытащить её
 * в заметку. Решение принято ДО открытия окна, кнопкой в полосе форматирования: окно с галкой
 * «показать картинкой» означало бы, что о разнице узнают уже внутри.
 */
export type NoteFileInsert = 'link' | 'preview';

/**
 * Выбор файла библиотеки для вставки в текст заметки.
 *
 * ── ПОЧЕМУ ЭТО ВТОРОЙ ПИКЕР В РЕПОЗИТОРИИ ───────────────────────────────────────────────────
 *
 * Первый живёт внутри `tasks/components/file-attachments.tsx` — и не экспортируется: это
 * локальная функция того модуля. Взять её отсюда нельзя физически, а сделать её общей — правка
 * файла раздела задач, которая в эту задачу не входит. Разошлись бы они и по контракту:
 * вложение задачи отдаёт наружу только `id` (больше ему ничего не нужно) и набирает файлы
 * ПАЧКОЙ, с кнопкой «готово», а вставке в текст нужен сам файл — из имени собирается подпись
 * ссылки, из `content_type` и `url` решается, показывать его в тексте или дать ссылкой, — и
 * нужен ОДИН клик: выбрал, вставилось, окно закрылось.
 *
 * Поэтому здесь общее — то, где живёт логика: `useLibraryFiles`/`useFileTopics` (тот же кэш,
 * тот же порядок, те же темы) и примитивы `Tile`/`Chip`/`ConfirmationModal`. Своё — только
 * контракт выбора. Когда пикер вложений будут трогать в следующий раз, слить их надо в этот:
 * `onPick(file)` — надмножество `onPick(id)`.
 */
export function NoteFilePicker({
  insert = 'link',
  onPick,
  onClose,
}: {
  insert?: NoteFileInsert;
  onPick: (file: LibraryFile) => void;
  onClose: () => void;
}) {
  const preview = insert === 'preview';
  const [search, setSearch] = useState('');
  // Запрос уезжает НЕ на каждую букву: ключ react-query собран из строки поиска, и без задержки
  // «договор» — это семь запросов и семь копий выдачи в кэше.
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const [topicId, setTopicId] = useState(0);
  const topicsQuery = useFileTopics();
  const filesQuery = useLibraryFiles({
    topicIds: topicId ? [topicId] : [],
    untopiced: false,
    search: query,
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
      title={preview ? 'insert a file preview' : 'insert a file into the text'}
      width='lg'
      hideActions
    >
      <div className='flex flex-col gap-2.5'>
        {/* Правило вставки названо ДО клика: иначе разница между картинкой и ссылкой
            обнаруживалась бы уже в тексте, и выглядела бы как случайность. */}
        <Text size='micro' variant='label'>
          {preview
            ? 'the file will stand shown right inside the text — a picture as itself, a pdf or a drawing as its rendered thumbnail. a file marked “no preview” has nothing to show and will stand as a link.'
            : 'a picture will stand shown right inside the text, everything else — as a link to the file card.'}{' '}
          what goes into the note is the file NUMBER, not a signed address: a signature lives hours,
          a note — years.
        </Text>

        <Input
          name='noteFileSearch'
          value={search}
          placeholder='file name or topic'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />

        {topics.length > 0 && (
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
        )}

        {filesQuery.isLoading ? (
          <Text size='micro' variant='label'>
            loading…
          </Text>
        ) : filesQuery.isError ? (
          <div className='flex flex-wrap items-baseline gap-2'>
            <Text size='micro' variant='label' component='span'>
              the library didn't open
            </Text>
            {/* «retry» — одно слово на весь раздел: так подписаны обе кнопки повтора в
                галерее, в карточке файла и в панели помощника. */}
            <Button size='xs' variant='secondary' onClick={() => filesQuery.refetch()}>
              retry
            </Button>
          </div>
        ) : files.length === 0 ? (
          <Text size='micro' variant='label'>
            {query ? 'nothing was found' : 'there are no files in the library yet'}
          </Text>
        ) : (
          <div className='max-h-[50vh] overflow-y-auto'>
            <Tiles min={120}>
              {files.map((f) => (
                <Tile
                  key={f.id}
                  title={f.fileName ?? ''}
                  name={f.fileName ?? ''}
                  // «no preview» — это ответ сервера про ЭТОТ файл (нет ни просмотра, ни
                  // миниатюры), и судит он тем же правилом, каким потом решает разметчик. В
                  // режиме ссылки метка не нужна: там показывать в тексте ничего и не обещали.
                  //
                  // МЕТКА ВМЕСТО РАЗМЕРА, А НЕ РЯДОМ С НИМ: строчка под именем — одна и с
                  // `truncate`, и «999 b · no preview» на плитке в 120 px обрезалось бы ровно
                  // по метке, то есть предупреждение пропадало бы молча. Размер у файла без
                  // превью здесь ничего не решает, а метка решает всё.
                  sub={
                    preview && !canShowInText(f)
                      ? 'no preview'
                      : formatBytes(Number(f.sizeBytes ?? 0))
                  }
                  onClick={() => {
                    onPick(f);
                    onClose();
                  }}
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
            size='sm'
            variant='secondary'
            disabled={filesQuery.isFetchingNextPage}
            onClick={() => filesQuery.fetchNextPage()}
          >
            show more
          </Button>
        )}

        {/* «close», а не «done»: выбор здесь одиночный и закрывает окно сам, поэтому кнопка
            внизу означает уход без вставки. */}
        <Button size='sm' variant='secondary' onClick={onClose}>
          close
        </Button>
      </div>
    </ConfirmationModal>
  );
}
