import type { common_DesignPicture, common_DesignRun } from 'api/proto-http/admin';
import {
  mediaFullToViewerItem,
  mediaFullViewerSrc,
  type MediaViewerItem,
} from 'ui/components/media-viewer';

import { cropFamilies } from './composite';
import { isRunLive } from './run-state';

/**
 * ═══ THE VIEWER ROW AND THE DECKS OF A SET OF RUNS — PURE READERS, TWO HOSTS (26.09, O-53) ════════
 *
 * Moved out of `GenerationHistory`'s two memos unchanged, so the history and the latest-generation
 * workbench under GENERATE build their viewer row and read their decks by ONE rule. No React here:
 * the hosts memoise.
 */

/**
 * THE PICTURES OF ONE RUN IN THE ORDER ITS ROW SHOWS THEM — every root in wire order, the pieces of
 * the OPEN deck right after their sheet, the pieces of closed decks nowhere (H-10). The order of the
 * viewer row IS the order of the screen (T-8), so this is the one place that order is spelled.
 */
export function displayPictures(
  run: common_DesignRun,
  openDeck: number | null,
): common_DesignPicture[] {
  const pictures = run.pictures ?? [];
  const families = cropFamilies(pictures);
  const out: common_DesignPicture[] = [];
  for (const picture of pictures) {
    const id = picture.id ?? 0;
    if (families.rootOf.has(id)) continue;
    out.push(picture);
    if (openDeck === id) out.push(...(families.membersOf.get(id) ?? []));
  }
  return out;
}

/**
 * ОДИН РЯД ПРОСМОТРЩИКА НА ВСЕ ПЕРЕДАННЫЕ ПРОГОНЫ (T-8): «в зум вью по всем картинкам из всех
 * генераций итерироваться не только этой». Ряд, который собирают САМИ ПЛИТКИ, кончался бы на краю
 * окна по три. ПОРЯДОК РЯДА — ПОРЯДОК ПОКАЗА (`displayPictures`), прогоны — в порядке списка;
 * живой прогон картинок ещё не держит и пропускается; картинка без адреса в ряд не встаёт.
 * `indexOf` — смещение каждой картинки в ряду, по нему плитка открывает группу.
 */
export function runsGallery(
  runs: readonly common_DesignRun[],
  openDeck: number | null,
): { items: MediaViewerItem[]; indexOf: Map<number, number> } {
  const items: MediaViewerItem[] = [];
  const indexOf = new Map<number, number>();
  const put = (picture: common_DesignPicture) => {
    const id = picture.id ?? 0;
    const media = picture.media;
    if (!id || indexOf.has(id) || !media || !mediaFullViewerSrc(media)) return;
    indexOf.set(id, items.length);
    items.push(mediaFullToViewerItem(media));
  };
  for (const run of runs) {
    if (isRunLive(run)) continue;
    for (const picture of displayPictures(run, openDeck)) put(picture);
  }
  return { items, indexOf };
}

/** ЧЕЙ КУСОК ЭТА КАРТИНКА — piece id → its sheet's id, over the given runs, open deck or not (E-4). */
export function deckOfRuns(runs: readonly common_DesignRun[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const run of runs) {
    const families = cropFamilies(run.pictures ?? []);
    for (const [memberId, rootId] of families.rootOf) out.set(memberId, rootId);
  }
  return out;
}

/**
 * ЗУМ ЧУЖОЙ КАРТОЧКИ СКЛАДЫВАЕТ ОТКРЫТУЮ КОЛОДУ (E-4): «после экспанда спличеных карточек при
 * зуме любой другой они должны обратно колапсится». Граница проходит по колоде: зум по самому
 * листу и по любому его куску — работа ВНУТРИ раскрытой группы. The next value of the host's
 * `openDeck` after `pictureId` was zoomed.
 */
export function deckAfterZoom(
  current: number | null,
  pictureId: number,
  deckOf: ReadonlyMap<number, number>,
): number | null {
  if (current === null || !pictureId) return current;
  if (pictureId === current) return current;
  return deckOf.get(pictureId) === current ? current : null;
}
