import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';
import Media from 'ui/components/media';
import { MediaViewer, mediaFullToViewerItem, useMediaViewer } from 'ui/components/media-viewer';
import Text from 'ui/components/text';
import { readSlotAspect } from '../utils/calculate-aspect';
import { useMediaIntake } from '../utils/useMediaIntake';
import {
  FrameLossNote,
  RemovedNotice,
  TileFooter,
  frameLoss,
  isFileDrag,
  moveItem,
  useReorder,
} from './gallery-order';
import { MediaSlot } from './media-slot';

interface MediaGallerySelectorProps {
  media: common_MediaFull[];
  editMode?: boolean;
  /** Aspect ratio options offered in the picker dialog. */
  aspectRatio: string[];
  /** CSS aspect-ratio for each cell frame, e.g. '4/5'. */
  frameAspect: string;
  label?: string;
  purpose?: string;
  /** Caption under the add slot (e.g. 'любое соотношение', '2:1'). */
  ratioCaption?: string;
  fit?: 'cover' | 'contain';
  /** Mark the first item as the thumbnail (first media becomes the entry thumbnail). */
  firstIsThumbnail?: boolean;
  /**
   * Наименьшая ширина плитки. Дорожки считаются по НЕЙ и по ширине контейнера, а не по числу
   * «две», поэтому одна и та же галерея стоит в две колонки в узкой колонке формы и в шесть на
   * широком экране.
   */
  minTilePx?: number;
  onSelect: (media: common_MediaFull[]) => void;
  onDelete: (id: number) => void;
  /**
   * Новый порядок кадров целиком. Без него порядок не меняется и убранное не возвращается: и то и
   * другое умеет только владелец списка — он же решает, куда именно встанет кадр.
   */
  onReorder?: (media: common_MediaFull[]) => void;
}

// Shared multi-select media gallery — used by product ads, archive media, etc.
export function MediaGallerySelector({
  media,
  editMode = true,
  aspectRatio,
  frameAspect,
  label = '+ frame',
  purpose,
  ratioCaption,
  fit = 'cover',
  firstIsThumbnail = false,
  minTilePx = 150,
  onSelect,
  onDelete,
  onReorder,
}: MediaGallerySelectorProps) {
  const viewer = useMediaViewer();
  const viewerItems = media.map(mediaFullToViewerItem);
  const slot = readSlotAspect(aspectRatio);
  /**
   * Последний убранный кадр — вместе с местом, на которое он вернётся, и со СНИМКОМ СПИСКА, из
   * которого его вынули (`after`).
   */
  const [removed, setRemoved] = useState<{
    index: number;
    item: common_MediaFull;
    after: string;
  } | null>(null);

  /** Личность списка одной строкой: по ней видно, тот ли это список, из которого убирали. */
  const mediaKey = media.map((m) => m.id ?? -1).join(',');

  /**
   * ПЛАШКА «УБРАНО» ЖИВЁТ РОВНО ДО СЛЕДУЮЩЕЙ ПРАВКИ СПИСКА, И НИ МГНОВЕНИЕМ ДОЛЬШЕ.
   *
   * Список принадлежит не галерее: его чистит сохранение формы (`clearKey` в рекламных кадрах
   * товара), меняет соседняя правка, перезабирает рефетч. Плашка же держала кадр и его место у
   * себя и переживала всё это — а «вернуть» после внешней очистки вкачивало протухший id в
   * свежеочищенную форму. По той же причине протухало и «место N»: снятое в момент удаления, оно
   * называло позицию в списке, которого больше нет.
   *
   * Сторож один на оба случая: плашка остаётся, только пока на экране ровно тот список, который
   * получился ПОСЛЕ удаления. Сравнение делается лишь тогда, когда список сменился, поэтому
   * владелец, применяющий удаление не в тот же такт, плашку не гасит.
   */
  useEffect(() => {
    setRemoved((prev) => (prev && editMode && prev.after === mediaKey ? prev : null));
  }, [mediaKey, editMode]);

  const canOrder = editMode && !!onReorder;
  const reorder = useReorder((from, to) => onReorder?.(moveItem(media, from, to)));

  // ⌘V И БРОСОК РАБОТАЮТ НАД ВСЕЙ ГАЛЕРЕЕЙ, а не только над пустой клеткой в её конце. Целиться
  // указателем в добавляющий слот, чтобы вставить картинку, — требование, которого никто не
  // угадает: жест адресован галерее.
  //
  // Слот в конце сетки держит свою очередь, и это не двойная загрузка: ⌘V обрабатывает ВЕРХНИЙ в
  // стопке приёмник — ровно один из двух, — а кладут результат оба одним и тем же `onSelect`.
  const intake = useMediaIntake({
    accept: 'media',
    aspect: slot.primary,
    lockAspect: slot.constrained,
    purpose,
    enabled: editMode,
    onMedia: onSelect,
  });

  // ГАЛЕРЕЯ ЖДЁТ ФАЙЛА РОВНО ТОГДА, КОГДА В ЖЕСТЕ ФАЙЛ.
  //
  // Раньше приёмник сторожило состояние СВОЕЙ перестановки (`reorder.active`), а состояние знает
  // только про свои плитки: рядом стоит вторая такая же галерея (архив держит две медиа-линии),
  // плитку тащат из неё — здесь `active` равен false, и несторожёный приёмник зажигал обводку
  // «бросьте файл» на весь жест, а на отпускании не делал ничего. Признак берётся из самого
  // перетаскивания, поэтому он верен и для чужой плитки, и для залипшего состояния.
  const filesOnly = (handler?: (e: React.DragEvent) => void) => (e: React.DragEvent) => {
    if (isFileDrag(e)) {
      handler?.(e);
      return;
    }
    // Обещания не даём и наверх не пускаем: без `preventDefault` браузер сам покажет, что здесь
    // не примут.
    e.stopPropagation();
  };

  const regionHandlers = {
    ...intake.regionHandlers,
    onDragEnter: filesOnly(intake.regionHandlers.onDragEnter),
    onDragOver: filesOnly(intake.regionHandlers.onDragOver),
    onDragLeave: filesOnly(intake.regionHandlers.onDragLeave),
    onDrop: (e: React.DragEvent) => {
      if (isFileDrag(e)) {
        intake.regionHandlers.onDrop(e);
        return;
      }
      // Плитку уронили мимо всех плиток — на промежуток сетки. Перестановки не было, но и
      // браузеру этот бросок отдавать незачем.
      e.preventDefault();
      e.stopPropagation();
      reorder.cancel();
    },
  };

  function handleRemove(index: number) {
    const item = media[index];
    if (!item) return;
    setRemoved(
      onReorder
        ? {
            index,
            item,
            after: media
              .filter((_, at) => at !== index)
              .map((m) => m.id ?? -1)
              .join(','),
          }
        : null,
    );
    onDelete(item.id || 0);
  }

  function restore() {
    if (!removed || !onReorder) return;
    // Кадр мог вернуться и сам — тогда возвращать нечего, второй такой же в списке не нужен.
    if (!media.some((m) => m.id === removed.item.id)) {
      const next = media.slice();
      next.splice(Math.min(removed.index, next.length), 0, removed.item);
      onReorder(next);
    }
    setRemoved(null);
  }

  return (
    <>
      <div
        {...regionHandlers}
        className={cn(
          'grid items-start gap-2',
          // Бросок на ЗАНЯТУЮ клетку тоже добавляет кадр — и это надо показать: без отклика жест
          // над готовой галереей выглядит как промах мимо слота в её конце.
          intake.dragging && 'outline outline-1 outline-offset-4 outline-textColor',
        )}
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minTilePx}px, 1fr))` }}
      >
        {media.map((m, i) => {
          const url = m.media?.thumbnail?.mediaUrl || m.media?.fullSize?.mediaUrl || '';
          const video = isVideo(m.media?.fullSize?.mediaUrl) || isVideo(url);
          const size = m.media?.fullSize?.width ? m.media.fullSize : m.media?.thumbnail;
          // Ролик вписывается целиком, поэтому рамка у него ничего не срезает.
          const loss = video
            ? undefined
            : frameLoss({ frameAspect, fit, width: size?.width, height: size?.height });
          return (
            <div
              key={m.id ?? i}
              ref={canOrder ? reorder.registerTile(i) : undefined}
              {...(canOrder ? reorder.tileProps(i) : {})}
              className={cn(
                'flex flex-col border bg-bgColor',
                reorder.overIndex === i ? 'border-textColor' : 'border-borderColor',
              )}
            >
              <div className='relative overflow-hidden' style={{ aspectRatio: frameAspect }}>
                <Media
                  type={video ? 'video' : 'image'}
                  src={url}
                  alt={m.media?.blurhash || ''}
                  fit={video ? 'contain' : fit}
                  aspectRatio='auto'
                />
                {/* Full-cell click target opens the shared viewer at this index. The row of
                    controls lives UNDER the picture, so nothing fights it for a corner.
                    z-10 / z-20 ниже — ЛОКАЛЬНЫЙ СТЕК ПЛИТКИ (мишень клика, поверх неё метки), а
                    не слой страницы: слои живут в семантической шкале var(--z-*). */}
                <button
                  type='button'
                  aria-label={`open frame ${i + 1} of ${media.length}`}
                  onClick={() => viewer.openAt(i)}
                  className='absolute inset-0 z-10 cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                />
                {/* ОБЛОЖКА НАЗВАНА СЛОВОМ. До этого первое место значило «обложка» молча — знание
                    жило в голове у того, кто складывал галерею, и в комментарии к коду. */}
                <span className='pointer-events-none absolute left-1 top-1 z-20 flex flex-col items-start gap-0.5'>
                  {firstIsThumbnail && i === 0 && (
                    <Text
                      className='bg-textColor px-1.5 py-0.5 !text-bgColor'
                      size='nano'
                      variant='uppercase'
                      component='span'
                    >
                      cover
                    </Text>
                  )}
                  {video && (
                    <Text
                      className='bg-textColor px-1.5 py-0.5 !text-bgColor'
                      size='nano'
                      variant='uppercase'
                      component='span'
                    >
                      video
                    </Text>
                  )}
                </span>
              </div>

              <TileFooter
                index={i}
                count={media.length}
                width={size?.width}
                height={size?.height}
                reorder={canOrder ? reorder : undefined}
                onMove={canOrder ? (from, to) => onReorder?.(moveItem(media, from, to)) : undefined}
                onRemove={editMode ? () => handleRemove(i) : undefined}
              />
              {loss && <FrameLossNote loss={loss} className='pb-1' />}
            </div>
          );
        })}
        {/* Слот «ещё кадр» стоит В САМОЙ СЕТКЕ и той же клеткой, что и снимки: пустое место и есть
            средство его заполнить. Кнопка внутри пунктирной рамки читалась как отдельный контрол
            рядом с галереей, а заполняет она именно эту клетку. */}
        {editMode && (
          <MediaSlot
            aspectRatio={aspectRatio}
            frameAspect={frameAspect}
            label={label}
            purpose={purpose}
            hint={ratioCaption}
            allowMultiple
            showVideos
            onSelect={onSelect}
          />
        )}
      </div>

      {/* Плашка стоит ПОД гейтом правки: «вернуть кадр» — действие правки, и на панели, у которой
          правку сняли (семпл без права редактирования), живой кнопки быть не должно. */}
      {editMode && removed && (
        <RemovedNotice
          className='mt-2'
          what={`frame ${removed.item.id ?? '—'}`}
          place={removed.index + 1}
          onRestore={restore}
          onDismiss={() => setRemoved(null)}
        />
      )}

      {intake.dialog}

      <MediaViewer items={viewerItems} {...viewer} />
    </>
  );
}
