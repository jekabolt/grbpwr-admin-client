import { isVideo } from 'lib/features/filterContentType';
import { useCallback, useMemo, useState } from 'react';
import type { AnnotationValue } from 'components/managers/tech-card/annotation/canvas';
import { MediaViewer, type MediaViewerItem } from 'components/shared/media-viewer/media-viewer';
import { Text } from 'ui';
import type { TaskMedia, TaskMediaAnnotations } from '../api/types';
import type { MediaRef } from './task-text';

/**
 * ОДНА ДВЕРЬ К ВЛОЖЕНИЮ КАРТОЧКИ — и ведёт она в ПОВЕРХНОСТЬ УКАЗАНИЙ.
 *
 * Открыть вложение просят из трёх мест: плитка в ряду вложений, чип посреди описания, чип в
 * комментарии. Если каждое заведёт себе смотрелку, то и открываться они будут по-разному — а
 * дальше их придётся менять по одному. Раньше за этой дверью стоял лайтбокс `MediaViewer`; теперь
 * тот же полноэкранный холст, что на экране операций тех-карты: зум, панорама, панель видов и
 * правка. Смотреть на снимок, о котором идёт спор, и не мочь ткнуть в него стрелкой — и была
 * исходная жалоба.
 *
 * `index` ряда СОВПАДАЕТ с позицией вложения в карточке: кадр без адреса не выбрасывается, а
 * остаётся своим местом в ряду. Отсев сдвинул бы номера — и чип `▣ 3` показал бы четвёртый снимок.
 */

const NO_ANNOTATIONS: AnnotationValue[] = [];

/**
 * ОТМЕТКА ЧИСЛА УКАЗАНИЙ НА ПЛИТКЕ — ОДНА НА ОБА РЯДА (форма и страница карточки).
 *
 * Слово и число чернилами, без цвета и без глифа — ровно как «used N» в библиотеке медиа: там
 * та же задача (сказать о кадре то, чего по нему не видно) и уже выбранное решение. Пустой снимок
 * не подписывается ничем: «notes 0» на каждой второй плитке утопило бы ряд.
 *
 * Ступень размера — единственная уступка месту: в форме плитка 64 пикселя, и десятипиксельное
 * «notes 3» вылезает за её край (замерено). Ступенью ниже — та же отметка, тем же словом.
 */
export function NotesMark({ count, size = 'micro' }: { count: number; size?: 'micro' | 'nano' }) {
  if (!count) return null;
  return (
    <Text size={size} component='span' className='tabular-nums'>
      notes {count}
    </Text>
  );
}

/** Указания одного вложения. Нет набора — пустой список, а не `undefined`: читателей у него трое. */
export function annotationsOf(sets: TaskMediaAnnotations[], mediaId: number): AnnotationValue[] {
  return sets.find((s) => s.mediaId === mediaId)?.annotations ?? NO_ANNOTATIONS;
}

export function useTaskMediaViewer({ media }: { media: TaskMedia[] }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  // ПРОСТОЙ ПРОСМОТР, БЕЗ ВЫНОСОК (владелец, 21.10): у вложений задачи указаний нет — окно только
  // листает кадры, а положение в ряду — текст `1 / 2` из самого просмотрщика.
  const items = useMemo<MediaViewerItem[]>(
    () =>
      media.map((m, i) => {
        const src = m.fullSize || m.thumbnail || '';
        return {
          src,
          thumbnail: m.thumbnail,
          blurhash: m.blurhash,
          type: isVideo(src) ? 'video' : 'image',
          alt: `attachment ${i + 1}`,
        };
      }),
    [media],
  );

  const openAt = useCallback((i: number) => {
    setIndex(i);
    setOpen(true);
  }, []);

  const openMedia = useCallback(
    (ref: MediaRef) => {
      const i = media.findIndex((m) => m.id === ref.mediaId);
      if (i >= 0) openAt(i);
    },
    [media, openAt],
  );

  const node = items.length ? (
    <MediaViewer
      items={items}
      index={Math.min(index, items.length - 1)}
      open={open}
      onOpenChange={setOpen}
      onIndexChange={setIndex}
    />
  ) : null;

  return { openIndex: openAt, openMedia, node };
}
