import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import { RatioGlyph } from 'ui/components/ratio-glyph';
import Text from 'ui/components/text';
import { calculateAspectRatio, isKnownAspectRatio } from '../utils/calculate-aspect';
import { formatBytes, formatMegapixels, type PreviewItem } from '../utils/usePendingFiles';
import { MediaCropper } from './cropper';

/**
 * ОЧЕРЕДЬ ЗАГРУЗКИ — ПОЛОСА ВНИЗУ ЭКРАНА, А НЕ МОДАЛКА.
 *
 * Была модалка «pending uploads»: без заголовка, открывалась сама на броске файла, после ручного
 * закрытия не открывалась уже никогда, а в ячейке показывала только кадр — ни имени, ни веса, ни
 * размеров, поэтому три снятых подряд скриншота в ней неразличимы. Нажатие «crop» подменяло тело
 * модалки кроппером, и остальные файлы пропадали с глаз.
 *
 * Загрузка — это не диалог, это менеджер передач: он идёт фоном, а библиотека под ним остаётся
 * живой, по ней можно листать и выбирать, пока пачка уходит. Отсюда полоса: свёрнутая — одна
 * строка состояния, развёрнутая — список файлов, и кадрирование раскрывается РЯДОМ со списком,
 * не вместо него.
 *
 * ПРОГРЕССА В ПРОЦЕНТАХ ЗДЕСЬ НЕТ И БЫТЬ НЕ МОЖЕТ. Файл уходит одним `fetch` с base64 в теле;
 * событий о ходе передачи у этого API нет. Полоса на 68% была бы выдумкой, поэтому состояние
 * строки — слово («не отправлен / в очереди / отправляется / готово / отказ»), а индикатор
 * неопределённый.
 */

/**
 * Занятый полосой низ экрана, объявленный всей странице. Пустая строка снимает объявление.
 * Живёт в модуле, а не в компоненте: состояния тут нет, а функция в теле компонента стала бы
 * недостающей зависимостью эффекта.
 */
function setInset(px: string) {
  document.body.style.paddingBottom = px;
  if (px) {
    document.body.style.setProperty('--dock-bottom-h', px);
    document.body.dataset.dockBottom = '';
  } else {
    document.body.style.removeProperty('--dock-bottom-h');
    delete document.body.dataset.dockBottom;
  }
}

interface PendingMediaPlateProps {
  previews: PreviewItem[];
  croppedUrls: Record<number, string>;
  uploadingIndices: Set<number>;
  onUploadAll: (index?: number | number[]) => void;
  onCrop: (index: number, croppedUrl: string) => void;
  onRemove: (index: number | number[]) => void;
}

function statusPill(item: PreviewItem) {
  switch (item.status) {
    case 'blocked':
      return <Pill tone='warn'>× too big</Pill>;
    case 'error':
      return <Pill tone='warn'>× failed</Pill>;
    case 'sending':
      // Пульсирует САМА ПЛАШКА, а не полоса под строкой. Полоса во всю ширину — даже честная,
      // без числа — читается как «сто процентов»; доли отправленного этот API не сообщает.
      return (
        <Pill tone='attention' className='motion-safe:animate-pulse'>
          ↑ uploading
        </Pill>
      );
    case 'queued':
      // СЛОВО НАЗЫВАЕТ РАЗНИЦУ, А НЕ ЦВЕТ. «в очереди» и «ожидает» читались синонимами при
      // разных цветах плашки: одно значило «отмечен к отправке и ждёт своей очереди», другое —
      // «лежит, его никто не отправлял». Теперь это видно из самих слов.
      return <Pill tone='attention'>queued</Pill>;
    case 'done':
      return <Pill tone='ok'>✓ done</Pill>;
    default:
      return <Pill tone='mut'>not sent</Pill>;
  }
}

/** Строка «что это»: тип, вес, размеры, пиксели, форма кадра — всё, что после отправки исчезнет. */
function MetaLine({ item }: { item: PreviewItem }) {
  const ratio = calculateAspectRatio(item.width, item.height);
  return (
    <Text
      size='micro'
      variant='label'
      component='span'
      className='flex flex-wrap items-center gap-x-1 leading-tight'
    >
      <span>{item.type === 'video' ? 'video' : 'photo'}</span>
      <span aria-hidden>·</span>
      <span className='tabular-nums'>{formatBytes(item.size)}</span>
      {item.width && item.height && (
        <>
          <span aria-hidden>·</span>
          <span className='tabular-nums'>
            {item.width}×{item.height}
          </span>
          <span aria-hidden>·</span>
          <span className='tabular-nums'>{formatMegapixels(item.width, item.height)}</span>
          <span aria-hidden>·</span>
          <RatioGlyph width={item.width} height={item.height} size={9} />
          {isKnownAspectRatio(ratio) && <span className='tabular-nums'>{ratio}</span>}
        </>
      )}
      {item.croppedUrl && (
        <>
          <span aria-hidden>·</span>
          <span className='text-textColor'>cropped</span>
        </>
      )}
      {item.mediaId != null && (
        <>
          <span aria-hidden>·</span>
          <span className='tabular-nums text-textColor'>id {item.mediaId}</span>
        </>
      )}
    </Text>
  );
}

function QueueRow({
  item,
  index,
  thumbSrc,
  cropping,
  onSend,
  onCropOpen,
  onDrop,
}: {
  item: PreviewItem;
  index: number;
  /** Что показывать: кадрированный вариант, если его сделали, иначе исходник. */
  thumbSrc: string;
  cropping: boolean;
  onSend: (index: number) => void;
  onCropOpen: (id: string) => void;
  onDrop: (index: number) => void;
}) {
  // КАДРИРОВАНИЕ ОСТАЁТСЯ И НА «НЕ ПРОЛЕЗЕТ» — это единственный выход из тупика.
  //
  // Пределы бакета считаются по тому, что РЕАЛЬНО УЙДЁТ (`usePendingFiles.setCroppedUrl`), поэтому
  // кадр в 50 Мпикс после кропа законно пролезает, а раздувшийся PNG — худеет. Пока кроп прятали
  // на этом статусе, строке, которую он и должен был спасти, оставалось только удаление; и
  // зеркально — кроп, перебравший вес, отнимал у строки её собственную кнопку кропа.
  const canCrop =
    item.type === 'image' &&
    (item.status === 'wait' || item.status === 'error' || item.status === 'blocked');

  return (
    <div
      role='listitem'
      className='flex items-start gap-2.5 border-b border-hairline py-1.5 last:border-b-0'
    >
      {/* Что это за файл, словами, стоит в строке метаданных ниже — поэтому значка «видео» на
          самом кадре нет: он повторял бы уже сказанное на 44 пикселях. */}
      <div className='size-11 shrink-0 overflow-hidden border border-borderColor bg-bgColor'>
        <Media src={thumbSrc} alt={item.name} type={item.type} aspectRatio='auto' fit='cover' />
      </div>

      <div className='min-w-0 flex-1'>
        <Text
          component='p'
          className={cn('truncate leading-tight', item.status === 'done' && 'text-labelColor')}
          title={item.name}
        >
          {item.name}
        </Text>
        <MetaLine item={item} />

        {item.status === 'blocked' && !!item.blockers?.length && (
          <Text size='micro' component='p' className='mt-0.5 leading-tight text-error'>
            {item.blockers.join(' · ')} · the upload will skip it
          </Text>
        )}
        {item.status === 'error' && (
          <Text size='micro' component='p' className='mt-0.5 leading-tight text-error'>
            {item.error} · attempts: {item.attempts}
          </Text>
        )}
        {item.status === 'sending' && (
          // Пояснение — обычная вторичная подпись. Синим состояние уже сказано плашкой строкой
          // выше, а цвет носит состояние ровно один раз.
          <Text size='micro' variant='label' component='p' className='leading-tight'>
            the file goes in one request — this bucket reports no progress along the way
          </Text>
        )}
      </div>

      <div className='w-[108px] shrink-0 text-right'>{statusPill(item)}</div>

      <div className='flex shrink-0 items-center justify-end gap-1'>
        {item.status === 'wait' && (
          <Button size='xs' variant='secondary' onClick={() => onSend(index)}>
            send
          </Button>
        )}
        {item.status === 'error' && (
          <Button size='xs' variant='secondary' onClick={() => onSend(index)}>
            retry
          </Button>
        )}
        {canCrop && (
          // Открытый кроп — это выбранное состояние кнопки: заливка ink, текст выворотный. Через
          // className этого не сделать, цвет текста в варианте перебивает добавленный класс, и
          // подпись пропадает на чёрном.
          <Button
            size='xs'
            variant={cropping ? 'simple' : 'secondary'}
            className='border border-textColor'
            aria-pressed={cropping}
            onClick={() => onCropOpen(item.id)}
          >
            crop
          </Button>
        )}
        <Button
          size='xs'
          variant='secondary'
          aria-label={`remove ${item.name} from the queue`}
          title={
            item.status === 'sending'
              ? 'already uploading, no way to cancel'
              : 'remove from the queue'
          }
          disabled={item.status === 'sending'}
          onClick={() => onDrop(index)}
        >
          ×
        </Button>
      </div>
    </div>
  );
}

export function PendingMediaPlate({
  previews,
  croppedUrls,
  uploadingIndices,
  onUploadAll,
  onCrop,
  onRemove,
}: PendingMediaPlateProps) {
  const [open, setOpen] = useState(true);
  const [croppingId, setCroppingId] = useState<string | null>(null);
  const { showMessage } = useSnackBarStore();
  const dockRef = useRef<HTMLDivElement>(null);

  const cropIndex = croppingId ? previews.findIndex((item) => item.id === croppingId) : -1;
  const cropping = cropIndex >= 0 ? previews[cropIndex] : undefined;

  // Строку, которую кадрировали, могли убрать из очереди — панель кропа тогда показывает чужой кадр.
  useEffect(() => {
    if (croppingId && cropIndex < 0) setCroppingId(null);
  }, [croppingId, cropIndex]);

  // Полоса перекрывает низ страницы, а под ней живая сетка. Отдаём ей ровно свою высоту, чтобы
  // последний ряд плиток не оказался под полосой навсегда.
  //
  // Тем же числом полоса объявляет СВОЙ ЗАНЯТЫЙ НИЗ ЭКРАНА (`--dock-bottom-h` + `data-dock-bottom`
  // на `body`). Отступ страницы поднимает только то, что лежит в потоке; полоса группового выбора
  // прилипает к низу ВЬЮПОРТА (`sticky bottom-0`) и об отступе не знает — она уходила под док, и
  // её кнопки становились достижимы только в самом низу прокрутки. Правило в `global.css` поднимает
  // прилипшее ровно на эту высоту.
  useLayoutEffect(() => {
    const node = dockRef.current;
    // Очередь опустела — отступ надо снять здесь же: без этого страница осталась бы с дырой в
    // полполосы под сеткой, и убрать её было бы уже некому.
    if (!node) {
      setInset('');
      return;
    }
    const apply = () => setInset(`${node.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => {
      observer.disconnect();
      setInset('');
    };
  }, [open, cropping?.id, previews.length]);

  const tally = useMemo(() => {
    const count = (status: PreviewItem['status']) =>
      previews.filter((item) => item.status === status).length;
    const blocked = count('blocked');
    return {
      all: previews.length,
      wait: count('wait'),
      queued: count('queued'),
      sending: count('sending'),
      done: count('done'),
      error: count('error'),
      blocked,
      /** Сколько вообще может уехать: то, что не пролезет, из знаменателя выкинуто. */
      can: previews.length - blocked,
      bytes: previews.reduce((sum, item) => sum + item.size, 0),
    };
  }, [previews]);

  // «Что-то уже в пути» — единственный источник: индексы, которые очередь считает своими.
  const live = uploadingIndices.size > 0;
  const indicesWhere = (match: (item: PreviewItem) => boolean) =>
    previews.reduce<number[]>((acc, item, index) => {
      if (match(item)) acc.push(index);
      return acc;
    }, []);

  /** Одна фраза о состоянии пачки: полосу читают боковым зрением, и цвет там без слова ничего не значит. */
  const line = useMemo(() => {
    const parts: string[] = [];
    if (tally.done) parts.push(`${tally.done} of ${tally.can} done`);
    if (tally.sending) parts.push('uploading');
    if (tally.queued) parts.push(`${tally.queued} queued`);
    // Те же два слова, что и на плашках строк: «в очереди» — отмечены к отправке, «не отправлено»
    // — лежат нетронутыми. Полоса и строка не должны называть одно состояние по-разному.
    if (tally.wait) parts.push(`${tally.wait} not sent`);
    if (tally.error) parts.push(`${tally.error} failed`);
    if (tally.blocked) parts.push(`${tally.blocked} too big`);
    return parts.join(' · ');
  }, [tally]);

  const handleCopyNames = () => {
    const pairs = previews.filter((item) => item.status === 'done' && item.mediaId != null);
    if (!pairs.length) return;
    if (!navigator.clipboard) {
      showMessage('the clipboard is not available in this window', 'error');
      return;
    }
    navigator.clipboard.writeText(pairs.map((item) => `${item.name}\t${item.mediaId}`).join('\n'));
    showMessage(`copied ${pairs.length} name→id pairs`, 'success');
  };

  if (!previews.length) return null;

  const retry = () => onUploadAll(indicesWhere((item) => item.status === 'error'));
  const sendAll = () => onUploadAll(indicesWhere((item) => item.status === 'wait'));
  const clearDone = () => onRemove(indicesWhere((item) => item.status === 'done'));

  const list = (
    <div
      className={cn('overflow-y-auto', cropping ? 'max-h-[52vh]' : 'max-h-[42vh]')}
      role='list'
      aria-label='files in the queue'
    >
      {previews.map((item, index) => (
        <QueueRow
          key={item.id}
          item={item}
          index={index}
          thumbSrc={croppedUrls[index] || item.url}
          cropping={croppingId === item.id}
          onSend={(at) => onUploadAll([at])}
          onCropOpen={(id) => setCroppingId((prev) => (prev === id ? null : id))}
          onDrop={(at) => onRemove(at)}
        />
      ))}
    </div>
  );

  const footer = (
    <div className='mt-1.5 flex flex-wrap items-center gap-2 border-t border-borderColor pt-1.5'>
      <Text size='micro' variant='label' component='p'>
        batch <span className='tabular-nums'>{formatBytes(tally.bytes)}</span>, sent one by one ·
        the name will not survive the upload: only the id stays in the library
      </Text>
      {tally.done > 0 && (
        <Button size='xs' variant='secondary' onClick={handleCopyNames}>
          copy names and ids
        </Button>
      )}
      <div className='ml-auto flex flex-wrap items-center gap-2'>
        {tally.done > 0 && (
          <Button size='sm' variant='secondary' onClick={clearDone}>
            clear uploaded ({tally.done})
          </Button>
        )}
        {tally.error > 0 ? (
          <Button size='sm' variant='main' disabled={live} onClick={retry}>
            retry failed ({tally.error})
          </Button>
        ) : (
          <Button size='sm' variant='main' disabled={!tally.wait || live} onClick={sendAll}>
            send all ({tally.wait})
          </Button>
        )}
      </div>
    </div>
  );

  const dock = (
    <div
      ref={dockRef}
      role='region'
      aria-label='upload queue'
      // ПОЛОСА — МЕБЕЛЬ СТРАНИЦЫ, А НЕ ТОСТ, И ЛЕЖИТ НИЖЕ МОДАЛКИ.
      //
      // На `--z-toast` (70) она накрывала подвал любого диалога (`--z-modal`, 50): «кадрировать»
      // из просмотрщика открывает диалог, у которого под доком оказывались обе кнопки — и
      // «создать кадрированную копию», и «отмена»; то же с подтверждением групповой чистки.
      // Верхний слой ей был не нужен: очередь идёт фоном и ничего не требует, а диалог — требует.
      className='fixed inset-x-0 bottom-0 z-[var(--z-dock)] border-t-2 border-textColor bg-bgColor'
    >
      <div className='mx-auto w-full max-w-[1400px] px-2.5'>
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 py-1.5',
            open && 'border-b border-hairline',
          )}
        >
          <Text
            component='h2'
            size='control'
            variant='uppercase'
            tracking='group'
            className='font-bold'
          >
            upload queue
          </Text>
          <Text size='micro' variant='label' component='p'>
            {line}
          </Text>
          <div className='ml-auto flex flex-wrap items-center gap-2'>
            {!open && tally.error > 0 && (
              <Button size='sm' variant='main' disabled={live} onClick={retry}>
                retry failed ({tally.error})
              </Button>
            )}
            {!open && !tally.error && tally.wait > 0 && (
              <Button size='sm' variant='main' disabled={live} onClick={sendAll}>
                send all ({tally.wait})
              </Button>
            )}
            <Button
              size='sm'
              variant='secondary'
              aria-expanded={open}
              onClick={() => setOpen((prev) => !prev)}
            >
              {open ? '▾ collapse bar' : '▴ expand bar'}
            </Button>
          </div>
        </div>

        {open &&
          (cropping ? (
            // КАДРИРОВАНИЕ НЕ ПРЯЧЕТ ОСТАЛЬНЫЕ ФАЙЛЫ: кроп встаёт слева, список остаётся справа.
            <div className='grid grid-cols-1 gap-2.5 py-2 lg:grid-cols-[minmax(0,660px)_minmax(0,1fr)]'>
              {/* Кроппер — чужая деталь и растёт сам по себе, поэтому он в своей прокрутке: полоса
                  не съедает экран целиком, каким бы высоким он ни стал. Потолок держит его кнопки
                  «отмена / применить кадр» на виду — ниже 70vh они уезжают под срез. */}
              <div className='min-w-0 max-h-[70vh] overflow-y-auto lg:border-r lg:border-hairline lg:pr-2.5'>
                <div className='mb-2 flex items-center gap-2'>
                  <Text size='micro' variant='uppercase' tracking='label' className='font-bold'>
                    crop
                  </Text>
                  <Text size='micro' variant='label' component='p' className='min-w-0 truncate'>
                    {cropping.name}
                  </Text>
                  <Button
                    size='xs'
                    variant='secondary'
                    className='ml-auto'
                    aria-label='close cropping'
                    onClick={() => setCroppingId(null)}
                  >
                    ×
                  </Button>
                </div>
                <MediaCropper
                  key={cropping.id}
                  selectedFile={cropping.url}
                  outputFormat={cropping.mime}
                  hideHeader
                  saveLabel='apply crop'
                  saveCroppedImage={(url: string) => {
                    onCrop(cropIndex, url);
                    setCroppingId(null);
                  }}
                  onCancel={() => setCroppingId(null)}
                />
              </div>
              <div className='min-w-0'>
                {list}
                {footer}
              </div>
            </div>
          ) : (
            <div className='py-1'>
              {list}
              {footer}
            </div>
          ))}
      </div>
    </div>
  );

  // Полоса живёт над страницей, а не в шапке, где смонтирован компонент: она чрезвычайная мебель,
  // а не элемент тулбара.
  return createPortal(dock, document.body);
}
