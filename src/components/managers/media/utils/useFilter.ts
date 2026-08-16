import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { useMemo, useState } from 'react';
import { VideoSize } from '..';
import { isKnownAspectRatio, mediaAspectRatio } from './calculate-aspect';

export type FilterType = 'all' | 'image' | 'video';
export type SortOrder = 'asc' | 'desc';

export const SORT_ORDERS = ['asc', 'desc'] as const;

/** Соотношения без имени сходятся в одну корзину: их по одному, и списком они бы его затопили. */
export const OTHER_RATIO = '__other__';

export function useFilter(
  media?: common_MediaFull[],
  aspectRatio?: string[],
  videoSizes: Record<number, VideoSize> = {},
  initialType?: FilterType,
) {
  // НАЧАЛЬНЫЙ ТИП — ЭТО ОГРАНИЧЕНИЕ СЛОТА, А НЕ ВЫБОР ЧЕЛОВЕКА. Слот, который видео не берёт,
  // монтирует библиотеку с `initialType='image'`. Пока «дно» отбора считалось равным `'all'`,
  // такой пикер с первого кадра объявлял себя отфильтрованным (кнопка «сбросить отбор» висела,
  // хотя человек ничего не отбирал), а сам сброс ставил `'all'` — и в сетку слота, где видео
  // некуда положить, приезжали ролики: клик по такому кадру уходил в слот мимо кропа.
  const baseType: FilterType = initialType ?? 'all';
  const [type, setType] = useState<FilterType>(baseType);
  const [order, setOrder] = useState<SortOrder>('desc');
  const [search, setSearch] = useState('');
  const [ratio, setRatio] = useState<string | null>(null);

  function matchesTypeFilter(m: common_MediaFull, value: FilterType = type) {
    const isVideoMedia = isVideo(m.media?.thumbnail?.mediaUrl);
    switch (value) {
      case 'video':
        return isVideoMedia;
      case 'image':
        return !isVideoMedia;
      default:
        return true;
    }
  }

  // common_MediaFull carries no filename metadata (uploads go through the backend as raw
  // bytes, never a file name — see useUploadMedia) — the closest text every item actually has
  // is its own storage id/url, so matching against those is the only search the client can do
  // without a backend change. Still useful: pasting a copied url/id, or a remembered fragment
  // of it, finds the item instead of scrolling an unindexed grid.
  function matchesSearch(m: common_MediaFull) {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    if (m.id != null && String(m.id).includes(q)) return true;
    const urls = [
      m.media?.fullSize?.mediaUrl,
      m.media?.thumbnail?.mediaUrl,
      m.media?.compressed?.mediaUrl,
    ];
    return urls.some((u) => u?.toLowerCase().includes(q));
  }

  const matchesAspectRatioFilter = (m: common_MediaFull) => {
    if (!aspectRatio?.length) return true;

    const mediaRatio = mediaAspectRatio(m, videoSizes);

    if (!mediaRatio) {
      const isVideoMedia = isVideo(m.media?.thumbnail?.mediaUrl);
      return isVideoMedia;
    }

    const hasCustom = aspectRatio.includes('Custom');

    if (hasCustom && !isKnownAspectRatio(mediaRatio)) {
      return true;
    }

    return aspectRatio.includes(mediaRatio);
  };

  /** Корзина, в которую попадает медиа на полке соотношений. */
  const ratioBucket = (m: common_MediaFull) => {
    const r = mediaAspectRatio(m, videoSizes);
    return isKnownAspectRatio(r) ? (r as string) : OTHER_RATIO;
  };

  const matchesRatioShelf = (m: common_MediaFull, value: string | null = ratio) =>
    !value || ratioBucket(m) === value;

  const base = useMemo(
    () => (media ?? []).filter((m) => matchesAspectRatioFilter(m) && matchesSearch(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [media, aspectRatio, videoSizes, search],
  );

  // СЧЁТЧИКИ ФАСЕТНЫЕ: у каждой полки свой собственный фильтр из подсчёта исключён, иначе выбор
  // «видео» обнулял бы все соотношения, кроме выбранного, и полка переставала показывать, куда
  // ещё можно пойти. Считаются они по УЖЕ ЗАГРУЖЕННЫМ страницам: ListObjectsPaged не отдаёт ни
  // общего числа, ни фасетов, поэтому вызывающий обязан подписать, что это счёт по загруженному.
  const typeCounts = useMemo(() => {
    const within = base.filter((m) => matchesRatioShelf(m));
    return {
      all: within.length,
      image: within.filter((m) => matchesTypeFilter(m, 'image')).length,
      video: within.filter((m) => matchesTypeFilter(m, 'video')).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, ratio, videoSizes]);

  const ratioCounts = useMemo(() => {
    const within = base.filter((m) => matchesTypeFilter(m));
    const map = new Map<string, number>();
    within.forEach((m) => {
      const key = ratioBucket(m);
      map.set(key, (map.get(key) || 0) + 1);
    });
    // Именованные вперёд по частоте, безымянная корзина всегда последней.
    return [...map.entries()]
      .sort((a, b) => {
        if (a[0] === OTHER_RATIO) return 1;
        if (b[0] === OTHER_RATIO) return -1;
        return b[1] - a[1];
      })
      .map(([key, count]) => ({ key, count }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, type, videoSizes]);

  const filteredMedia = useMemo(
    () =>
      base
        .filter((m) => matchesTypeFilter(m) && matchesRatioShelf(m))
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return order === 'desc' ? bTime - aTime : aTime - bTime;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, type, ratio, order, videoSizes],
  );

  const isFiltered = type !== baseType || ratio !== null || search.trim() !== '';

  const reset = () => {
    setType(baseType);
    setRatio(null);
    setSearch('');
  };

  return {
    filteredMedia,
    type,
    order,
    search,
    ratio,
    typeCounts,
    ratioCounts,
    isFiltered,
    setType,
    setOrder,
    setSearch,
    setRatio,
    reset,
  };
}
