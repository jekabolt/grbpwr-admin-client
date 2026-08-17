import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useSnackBarStore } from 'lib/stores/store';
import { SECTION } from 'constants/routes';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import { FilePanel } from './components/file-panel';
import { FilesToolbar } from './components/files-toolbar';
import { FileTile } from './components/file-tile';
import { TopicChips, type TopicSelection } from './components/topic-chips';
import { UploadDialog } from './components/upload-dialog';
import { filesKeys, useFileTopics, useLibraryFiles, type FilesSort } from './hooks/useFiles';
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
  const topicIds = useMemo(
    () =>
      params
        .getAll('topic')
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0),
    [params],
  );
  const untopiced = params.get('untopiced') === '1';
  const urlSearch = params.get('q') ?? '';
  const sort = ((): FilesSort => {
    const v = params.get('sort');
    return v === 'name' || v === 'size' ? v : 'new';
  })();

  // Строка ввода отзывается сразу, а URL догоняет: писать в адрес на каждую букву значит
  // гонять запрос на каждую букву.
  const [searchInput, setSearchInput] = useState(urlSearch);
  useEffect(() => {
    setSearchInput(urlSearch);
    // Синхронизация только при внешней смене адреса (переход по ссылке, «очистить поиск»).
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
    const t = setTimeout(() => patch({ q: searchInput }), 300);
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
  // элемент перерисовывается на месте. Повторно за окно — молчим: у по-настоящему битого
  // превью onError сработает у каждой плитки, и без задвижки это был бы вечный цикл запросов.
  const relinkAt = useRef(0);
  const onPreviewError = useCallback(() => {
    const now = Date.now();
    if (now - relinkAt.current < 30_000) return;
    relinkAt.current = now;
    qc.invalidateQueries({ queryKey: filesKeys.all });
  }, [qc]);

  const onTopics = (next: TopicSelection) =>
    patch({ topicIds: next.topicIds, untopiced: next.untopiced });

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropping(false);
    if (!writable) return;
    const list = Array.from(e.dataTransfer.files ?? []);
    if (!list.length) return;
    setDropped(list);
    setUploadOpen(true);
  };

  const closeCard = () => navigate({ pathname: '/files', search: params.toString() });
  const openCard = (fileId: number) =>
    navigate({ pathname: `/files/${fileId}`, search: params.toString() });

  if (!mayRead) {
    return (
      <div className='border border-borderColor bg-bgColor p-block'>
        <Text className='uppercase'>доступа к файлам нет</Text>
        <Text size='micro' variant='label' className='mt-1 max-w-[70ch]'>
          пункт «файлы» видно в меню у всех, поэтому вы сюда и попали. открыть библиотеку можно с
          правом files:read, загружать — с files:write.
        </Text>
      </div>
    );
  }

  const activeTopic = topicIds.length === 1 ? topics.find((t) => Number(t.id) === topicIds[0]) : undefined;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (writable) setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
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
            onChange={onTopics}
          />
        </div>
        {!mayWrite && (
          <div className='border-t border-hairline px-2.5 py-2'>
            <Text size='micro' variant='label'>
              смотреть и скачивать можно, менять нельзя: права files:write нет. кнопки не спрятаны,
              а выключены — спрятанного не попросишь.
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
        <Text size='micro' variant='label'>
          загружаем…
        </Text>
      ) : files.length === 0 ? (
        <div className='border border-borderColor bg-bgColor p-block'>
          <Text size='micro' variant='label'>
            {urlSearch
              ? `ничего не нашлось по запросу «${urlSearch}»`
              : untopiced
                ? 'всё разобрано — файлов без темы нет'
                : topicIds.length
                  ? 'в этом наборе тем пока пусто'
                  : 'библиотека пуста'}
          </Text>
        </div>
      ) : (
        <Tiles min={190}>
          {files.map((f) => (
            <FileTile
              key={f.id}
              file={f}
              onOpen={() => openCard(Number(f.id))}
              onPreviewError={onPreviewError}
            />
          ))}
        </Tiles>
      )}

      {filesQuery.hasNextPage && (
        <div>
          <Button
            size='sm'
            variant='secondary'
            disabled={filesQuery.isFetchingNextPage}
            onClick={() => filesQuery.fetchNextPage()}
          >
            {filesQuery.isFetchingNextPage ? 'загружаем…' : 'показать ещё'}
          </Button>
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

      {id && <FilePanel id={Number(id)} topics={topics} onClose={closeCard} />}
    </div>
  );
}
