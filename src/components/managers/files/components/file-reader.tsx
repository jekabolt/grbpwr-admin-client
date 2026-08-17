import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { useLibraryFile } from '../hooks/useFiles';
import { usePdfDocument } from '../hooks/usePdfDocument';
import { extensionOf } from '../utils/format';
import {
  countsByPage,
  findAcrossPages,
  isReadablePdf,
  pageForSpread,
  pageOfHit,
  stepHit,
  stepPage,
  stepZoom,
  syncHitToPages,
  visiblePages,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../utils/reader-find';
import { ReaderPage, type PageHit } from './reader-page';
import { ReaderRail } from './reader-rail';

/** Одна и та же пустая ссылка на все страницы без совпадений: подсветка пересчитывается по
 * тождеству массива, и новый пустой массив на каждый рендер гонял бы её по кругу. */
const NO_HITS: PageHit[] = [];

/**
 * Читалка pdf.
 *
 * Только pdf — и это не заглушка: `.md` открывается экраном заметки, а не здесь, и читалка про
 * тот экран ничего не знает. Всё остальное честно упирается в «не читается в браузере».
 */
// Имя с суффиксом Modal не для красоты: `FileReader` — это глобальный класс браузера, которым
// в этом же клиенте читают загружаемые файлы. Компонент с таким именем перекрыл бы его в модуле.
export function FileReaderModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isLoading, refetch, isFetching } = useLibraryFile(id);
  const file = data?.file;
  const name = file?.fileName ?? '';
  const readable = isReadablePdf(name, file?.contentType ?? undefined);

  // Строка поиска живёт здесь, а не в сцене, ровно по одной причине: Escape.
  // Radix слушает его на документе в фазе перехвата и закрыл бы диалог раньше любого
  // обработчика внутри; единственная законная точка вмешательства — onEscapeKeyDown.
  const [findOpen, setFindOpen] = useState(false);
  // Повторный ⌘F при уже открытой строке обязан выделить запрос целиком — как в браузере.
  const [findFocus, setFindFocus] = useState(0);

  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='files-reader-overlay fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <Dialog.Content
          aria-label='читалка'
          className='files-reader-content fixed inset-0 z-[var(--z-modal)] flex flex-col gap-2.5 bg-pageBg p-2.5 focus:outline-none'
          onEscapeKeyDown={(e) => {
            if (!findOpen) return;
            e.preventDefault();
            setFindOpen(false);
          }}
          onKeyDown={(e) => {
            if (!readable) return;
            if (!(e.metaKey || e.ctrlKey)) return;
            // code, а не только key: на русской раскладке физическая F приходит как «а», и по
            // одному key ⌘F проваливался бы мимо — открывалась бы НАТИВНАЯ строка поиска
            // браузера, которая по нарисованному в canvas документу не находит ничего.
            if (e.code !== 'KeyF' && e.key.toLowerCase() !== 'f') return;
            e.preventDefault();
            setFindOpen(true);
            setFindFocus((n) => n + 1);
          }}
        >
          <Dialog.Title className='sr-only'>{name || 'читалка'}</Dialog.Title>
          <Dialog.Description className='sr-only'>
            просмотр документа с поиском по тексту
          </Dialog.Description>

          {isLoading || !file ? (
            <ReaderShell name={name || 'файл'}>
              <Text size='micro' variant='label'>
                загружаем…
              </Text>
            </ReaderShell>
          ) : readable ? (
            <PdfStage
              name={name}
              url={file.url ?? ''}
              downloadUrl={file.downloadUrl ?? ''}
              refreshing={isFetching}
              onRefreshLink={() => {
                refetch();
              }}
              findOpen={findOpen}
              onFindOpenChange={setFindOpen}
              findFocus={findFocus}
            />
          ) : (
            <NotReadable name={name} downloadUrl={file.downloadUrl ?? ''} />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Шапка с именем и «закрыть» плюс одна пустая сцена — для состояний без документа. */
function ReaderShell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <>
      <Toolbar sticky>
        <b className='max-w-[34ch] truncate'>{name}</b>
        <ToolbarSpacer />
        <Dialog.Close asChild>
          <Button size='xs' variant='secondary'>
            закрыть
          </Button>
        </Dialog.Close>
      </Toolbar>
      <div className='flex min-h-0 flex-1 items-center justify-center border border-borderColor bg-bgColor p-4'>
        {children}
      </div>
    </>
  );
}

/** Всё, что не pdf, включая `.md`: страницы нет, показывать нечего — но забрать файл можно. */
function NotReadable({ name, downloadUrl }: { name: string; downloadUrl: string }) {
  return (
    <ReaderShell name={name}>
      <div className='flex max-w-[52ch] flex-col items-center gap-2 text-center'>
        <Text size='micro' className='uppercase'>
          этот файл не читается в браузере
        </Text>
        <Text size='micro' variant='label'>
          {extensionOf(name)} — страницы у него нет, показывать нечего: открывается только в своей
          программе.
        </Text>
        {downloadUrl && (
          <Button asChild size='sm'>
            <a href={downloadUrl}>скачать</a>
          </Button>
        )}
      </div>
    </ReaderShell>
  );
}

function PdfStage({
  name,
  url,
  downloadUrl,
  refreshing,
  onRefreshLink,
  findOpen,
  onFindOpenChange,
  findFocus,
}: {
  name: string;
  url: string;
  downloadUrl: string;
  refreshing: boolean;
  onRefreshLink: () => void;
  findOpen: boolean;
  onFindOpenChange: (open: boolean) => void;
  findFocus: number;
}) {
  const { doc, status, numPages, sampleHasText, index, indexing, buildIndex } = usePdfDocument(url);
  // Страница и масштаб живут ЗДЕСЬ, а не внутри загрузчика документа: обновление просроченной
  // ссылки меняет `url`, документ перезагружается — а человек обязан вернуться туда, где читал.
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [spread, setSpread] = useState(false);
  const [query, setQuery] = useState('');
  const [hit, setHit] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (numPages && page > numPages) setPage(numPages);
  }, [numPages, page]);

  useEffect(() => {
    if (!findOpen) return;
    // Текст всего документа нужен только поиску — и строится ровно в тот момент, когда его
    // открыли: getTextContent по трёхсотстраничному каталогу стоит секунд.
    buildIndex();
  }, [findOpen, buildIndex]);

  // sampleHasText в зависимостях не для красоты: у каталога со сканированной обложкой проба по
  // первым страницам сначала говорит «текста нет», рисуется плашка — и поля ввода в этот момент
  // НЕТ. Когда индекс дочитывает документ и плашка сменяется полем, сфокусировать его больше
  // некому, и человек печатает в пустоту.
  useEffect(() => {
    if (!findOpen || !sampleHasText) return;
    // focus перед select: select() сам по себе не переносит фокус во всех браузерах.
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [findOpen, findFocus, sampleHasText]);

  const texts = useMemo(() => index?.map((p) => p.text) ?? null, [index]);
  // findOpen в зависимостях: закрытая строка поиска обязана убрать и подсветку. Иначе ✕ прячет
  // только панель, отметки остаются на странице, и снять их нечем — поля для очистки уже нет.
  const matches = useMemo(
    () => (findOpen && texts && query.trim() ? findAcrossPages(texts, query) : []),
    [findOpen, texts, query],
  );
  const counts = useMemo(() => countsByPage(matches), [matches]);
  const shown = useMemo(() => visiblePages(page, spread, numPages), [page, spread, numPages]);
  const sync = useMemo(() => syncHitToPages(matches, hit, shown), [matches, hit, shown]);

  const hitsByPage = useMemo(() => {
    const map = new Map<number, PageHit[]>();
    matches.forEach((m, i) => {
      const list = map.get(m.page) ?? [];
      list.push({ start: m.start, end: m.end, active: sync.onScreen && i + 1 === sync.hit });
      map.set(m.page, list);
    });
    return map;
  }, [matches, sync.hit, sync.onScreen]);

  const showPage = (target: number) => setPage(pageForSpread(target, page, spread, numPages));

  const goHit = (dir: 1 | -1) => {
    if (!matches.length) return;
    // Если текущее совпадение НЕ на экране, первое нажатие показывает именно его, а не
    // перескакивает через него. Иначе ↓ и подпись «1 из 5» говорят о разных совпадениях:
    // человек читает «первое», жмёт «дальше» и оказывается на втором, не увидев первого.
    const next = sync.onScreen ? stepHit(matches.length, sync.hit, dir) : sync.hit;
    setHit(next);
    // Страница идёт ЗА совпадением — это вторая половина синхронизации: syncHitToPages
    // подтягивает счётчик к странице, а здесь страница подтягивается к счётчику.
    showPage(pageOfHit(matches, next));
  };

  const counter = () => {
    if (!query.trim()) return '';
    if (indexing || !index) return 'читаем текст…';
    if (!matches.length) return 'нет совпадений';
    return `${sync.hit} из ${matches.length}`;
  };

  return (
    <>
      <Toolbar sticky>
        <b className='max-w-[34ch] truncate'>{name}</b>
        <Text size='micro' variant='label' className='tabular-nums'>
          стр. {page} из {numPages || '—'}
        </Text>
        <Button
          size='xs'
          variant='secondary'
          aria-label='предыдущая страница'
          disabled={page <= 1}
          onClick={() => setPage(stepPage(page, spread, numPages, -1))}
        >
          ‹
        </Button>
        <Button
          size='xs'
          variant='secondary'
          aria-label='следующая страница'
          disabled={page >= numPages}
          onClick={() => setPage(stepPage(page, spread, numPages, 1))}
        >
          ›
        </Button>
        <Button
          size='xs'
          variant='secondary'
          aria-label='уменьшить'
          disabled={zoom <= ZOOM_MIN}
          onClick={() => setZoom(stepZoom(zoom, -1))}
        >
          −
        </Button>
        <Text size='micro' variant='label' className='tabular-nums'>
          {zoom}%
        </Text>
        <Button
          size='xs'
          variant='secondary'
          aria-label='увеличить'
          disabled={zoom >= ZOOM_MAX}
          onClick={() => setZoom(stepZoom(zoom, 1))}
        >
          +
        </Button>
        <Button
          size='xs'
          variant='secondary'
          aria-pressed={spread}
          onClick={() => setSpread((v) => !v)}
        >
          {spread ? 'разворот' : 'одна страница'}
        </Button>
        <Button
          size='xs'
          variant='secondary'
          aria-pressed={findOpen}
          onClick={() => onFindOpenChange(true)}
        >
          ⌘f поиск
        </Button>
        <ToolbarSpacer />
        {downloadUrl && (
          <Button asChild size='xs' variant='secondary'>
            <a href={downloadUrl}>скачать</a>
          </Button>
        )}
        <Dialog.Close asChild>
          <Button size='xs' variant='secondary'>
            закрыть
          </Button>
        </Dialog.Close>
      </Toolbar>

      {findOpen &&
        (sampleHasText ? (
          <Toolbar>
            <Input
              ref={inputRef}
              name='readerQuery'
              value={query}
              placeholder='искать в документе'
              className='max-w-[220px]'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setQuery(e.target.value);
                setHit(1);
              }}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                goHit(e.shiftKey ? -1 : 1);
              }}
            />
            <Text size='micro' variant='label' className='tabular-nums'>
              {counter()}
            </Text>
            {/* Совпадение осталось на другой странице — счётчик обязан это сказать, иначе
                «3 из 5» указывает на подсветку, которой на экране нет. */}
            {!sync.onScreen && matches.length > 0 && (
              <Button size='xs' variant='secondary' onClick={() => showPage(sync.page)}>
                оно на стр. {sync.page} — показать
              </Button>
            )}
            <Button
              size='xs'
              variant='secondary'
              aria-label='предыдущее совпадение'
              disabled={!matches.length}
              onClick={() => goHit(-1)}
            >
              ↑
            </Button>
            <Button
              size='xs'
              variant='secondary'
              aria-label='следующее совпадение'
              disabled={!matches.length}
              onClick={() => goHit(1)}
            >
              ↓
            </Button>
            <Text size='nano' variant='label'>
              enter — следующее, shift+enter — предыдущее, esc — закрыть
            </Text>
            <ToolbarSpacer />
            <Button size='xs' variant='secondary' onClick={() => onFindOpenChange(false)}>
              ✕
            </Button>
          </Toolbar>
        ) : (
          <Toolbar className='border-error'>
            <Text size='micro' variant='error' className='uppercase'>
              искать нечего
            </Text>
            <Text size='micro' variant='label' className='max-w-[64ch]'>
              в этом pdf нет текстового слоя — страницы вставлены картинками или шрифты переведены
              в кривые. распознавание текста мы не делаем.
              {/* Приговор вынесен по первым страницам. Если дальше текст найдётся, плашка
                  сменится полем поиска — и человек должен понимать, почему она сменилась. */}
              {indexing ? ' проверяем остальные страницы…' : ''}
            </Text>
            <ToolbarSpacer />
            <Button size='xs' variant='secondary' onClick={() => onFindOpenChange(false)}>
              ✕
            </Button>
          </Toolbar>
        ))}

      {status === 'failed' ? (
        <div className='flex min-h-0 flex-1 items-center justify-center border border-borderColor bg-bgColor p-4'>
          <div className='flex max-w-[52ch] flex-col items-center gap-2 text-center'>
            <Text size='micro' className='uppercase'>
              ссылка истекла
            </Text>
            <Text size='micro' variant='label'>
              ссылка на файл живёт несколько часов, а эта вкладка открыта дольше. обновим её и
              вернёмся на ту же страницу.
            </Text>
            <Button size='sm' disabled={refreshing} onClick={onRefreshLink}>
              {refreshing ? 'обновляем…' : 'обновить'}
            </Button>
          </div>
        </div>
      ) : status === 'loading' || !doc ? (
        <div className='flex min-h-0 flex-1 items-center justify-center border border-borderColor bg-bgColor p-4'>
          <Text size='micro' variant='label'>
            открываем документ…
          </Text>
        </div>
      ) : (
        <div className='flex min-h-0 flex-1 gap-2.5'>
          <ReaderRail
            doc={doc}
            numPages={numPages}
            current={page}
            visible={shown}
            counts={counts}
            onPick={setPage}
          />
          <div className='min-h-0 flex-1 overflow-auto border border-borderColor bg-bgSecondary p-3.5'>
            {/* w-max + mx-auto, а не justify-center: центрирование флексом обрезает ЛЕВЫЙ край
                страницы, когда она шире окна, и на 200% до него уже не доскроллить. */}
            <div className='mx-auto flex w-max gap-3'>
              {shown.map((n) => (
                <ReaderPage
                  key={n}
                  doc={doc}
                  pageNumber={n}
                  zoom={zoom}
                  hits={hitsByPage.get(n) ?? NO_HITS}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
