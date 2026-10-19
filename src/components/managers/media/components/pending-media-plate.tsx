import { cn } from 'lib/utility';
import { useDockBottom } from 'hooks/useDockBottom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Close, Media, Text } from 'ui';
import { type PreviewItem } from '../utils/usePendingFiles';
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
 * живой. Отсюда полоса, и она МИНИМАЛЬНА: одна строка — кадры, счёт «готово/всего», одна кнопка
 * по состоянию пачки. Список открывается тапом по строке; в нём имя, знак состояния и ×, кроп —
 * тапом по кадру. Ни пояснений, ни метаданных: причина отказа — во всплывающей подсказке строки.
 */

interface PendingMediaPlateProps {
  previews: PreviewItem[];
  croppedUrls: Record<number, string>;
  uploadingIndices: Set<number>;
  onUploadAll: (index?: number | number[]) => void;
  onCrop: (index: number, croppedUrl: string) => void;
  onRemove: (index: number | number[]) => void;
}

/** Состояние строки — знаком, а не словом: ✓ готово, ↑ уходит, · в очереди, ! отказ или не пролезет. */
const GLYPH: Record<PreviewItem['status'], [string, string]> = {
  wait: ['', ''],
  queued: ['·', 'text-labelColor'],
  sending: ['↑', 'text-warning motion-safe:animate-pulse'],
  done: ['✓', 'text-success'],
  error: ['!', 'text-error'],
  blocked: ['!', 'text-error'],
};

/** Причина — во всплывающей подсказке, а не строкой текста в полосе. */
function reasonOf(item: PreviewItem) {
  if (item.status === 'blocked') return item.blockers?.join(' · ');
  if (item.status === 'error') return item.error;
  return undefined;
}

function QueueRow({
  item,
  thumbSrc,
  cropping,
  onCropOpen,
  onDrop,
}: {
  item: PreviewItem;
  /** Что показывать: кадрированный вариант, если его сделали, иначе исходник. */
  thumbSrc: string;
  cropping: boolean;
  onCropOpen: (id: string) => void;
  onDrop: () => void;
}) {
  // КРОП — ТАП ПО КАДРУ. Остаётся и на «не пролезет»: пределы считаются по тому, что реально
  // уйдёт (`usePendingFiles.setCroppedUrl`), и кроп — единственный выход из этого тупика.
  const canCrop =
    item.type === 'image' &&
    (item.status === 'wait' || item.status === 'error' || item.status === 'blocked');
  const bad = item.status === 'error' || item.status === 'blocked';
  const [glyph, tone] = GLYPH[item.status];

  return (
    <div role='listitem' className='flex items-center gap-2 py-1' title={reasonOf(item)}>
      <Button
        disabled={!canCrop}
        aria-pressed={cropping}
        aria-label={canCrop ? `crop ${item.name}` : item.name}
        onClick={() => onCropOpen(item.id)}
        className={cn(
          'size-7 shrink-0 overflow-hidden border bg-pageBg',
          bad ? 'border-error' : 'border-borderColor',
          cropping && 'outline outline-2 outline-textColor',
          item.status === 'done' && 'opacity-60',
          canCrop ? 'cursor-pointer' : 'disabled:cursor-default',
        )}
      >
        <Media src={thumbSrc} alt={item.name} type={item.type} aspectRatio='auto' fit='cover' />
      </Button>
      <Text
        component='span'
        className={cn(
          'min-w-0 flex-1 truncate leading-tight',
          item.status === 'done' && 'text-labelColor',
        )}
      >
        {item.name}
      </Text>
      <span aria-hidden className={cn('w-3 text-center', tone)}>
        {glyph}
      </span>
      <Close
        size='sm'
        aria-label={`remove ${item.name}`}
        disabled={item.status === 'sending'}
        onClick={onDrop}
      />
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
  // СВЁРНУТА ПО УМОЛЧАНИЮ: одной строки — кадры, счёт, одна кнопка — хватает, чтобы отправить
  // пачку; список нужен только чтобы убрать файл или кадрировать.
  const [open, setOpen] = useState(false);
  const [croppingId, setCroppingId] = useState<string | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const cropIndex = croppingId ? previews.findIndex((item) => item.id === croppingId) : -1;
  const cropping = cropIndex >= 0 ? previews[cropIndex] : undefined;

  // Строку, которую кадрировали, могли убрать из очереди — панель кропа тогда показывает чужой кадр.
  useEffect(() => {
    if (croppingId && cropIndex < 0) setCroppingId(null);
  }, [croppingId, cropIndex]);

  // Полоса объявляет свой занятый низ экрана: последний ряд сетки и полоса выбора не уходят под неё.
  useDockBottom(dockRef, [open, cropping?.id, previews.length], { lift: true });

  const tally = useMemo(() => {
    const count = (status: PreviewItem['status']) =>
      previews.filter((item) => item.status === status).length;
    const blocked = count('blocked');
    return {
      wait: count('wait'),
      done: count('done'),
      error: count('error'),
      blocked,
      /** Сколько вообще может уехать: то, что не пролезет, из знаменателя выкинуто. */
      can: previews.length - blocked,
    };
  }, [previews]);

  // «Что-то уже в пути» — единственный источник: индексы, которые очередь считает своими.
  const live = uploadingIndices.size > 0;
  const indicesWhere = (match: (item: PreviewItem) => boolean) =>
    previews.reduce<number[]>((acc, item, index) => {
      if (match(item)) acc.push(index);
      return acc;
    }, []);

  if (!previews.length) return null;

  // ОДНА КНОПКА ВМЕСТО ЧЕТЫРЁХ: что нажать дальше, решает состояние пачки.
  const primary = live ? (
    <Button size='sm' variant='secondary' disabled>
      sending…
    </Button>
  ) : tally.error ? (
    <Button
      size='sm'
      variant='main'
      onClick={() => onUploadAll(indicesWhere((item) => item.status === 'error'))}
    >
      retry {tally.error}
    </Button>
  ) : tally.wait ? (
    <Button
      size='sm'
      variant='main'
      onClick={() => onUploadAll(indicesWhere((item) => item.status === 'wait'))}
    >
      send {tally.wait}
    </Button>
  ) : (
    // Отправлять больше нечего: уносит отправленное и то, что не пролезло.
    <Button
      size='sm'
      variant='secondary'
      onClick={() =>
        onRemove(indicesWhere((item) => item.status === 'done' || item.status === 'blocked'))
      }
    >
      clear
    </Button>
  );

  const peek = previews.slice(0, 5);

  const dock = (
    <div
      ref={dockRef}
      role='region'
      aria-label='upload queue'
      // Мебель страницы, а не тост: лежит ниже модалки (`--z-dock`), иначе накрыла бы её подвал.
      className='fixed inset-x-0 bottom-0 z-[var(--z-dock)] border-t border-borderColor bg-bgColor'
    >
      <div className='mx-auto w-full max-w-[1400px] px-2.5'>
        <div className='flex items-center gap-2.5 py-2'>
          <Button
            aria-expanded={open}
            aria-label={open ? 'collapse upload queue' : 'expand upload queue'}
            className='flex min-w-0 items-center gap-2.5'
            onClick={() => setOpen((prev) => !prev)}
          >
            <span className='flex -space-x-2'>
              {peek.map((item) => (
                <span
                  key={item.id}
                  className='size-7 shrink-0 overflow-hidden border border-bgColor bg-pageBg'
                >
                  <Media
                    src={croppedUrls[previews.indexOf(item)] || item.url}
                    alt=''
                    type={item.type}
                    aspectRatio='auto'
                    fit='cover'
                  />
                </span>
              ))}
            </span>
            <Text size='micro' variant='label' component='span' className='tabular-nums'>
              {tally.done}/{tally.can}
            </Text>
            <span aria-hidden className='text-micro text-labelColor'>
              {open ? '▾' : '▴'}
            </span>
          </Button>
          <div className='ml-auto'>{primary}</div>
        </div>

        {open && (
          <div className='max-h-[52vh] overflow-y-auto border-t border-hairline'>
            {cropping && (
              // Кроп раскрывается над списком, а не вместо него: остальные файлы остаются на виду.
              <div className='mx-auto max-w-[660px] border-b border-hairline py-2'>
                <MediaCropper
                  key={cropping.id}
                  selectedFile={cropping.url}
                  outputFormat={cropping.mime}
                  hideHeader
                  saveLabel='apply'
                  saveCroppedImage={(url: string) => {
                    onCrop(cropIndex, url);
                    setCroppingId(null);
                  }}
                  onCancel={() => setCroppingId(null)}
                />
              </div>
            )}
            <div role='list' aria-label='files in the queue'>
              {previews.map((item, index) => (
                <QueueRow
                  key={item.id}
                  item={item}
                  thumbSrc={croppedUrls[index] || item.url}
                  cropping={croppingId === item.id}
                  onCropOpen={(id) => setCroppingId((prev) => (prev === id ? null : id))}
                  onDrop={() => onRemove(index)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Полоса живёт над страницей, а не в шапке, где смонтирован компонент.
  return createPortal(dock, document.body);
}
