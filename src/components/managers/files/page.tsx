import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { usePasteFiles } from 'components/managers/media/utils/usePasteFiles';
import { useFilesModeStore, useFilesWritable } from 'lib/stores/files-mode';
import { useUploadQueueStore } from 'lib/stores/upload-queue';
import { ROUTES, SECTION } from 'constants/routes';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import { FilesDropOverlay } from './components/drop-overlay';
import { FileCardModal } from './components/file-card-modal';
import { FilesToolbar } from './components/files-toolbar';
import { FileTile } from './components/file-tile';
import { NewNoteModal } from './components/new-note-modal';
import { PasteIntakeModal } from './components/paste-intake-modal';
import {
  EmptyLibraryState,
  EmptySearchState,
  EmptyTopicState,
  EmptyUntopicedState,
  GallerySkeleton,
  ListFailedState,
  NextPageFailure,
  NoAccessState,
  RebuildPreview,
} from './components/gallery-states';
import { FilesSelectionBar } from './components/selection-bar';
import { MAX_TOPIC_FILTERS, TopicChips, type TopicSelection } from './components/topic-chips';
import { FilesUploadBar } from './components/upload-bar';
import { useFileSelection } from './hooks/useFileSelection';
import {
  filesKeys,
  useFileTopics,
  useLibraryFiles,
  useSearchTotalEverywhere,
  type FilesSort,
} from './hooks/useFiles';
import { previewExpected } from './utils/format';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Библиотека файлов — холст.
 *
 * Макет узнают ГЛАЗАМИ, а не по имени: в жизни оно выглядит как «grbpwr_graphic (1).pdf».
 * Поэтому экран несут крупные превью, а поиск — запасной путь, что противоположно тому, как
 * обычно строят список документов. Рейла тем нет намеренно: одна тема за раз не выражает
 * «packaging и atelier сразу», а именно этим вопросом сотни файлов и сужают до десятка.
 */
export default function FilesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const { canRead, canWrite, resolved } = usePermissions();
  const enqueue = useUploadQueueStore((s) => s.enqueue);

  const mayRead = !resolved || canRead(SECTION.files);
  const mayWrite = canWrite(SECTION.files);
  // Тумблер добровольный, право — нет. Без files:write режим всегда «чтение», и оба положения
  // глушат ОДИН И ТОТ ЖЕ набор контролов: иначе «только чтение» означало бы разное в двух местах.
  //
  // ТУМБЛЕР ЖИВЁТ В СТОРЕ, А НЕ ЗДЕСЬ. Писатели раздела шире холста: полоса загрузки стоит и на
  // экране тем, темы правятся там же. Пока положение было состоянием этого компонента, уход на
  // соседний экран молча возвращал человека в запись — тумблер переставал действовать ровно
  // тогда, когда он единственный и защищал.
  const mode = useFilesModeStore((s) => s.mode);
  const setMode = useFilesModeStore((s) => s.setMode);
  const writable = useFilesWritable(mayWrite);

  // ФИЛЬТР ЖИВЁТ В URL. Ссылку на пересечение кидают в чат («вот всё, что и packaging, и
  // atelier»), и состояние, которого нет в адресе, такой ссылкой не передашь.
  const untopiced = params.get('untopiced') === '1';
  const topicIds = useMemo(
    () =>
      // При `untopiced` темы игнорируются — так же, как их игнорирует сервер (приоритет
      // untopiced > topic_ids). Иначе рукописный адрес рисовал бы горящие чипы, которых в
      // выдаче нет, и экран спорил бы сам с собой.
      untopiced
        ? []
        : params
            .getAll('topic')
            .map(Number)
            .filter((n) => Number.isFinite(n) && n > 0)
            .slice(0, MAX_TOPIC_FILTERS),
    [params, untopiced],
  );
  const urlSearch = params.get('q') ?? '';
  const sort = ((): FilesSort => {
    const v = params.get('sort');
    return v === 'name' || v === 'size' ? v : 'new';
  })();

  // Строка ввода отзывается сразу, а URL догоняет: писать в адрес на каждую букву значит
  // гонять запрос на каждую букву.
  const [searchInput, setSearchInput] = useState(urlSearch);
  // Что мы сами только что записали в адрес. Без этой отметки эффект синхронизации откатывал
  // бы поле к записанному значению, и символ, набранный между срабатыванием таймера и
  // коммитом навигации, пропадал бы.
  const pushedSearch = useRef(urlSearch);
  useEffect(() => {
    if (urlSearch === pushedSearch.current) return;
    // Отметку двигаем ВМЕСТЕ с полем. Без этой строки «вперёд» в браузере ломался: назад
    // приводило адрес к пустому поиску, поле пустело, а отметка оставалась на старом слове —
    // и «вперёд», вернув слово в адрес, не возвращало его в поле. Дальше срабатывал таймер
    // и переписывал адрес обратно на пустой: кнопка «вперёд» переставала работать вовсе.
    pushedSearch.current = urlSearch;
    setSearchInput(urlSearch);
    // Синхронизация только при ВНЕШНЕЙ смене адреса (переход по ссылке, «очистить поиск»).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch]);

  const patch = useCallback(
    (next: Partial<{ topicIds: number[]; untopiced: boolean; q: string; sort: FilesSort }>) => {
      const p = new URLSearchParams(params);
      if (next.topicIds !== undefined) {
        p.delete('topic');
        next.topicIds.forEach((t) => p.append('topic', String(t)));
      }
      if (next.untopiced !== undefined) {
        if (next.untopiced) p.set('untopiced', '1');
        else p.delete('untopiced');
      }
      if (next.q !== undefined) {
        if (next.q) p.set('q', next.q);
        else p.delete('q');
      }
      if (next.sort !== undefined) {
        if (next.sort === 'new') p.delete('sort');
        else p.set('sort', next.sort);
      }
      setParams(p, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    if (searchInput === urlSearch) return;
    const t = setTimeout(() => {
      pushedSearch.current = searchInput;
      patch({ q: searchInput });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, urlSearch, patch]);

  // ТРИ ВХОДА, ОДНО ПРАВИЛО ТЕМ. Кнопка «загрузить», бросок и ⌘V ставят в одну очередь и
  // наследуют ВСЕ выбранные чипы холста; при пустом выборе пачка уезжает в «разобрать».
  // Диалога загрузки больше нет: он держал очередь в своём состоянии и убивал отправку при
  // закрытии, а темы всё равно спрашивал ровно те, что уже выбраны на холсте.
  const pickerRef = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState<File[]>([]);
  const [newNote, setNewNote] = useState(false);

  const topicsQuery = useFileTopics();
  const filesQuery = useLibraryFiles({ topicIds, untopiced, search: urlSearch, sort });

  const topics = topicsQuery.data?.topics ?? [];
  const files = useMemo(
    () => (filesQuery.data?.pages ?? []).flatMap((p) => p.files ?? []),
    [filesQuery.data],
  );
  const total = filesQuery.data?.pages?.[0]?.total;
  const totalFiles = Number(topicsQuery.data?.totalFiles ?? 0);
  const untopicedCount = Number(topicsQuery.data?.untopicedCount ?? 0);

  // ПРОТУХШАЯ ССЫЛКА — НЕ ПОЛОМКА, а плата за приватный бакет: presigned живёт 6–12 часов, а
  // вкладку держат открытой дольше. Первый же сорвавшийся `<img>` перезапрашивает выдачу, и
  // элемент перерисовывается на месте.
  //
  // Задвижка — ПО САМОМУ АДРЕСУ, а не по времени. У по-настоящему битого объекта (а не
  // просроченной ссылки) onError возвращается и после перевыдачи, и таймер лишь замедлил бы
  // вечный цикл до раза в полминуты: каждая инвалидация перекачивает ВСЕ загруженные страницы
  // и меняет src у всех остальных плиток. Один адрес перепрашивается ровно один раз.
  const relinked = useRef<Set<string>>(new Set());
  const onPreviewError = useCallback(
    (url: string) => {
      if (!url || relinked.current.has(url)) return;
      relinked.current.add(url);
      qc.invalidateQueries({ queryKey: filesKeys.all });
    },
    [qc],
  );

  const onTopics = (next: TopicSelection) =>
    patch({ topicIds: next.topicIds, untopiced: next.untopiced });

  const selection = useFileSelection();
  // Смена фильтра снимает выбор. Набранное в одном пересечении на экране следующего не видно
  // целиком, а полоса продолжала бы обещать действие над файлами, которых на экране нет.
  const filterKey = `${topicIds.join(',')}|${untopiced}|${urlSearch}`;
  const seenFilter = useRef(filterKey);
  const clearSelection = selection.clear;
  useEffect(() => {
    if (seenFilter.current === filterKey) return;
    seenFilter.current = filterKey;
    clearSelection();
  }, [filterKey, clearSelection]);

  const selectedFresh = useMemo(
    () => selection.selected.map((s) => files.find((f) => Number(f.id) === Number(s.id)) ?? s),
    [selection.selected, files],
  );

  // ОДИН ВХОД В ОЧЕРЕДЬ на все три жеста. Темы читаются в момент постановки: сузил фильтр
  // после броска — на уже стоящие в очереди строки это не влияет, у них свои темы.
  const intake = useCallback(
    (list: File[]) => {
      if (!writable || !list.length) return;
      enqueue(list, { topicIds, newTopics: [] });
    },
    [writable, enqueue, topicIds],
  );

  const openPicker = () => pickerRef.current?.click();

  // ⌘V ловится слушателем на document со стопкой приёмников (прецедент — медиа). Пока
  // приёмная модалка открыта, повторный ⌘V ДОПИСЫВАЕТ в неё строку: вторая модалка поверх
  // первой потеряла бы уже набранное имя.
  // `accept: 'any'` — это БИБЛИОТЕКА ФАЙЛОВ, а не медиа: по умолчанию хук берёт из буфера
  // только картинки, и ⌘V по скопированному pdf или zip молчал, ничем не объясняя молчание.
  usePasteFiles({ claims: writable, accept: 'any' }, (list) => setPasted((p) => [...p, ...list]));

  // Закрытие ЗАМЕЩАЕТ запись в истории. Иначе стек выглядит как [сетка, карточка, сетка], и
  // «назад» открывает ровно ту карточку, которую человек только что закрыл.
  const closeCard = () =>
    navigate({ pathname: ROUTES.files, search: params.toString() }, { replace: true });
  const openCard = (fileId: number) =>
    navigate({ pathname: `${ROUTES.files}/${fileId}`, search: params.toString() });
  const showAll = () => patch({ topicIds: [], untopiced: false });

  // Второй счёт спрашивается только тогда, когда в узком фильтре не нашлось ничего: это
  // и есть число в кнопке «искать во всех темах (N)». Спрашивать его заранее — лишний
  // запрос на каждую букву в поиске.
  const narrowed = topicIds.length > 0 || untopiced;
  const everywhereQuery = useSearchTotalEverywhere(
    urlSearch,
    narrowed && !filesQuery.isLoading && files.length === 0,
  );

  if (!mayRead) return <NoAccessState />;

  const activeTopic =
    topicIds.length === 1 ? topics.find((t) => Number(t.id) === topicIds[0]) : undefined;
  const chosenTopics = topicIds
    .map((id) => topics.find((t) => Number(t.id) === id))
    .filter(Boolean) as typeof topics;

  const emptyState = () => {
    if (urlSearch) {
      return (
        <EmptySearchState
          search={urlSearch}
          narrowed={narrowed}
          everywhereTotal={
            everywhereQuery.data ? Number(everywhereQuery.data.total ?? 0) : undefined
          }
          onSearchEverywhere={() => patch({ topicIds: [], untopiced: false })}
          onClearSearch={() => {
            setSearchInput('');
            patch({ q: '' });
          }}
        />
      );
    }
    if (untopiced) return <EmptyUntopicedState onShowAll={showAll} />;
    if (topicIds.length) {
      return (
        <EmptyTopicState
          topics={chosenTopics}
          writable={writable}
          onShowAll={showAll}
          onUpload={openPicker}
        />
      );
    }
    return <EmptyLibraryState writable={writable} onUpload={openPicker} />;
  };

  return (
    <div className='flex flex-col gap-gutter'>
      {/* Диалога выбора файлов у раздела больше нет: кнопка открывает системный выбор, а очередь
          показывает полоса снизу. Поле скрытое — свой вид у него нестилизуемый. */}
      <input
        ref={pickerRef}
        type='file'
        multiple
        hidden
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const list = Array.from(e.target.files ?? []);
          // Сброс значения — иначе повторный выбор ТОГО ЖЕ файла не поднимет `change`.
          e.target.value = '';
          intake(list);
        }}
      />

      {/* Один блок: полоса управления и словарь тем — это ОДНА поверхность, разделённая внутри
          волосяной линией, а не два бордера подряд. */}
      <div className='border border-borderColor bg-bgColor'>
        <FilesToolbar
          search={searchInput}
          onSearch={setSearchInput}
          sort={sort}
          onSort={(v) => patch({ sort: v })}
          mode={mayWrite ? mode : 'read'}
          onMode={setMode}
          canWrite={mayWrite}
          onUpload={openPicker}
          onNewNote={() => setNewNote(true)}
          className='border-0'
        />
        <div className='border-t border-hairline px-2.5 py-2'>
          <TopicChips
            topics={topics}
            selected={topicIds}
            untopiced={untopiced}
            totalFiles={totalFiles}
            untopicedCount={untopicedCount}
            matched={total === undefined ? undefined : Number(total)}
            searching={!!urlSearch}
            onChange={onTopics}
          />
        </div>
        {/* ТОЛЬКО ЧТЕНИЕ ОБЪЯСНЯЕТСЯ СТРОКОЙ. Кнопки выключены, а не спрятаны: спрятанного не
            попросишь, а выключенную без объяснения жмут и считают поломкой. Оба положения —
            и вынужденное, и добровольное — глушат один и тот же набор контролов. */}
        {!writable && (
          <div className='border-t border-hairline px-2.5 py-2'>
            <Text size='micro' variant='label'>
              {mayWrite
                ? 'read mode is switched on by you: uploading, editing and deleting are off while it stands.'
                : "you can look and download but you can't change: there is no files:write right."}
            </Text>
          </div>
        )}
        {activeTopic?.description && (
          <div className='border-t border-hairline px-2.5 py-2'>
            <Text size='micro' variant='label' className='max-w-[80ch]'>
              {activeTopic.description}
            </Text>
          </div>
        )}
      </div>

      {filesQuery.isLoading ? (
        <GallerySkeleton />
      ) : filesQuery.isError && !files.length ? (
        <ListFailedState error={filesQuery.error} onRetry={() => filesQuery.refetch()} />
      ) : files.length === 0 ? (
        emptyState()
      ) : (
        <Tiles min={190}>
          {files.map((f) => (
            <FileTile
              key={f.id}
              file={f}
              selectable
              selected={selection.isSelected(Number(f.id))}
              onToggleSelect={() => selection.toggle(f)}
              onOpen={() => openCard(Number(f.id))}
              onPreviewError={onPreviewError}
            >
              {/* Кнопка есть только там, где превью ОБЯЗАНО было получиться: на .zip она
                  обещала бы невозможное. В режиме чтения она ВЫКЛЮЧЕНА, а не спрятана — то же
                  правило, что и у остальных писателей раздела. */}
              {!f.previewUrl && previewExpected(f.contentType ?? undefined, f.fileName ?? '') && (
                <RebuildPreview file={f} writable={writable} />
              )}
            </FileTile>
          ))}
        </Tiles>
      )}

      {/* ОБРЫВ ПРИ ЛИСТАНИИ — ПОЛОСА ПОД СПИСКОМ, а не вместо него: уже показанные страницы
          остаются на месте, позиция прокрутки не съезжает. */}
      {filesQuery.isFetchNextPageError && (
        <NextPageFailure
          loaded={files.length}
          total={total === undefined ? undefined : Number(total)}
          retrying={filesQuery.isFetchingNextPage}
          onRetry={() => filesQuery.fetchNextPage()}
        />
      )}

      {/* Набор отдаётся СВЕЖИМИ объектами из текущей выдачи, а не снимком на момент клика:
          у снимка через несколько часов мёртвая presigned-ссылка, а после переименования из
          карточки — устаревшее имя в списке того, что сейчас удалят. */}
      <FilesSelectionBar
        selected={selectedFresh}
        topics={topics}
        writable={writable}
        onClear={selection.clear}
        onDropped={selection.drop}
      />

      {filesQuery.hasNextPage && !filesQuery.isFetchNextPageError && (
        <div className='flex items-center gap-2.5'>
          <Button
            size='sm'
            variant='secondary'
            disabled={filesQuery.isFetchingNextPage}
            onClick={() => filesQuery.fetchNextPage()}
          >
            {filesQuery.isFetchingNextPage ? 'loading…' : 'show more'}
          </Button>
          <Text size='micro' variant='label'>
            shown {files.length}
            {total === undefined ? '' : ` of ${total}`}
          </Text>
        </div>
      )}

      {/* БРОСОК ПРИНИМАЕТ ВСЁ ОКНО — целиться некуда. Приёмник живёт и в режиме чтения: он
          гасит бросок, чтобы браузер не ушёл по ссылке на файл, унеся вкладку с фильтром и
          половиной очереди, и объясняет отказ словами.

          ПРИ ОТКРЫТОЙ МОДАЛКЕ ПРИЁМ ВЫКЛЮЧЕН, а бросок всё равно гасится. Полоса загрузки
          лежит НИЖЕ модалки (это её осознанное место — иначе она накрывала бы подвал
          карточки), поэтому принятая сквозь карточку пачка встала бы за модалкой: очередь
          идёт, отменить её нечем, и на экране этого не видно. */}
      <FilesDropOverlay
        enabled={writable && !id && !pasted.length}
        disabledNote={
          id || pasted.length
            ? 'close the window first: the queue stands under it, and the batch would not be visible'
            : mayWrite
              ? 'read mode is on — switch it in the bar above'
              : 'the files:write right is needed — ask a super admin for it'
        }
        topicLabels={chosenTopics.map((t) => t.name ?? '')}
        onFiles={intake}
      />

      {/* ВСТАВКА ИЗ БУФЕРА СПРАШИВАЕТ ИМЯ. У картинки из буфера его нет, и без этого шага
          библиотека набивается неотличимыми «image.png». */}
      {pasted.length > 0 && (
        <PasteIntakeModal
          files={pasted}
          topics={topics}
          presetTopicIds={topicIds}
          onCancel={() => setPasted([])}
          onSubmit={(list, batch) => {
            enqueue(list, batch);
            setPasted([]);
          }}
        />
      )}

      {/* Полоса загрузки — фиксирована снизу и переживает и уход на другой экран раздела, и
          открытие карточки: она только зритель стора, XHR живут не в ней. Режим чтения глушит
          и её пишущие кнопки — иначе «оба положения глушат один и тот же набор» было бы
          неправдой ровно там, где стоит единственная кнопка отправки. Полосе передаётся ПРАВО,
          а тумблер она читает из стора сама: экран, который забыл бы его подмешать, снова
          сделал бы режим чтения местным. */}
      <FilesUploadBar mayWrite={mayWrite} />

      {/* Карточка — модальный роут ПОВЕРХ сетки: сетка остаётся смонтированной, поэтому
          закрытие возвращает ровно тот экран, с которого ушли. Закрытие идёт с текущим
          query, а не на голый /files: иначе оно стирало бы выбранные чипы и строку поиска. */}
      {id && (
        <FileCardModal id={Number(id)} topics={topics} writable={writable} onClose={closeCard} />
      )}

      {/* Модалка живёт РЯДОМ с карточкой, а не внутри полосы: полоса — управление сеткой, и
          модалка, смонтированная в ней, исчезла бы вместе с полосой на экране тем. */}
      {newNote && <NewNoteModal topics={topics} onClose={() => setNewNote(false)} />}
    </div>
  );
}
