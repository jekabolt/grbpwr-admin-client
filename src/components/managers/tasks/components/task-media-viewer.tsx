import { useCallback, useMemo } from 'react';
import { MediaViewer, useMediaViewer, type MediaViewerItem } from 'ui/components/media-viewer';
import type { TaskMedia } from '../api/types';
import type { MediaRef } from './task-text';

/**
 * ОДНА ДВЕРЬ К ВЛОЖЕНИЮ КАРТОЧКИ.
 *
 * Открыть вложение просят из трёх мест: плитка в ряду вложений, чип посреди описания, чип в
 * комментарии. Если каждое заведёт себе просмотрщик, то и открываться они будут по-разному — а
 * дальше их придётся менять по одному. Поэтому смотрелка здесь ровно одна, и заменить её (на
 * полноэкранную поверхность указаний) можно правкой этого файла, не трогая экраны.
 *
 * `index` ряда СОВПАДАЕТ с позицией вложения в карточке: кадр без адреса не выбрасывается, а
 * остаётся битой плиткой на своём месте. Отсев сдвинул бы номера — и чип `▣ 3` показал бы
 * четвёртый снимок.
 */
export function useTaskMediaViewer(media: TaskMedia[]) {
  const viewer = useMediaViewer();
  const { openAt } = viewer;

  const items: MediaViewerItem[] = useMemo(
    () => media.map((m) => ({ src: m.fullSize || m.thumbnail || '', thumbnail: m.thumbnail })),
    [media],
  );

  /**
   * Открыть по ССЫЛКЕ ИЗ ТЕКСТА. Номер выноски пока не используется: указаний на вложениях задачи
   * ещё нет, а показывать «третью выноску» на кадре, где их ноль, было бы враньём. Ссылка при этом
   * уже разбирается и уже ведёт на нужный снимок.
   */
  const openMedia = useCallback(
    (ref: MediaRef) => {
      const i = media.findIndex((m) => m.id === ref.mediaId);
      if (i < 0) return;
      openAt(i);
    },
    [media, openAt],
  );

  return {
    items,
    /** Открыть по месту в ряду — для плиток галереи. */
    openIndex: openAt,
    openMedia,
    node: <MediaViewer items={items} {...viewer} />,
  };
}
