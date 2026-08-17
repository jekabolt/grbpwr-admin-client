import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useSnackBarStore } from 'lib/stores/store';
import { ROUTES, SECTION } from 'constants/routes';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import { FileCardModal } from './components/file-card-modal';
import { FilesToolbar } from './components/files-toolbar';
import { FileTile } from './components/file-tile';
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
import { UploadDialog } from './components/upload-dialog';
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
  const { showMessage } = useSnackBarStore();

  const mayRead = !resolved || canRead(SECTION.files);
  const mayWrite = canWrite(SECTION.files);
  // Тумблер добровольный, право — нет. Без files:write режим всегда «чтение», и оба положения
  // глушат ОДИН И ТОТ ЖЕ набор контролов: иначе «только чтение» означало бы разное в двух местах.
  const [mode, setMode] = useState<'write' | 'read'>('write');
  const writable = mayWrite && mode === 'write';

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

  const [uploadOpen, setUploadOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [dropped, setDropped] = useState<File[] | null>(null);

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

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropping(false);
    if (!writable) return;
    const list = Array.from(e.dataTransfer.files ?? []);
    if (!list.length) return;
    setDropped(list);
    setUploadOpen(true);
  };

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
          onUpload={() => setUploadOpen(true)}
        />
      );
    }
    return <EmptyLibraryState writable={writable} onUpload={() => setUploadOpen(true)} />;
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (writable) setDropping(true);
      }}
      onDragLeave={(e) => {
        // dragleave всплывает с КАЖДОЙ плитки, через которую проходит курсор. Без этой
        // проверки полоса приёмника мигает на каждом шаге мыши и дёргает сетку под ней.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDropping(false);
      }}
      onDrop={onDrop}
      className='flex flex-col gap-gutter'
    >
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
          onUpload={() => setUploadOpen(true)}
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
                ? 'режим чтения включён вами: загрузка, правка и удаление выключены, пока он стоит.'
                : 'смотреть и скачивать можно, менять нельзя: права files:write нет.'}
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

      {dropping && writable && (
        <div className='border border-dashed border-textColor bg-bgColor p-4'>
          <Text size='micro' className='uppercase'>
            отпустите, чтобы загрузить{topicIds.length ? ' — темы проставятся выбранные' : ''}
          </Text>
        </div>
      )}

      {filesQuery.isLoading ? (
        <GallerySkeleton />
      ) : filesQuery.isError && !files.length ? (
        <ListFailedState
          error={filesQuery.error instanceof Error ? filesQuery.error.message : undefined}
          onRetry={() => filesQuery.refetch()}
        />
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
              {/* Кнопка есть только там, где превью ОБЯЗАНО было получиться, и только у того,
                  кто может писать: на .zip она обещала бы невозможное. */}
              {writable &&
                !f.previewUrl &&
                previewExpected(f.contentType ?? undefined, f.fileName ?? '') && (
                  <RebuildPreview file={f} />
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
            {filesQuery.isFetchingNextPage ? 'загружаем…' : 'показать ещё'}
          </Button>
          <Text size='micro' variant='label'>
            показано {files.length}
            {total === undefined ? '' : ` из ${total}`}
          </Text>
        </div>
      )}

      {uploadOpen && (
        <UploadDialog
          topics={topics}
          presetTopicIds={topicIds}
          initialFiles={dropped ?? undefined}
          onClose={() => {
            setUploadOpen(false);
            setDropped(null);
          }}
          onDone={(summary) => {
            setUploadOpen(false);
            setDropped(null);
            showMessage(summary, 'success');
          }}
        />
      )}

      {/* Карточка — модальный роут ПОВЕРХ сетки: сетка остаётся смонтированной, поэтому
          закрытие возвращает ровно тот экран, с которого ушли. Закрытие идёт с текущим
          query, а не на голый /files: иначе оно стирало бы выбранные чипы и строку поиска. */}
      {id && (
        <FileCardModal
          id={Number(id)}
          topics={topics}
          writable={writable}
          onClose={closeCard}
        />
      )}
    </div>
  );
}
