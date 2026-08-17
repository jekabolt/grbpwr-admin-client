import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { useMemo, useState } from 'react';
import { VideoSize } from '..';
import { isKnownAspectRatio, mediaAspectRatio } from './calculate-aspect';
import { MediaUsageMap, mediaUsageRefs } from './media-usage';

export type FilterType = 'all' | 'image' | 'video';
export type SortOrder = 'asc' | 'desc';

/** Полка занятости. `null` — полка не выбрана, а не «оба варианта сразу». */
export type UsageShelf = 'free' | 'used';

export const SORT_ORDERS = ['asc', 'desc'] as const;

/** Соотношения без имени сходятся в одну корзину: их по одному, и списком они бы его затопили. */
export const OTHER_RATIO = '__other__';

/** Одна ссылка на всю жизнь модуля: `new Map()` в значении по умолчанию был бы новым объектом на
 *  каждый вызов, и все мемоизации ниже пересчитывались бы на каждый рендер. */
const NO_USAGE: MediaUsageMap = new Map();

export function useFilter(
  media?: common_MediaFull[],
  aspectRatio?: string[],
  videoSizes: Record<number, VideoSize> = {},
  initialType?: FilterType,
  usage: MediaUsageMap = NO_USAGE,
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
  const [usageShelf, setUsageShelf] = useState<UsageShelf | null>(null);

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

  /**
   * Корзина полки занятости. `undefined` — про снимок ЕЩЁ НЕ СПРАШИВАЛИ, и он не принадлежит ни
   * «свободным», ни «занятым»: пока ответа нет, отнести его к свободным значило бы предложить
   * человеку удалить пачку, половина которой стоит на витрине.
   */
  const usageBucket = (m: common_MediaFull): UsageShelf | undefined => {
    const refs = mediaUsageRefs(usage, m.id);
    if (!refs) return undefined;
    return refs.length ? 'used' : 'free';
  };

  const matchesUsageShelf = (m: common_MediaFull, value: UsageShelf | null = usageShelf) =>
    !value || usageBucket(m) === value;

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
    const within = base.filter((m) => matchesRatioShelf(m) && matchesUsageShelf(m));
    return {
      all: within.length,
      image: within.filter((m) => matchesTypeFilter(m, 'image')).length,
      video: within.filter((m) => matchesTypeFilter(m, 'video')).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, ratio, usageShelf, usage, videoSizes]);

  /**
   * Свободные и занятые — и отдельно те, про кого ответа ещё нет.
   *
   * `unknown` возвращается наружу НЕ ради полки, а ради подписи под ней: без него рельс на первой
   * секунде объявлял бы всю библиотеку свободной, а это ровно то, из-за чего удаление было
   * рулеткой. Полка показывается только по выясненному, а невыясненное называется числом.
   */
  const usageCounts = useMemo(() => {
    const within = base.filter((m) => matchesTypeFilter(m) && matchesRatioShelf(m));
    let free = 0;
    let used = 0;
    let unknown = 0;
    for (const m of within) {
      const bucket = usageBucket(m);
      if (bucket === 'free') free += 1;
      else if (bucket === 'used') used += 1;
      else unknown += 1;
    }
    return { free, used, unknown };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, type, ratio, usage, videoSizes]);

  const ratioCounts = useMemo(() => {
    const within = base.filter((m) => matchesTypeFilter(m) && matchesUsageShelf(m));
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
  }, [base, type, usageShelf, usage, videoSizes]);

  const filteredMedia = useMemo(
    () =>
      base
        .filter((m) => matchesTypeFilter(m) && matchesRatioShelf(m) && matchesUsageShelf(m))
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return order === 'desc' ? bTime - aTime : aTime - bTime;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, type, ratio, usageShelf, usage, order, videoSizes],
  );

  const isFiltered =
    type !== baseType || ratio !== null || usageShelf !== null || search.trim() !== '';

  const reset = () => {
    setType(baseType);
    setRatio(null);
    setUsageShelf(null);
    setSearch('');
  };

  return {
    filteredMedia,
    type,
    order,
    search,
    ratio,
    usageShelf,
    typeCounts,
    ratioCounts,
    usageCounts,
    isFiltered,
    setType,
    setOrder,
    setSearch,
    setRatio,
    setUsageShelf,
    reset,
  };
}
