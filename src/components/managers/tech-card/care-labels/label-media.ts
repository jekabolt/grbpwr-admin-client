// МЕДИА ЭТИКЕТОК: id → картинка (M-02).
//
// Лого составника (`care_label.logo_media_id`) и мокапы этикеток / упаковки (`media_ids`) ездят по
// проводу одними id. Раньше адрес брался только из библиотеки (`useMediaMap`) — а она держит лишь
// последние 500 файлов: стоило загрузить 500 новых, и лого становилось блоком `logo-unavailable`
// (ZIP отказан), а мокапы — «#id». Теперь первым источником идёт `resolvedLabelMedia` карточки: сервер
// разрешает КАЖДЫЙ такой id на чтении. Библиотека — запасной путь для выбранного в этой сессии до
// сохранения / перечтения карточки.
import type { common_MediaFull, common_TechCardMediaFull } from 'api/proto-http/admin';

export type LabelMediaSource = readonly common_TechCardMediaFull[] | undefined;

/** Медиа по id: сперва разрешённое сервером на карточке, затем библиотека. */
export function labelMediaOf(
  mediaId: number,
  resolved: LabelMediaSource,
  library: ReadonlyMap<number, common_MediaFull>,
): common_MediaFull | undefined {
  if (!(mediaId > 0)) return undefined;
  const r = resolved?.find((x) => x.media?.id === mediaId)?.media;
  return r ?? library.get(mediaId);
}

/** Адрес полного файла (лого разбирается из SVG целиком): fullSize, затем compressed. */
export function labelMediaFullUrl(
  mediaId: number,
  resolved: LabelMediaSource,
  library: ReadonlyMap<number, common_MediaFull>,
): string {
  const m = labelMediaOf(mediaId, resolved, library)?.media;
  return m?.fullSize?.mediaUrl || m?.compressed?.mediaUrl || '';
}

/**
 * Состояние текста SVG лого для адаптера: `undefined` — едет, `null` — не загрузился (адреса нет
 * при приехавших источниках или запрос упал), строка — приехал. Оба первых — блок `logo-unavailable`.
 */
export function logoSvgState(
  mediaId: number,
  url: string,
  sourcesSettled: boolean,
  q: { isSuccess: boolean; isError: boolean; data?: string },
): string | null | undefined {
  if (!(mediaId > 0)) return undefined;
  if (!url) return sourcesSettled ? null : undefined;
  return q.isSuccess ? q.data : q.isError ? null : undefined;
}
