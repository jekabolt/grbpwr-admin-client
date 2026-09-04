import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { createContext, useContext } from 'react';

import { outputsOfKind } from '../render/model';
import { threedResults } from './media';

/**
 * ═══ КАКОЙ РАСТР СТОИТ ВМЕСТО КАКОЙ МОДЕЛИ — ОДИН ОТВЕТ НА ВСЮ ПОЛОСУ (J-29) ══════════════════
 *
 * Владелец, дословно: «в 3D MODELS OF THIS CARD на клик должен открываться просмотр 3д модели а
 * сейчас открывает в медиа просмотре и там это не работает».
 *
 * ═══ ПОЧЕМУ ЭТОГО НЕ ХВАТАЛО ПРИМИТИВУ ════════════════════════════════════════════════════════
 *
 * `PictureTile` уже знает правило «адрес кончается на `.glb` — это не картинка, а файл модели»
 * (`isModelUrl`). Но прогон 3D возвращает ДВЕ строки, и в списке рисуется ВТОРАЯ: растровая
 * миниатюра, которую маршрут прислал ИМЕННО ЗАТЕМ, чтобы список было чем нарисовать
 * (`threedfal.go`). У неё адрес обычной картинки, поэтому примитив честно давал ей `<img>`-зум —
 * и клик по единственной видимой плитке 3D-прогона приземлялся в просмотрщик картинок, где
 * крутить нечего.
 *
 * Знание «этот растр — заместитель вон той модели» НЕ ЖИВЁТ НИ В ОДНОЙ ИЗ ДВУХ СТРОК: контракт
 * родства не несёт (`derived_from` у обеих ноль — довод целиком в `./media.ts`). Его выводит
 * `threedResults` из полосы целиком. То есть это факт УРОВНЯ КАРТОЧКИ, а не уровня ячейки, и
 * единственное место, где он известен раз и навсегда, — тот, кто держит полосу.
 *
 * ═══ ПОЧЕМУ ЭТО ИНДЕКС, А НЕ ПРОП У КАЖДОГО ВЫЗЫВАЮЩЕГО ═══════════════════════════════════════
 *
 * Плитку 3D-прогона рисуют ЧЕТЫРЕ разных экрана: раздел выходов, лента генераций, ARTIFACTS и
 * верстак. Проп «за этой плиткой стоит модель» пришлось бы вспомнить в каждом из них, и первый
 * же забытый вызывающий вернул бы ровно тот дефект, о котором говорит владелец, — но уже только
 * в одном месте, то есть незаметно. Это тот же довод, которым в `picture-tile.tsx` заведён закон
 * углов: «как рисовать» и «куда ведёт клик» решает примитив, а экран говорит только ЧТО рисовать.
 *
 * ═══ КЛЮЧ — АДРЕС РАСТРА, И ВСЕ ТРИ ЕГО НАПИСАНИЯ ════════════════════════════════════════════
 *
 * У плитки на руках ровно один факт о себе: `url`. Разные вызывающие берут у одной и той же
 * медиа-строки разные слоты (`pictureThumb` предпочитает миниатюру, полоса выходов — тоже, а
 * панель прогона умеет взять полный), поэтому в индекс кладутся ВСЕ ТРИ адреса одной строки.
 * Запрос и подпись сравниваются по ПУТИ: подписанный `?X-Amz-…` или якорь не должны ни включать,
 * ни выключать признак — то же правило и по той же причине, что у `isModelUrl`.
 *
 * ═══ КРУГ 19 (D-26): ЗАПИСЬ ИНДЕКСА НЕСЁТ И КАРТОЧКУ, И ПУТЬ САМОЙ МОДЕЛИ ═══════════════════════
 *
 * Снимок с ракурса регистрируется на карточку (`RegisterDesignUpload`), а окно модели открывает
 * ЧУЖОЙ примитив (`PictureTile`) с одним лишь адресом файла — карточки он окну не называет и
 * назвать не может: у плитки её нет. Есть она у КАРТИНКИ ПОЛОСЫ (`DesignPicture.tech_card_id`),
 * из которой этот индекс и собирается. Поэтому запись теперь пара «адрес модели + карточка», а
 * ключом, кроме трёх адресов растра, служит и путь самой модели: окно, открытое по адресу `.glb`,
 * находит по нему свою карточку, не прося вызывающего ни о чём. Читатель растра
 * (`useModelBehind`) при этом отвечает тем же, чем отвечал, — строкой адреса.
 *
 * ⚠ ПУТЬ МОДЕЛИ В КЛЮЧАХ МЕНЯЕТ ОДНО ПОВЕДЕНИЕ ЧУЖОЙ ПЛИТКИ, И ЭТО НАЗВАНО: плитка, чей `url` и
 * есть `.glb` (результат без миниатюры), раньше получала пустой ответ и открывала просмотрщик
 * картинок над файлом модели — тот самый «не работает» из J-29; теперь она открывает окно модели.
 *
 * ЧЕГО ИНДЕКС НЕ ДЕЛАЕТ: он не знает про прогоны без модели. Историческая строка рода `threed`
 * без `.glb` в индекс не попадает вовсе и остаётся обычной картинкой с обычным зумом — это
 * правда о ней, а не пробел.
 */

/** What stands behind a raster address: the model file, and the card it belongs to (0 = not stated). */
export type ModelBehind = { modelUrl: string; techCardId: number };

/** Пустая карта — один экземпляр: новая на каждый рендер пересобирала бы всех потребителей. */
const EMPTY: ReadonlyMap<string, ModelBehind> = new Map();

export const ThreedModelIndexContext = createContext<ReadonlyMap<string, ModelBehind>>(EMPTY);

/** Адрес без запроса и якоря — по нему индекс и кладёт, и ищет. */
function pathKey(url?: string | null): string {
  const raw = (url ?? '').trim();
  if (!raw) return '';
  return raw.split('?')[0].split('#')[0];
}

/**
 * ПОСТРОЕНИЕ ИНДЕКСА ПО ПОЛОСЕ. Читатель выходов взят ОБЩИЙ (`outputsOfKind`), а свод пары —
 * `threedResults`: второй способ считать разошёлся бы с первым молча в тот день, когда маршрут
 * начнёт возвращать что-то третье.
 */
export function threedModelIndex(band?: GetDesignBandResponse | null): ReadonlyMap<string, ModelBehind> {
  if (!band) return EMPTY;
  const out = new Map<string, ModelBehind>();
  const put = (url: string | undefined, entry: ModelBehind) => {
    const key = pathKey(url);
    // ПЕРВЫЙ ПОБЕЖДАЕТ. Один и тот же растр, приставший к двум прогонам, физически невозможен
    // (`threedResults` присваивает миниатюру ровно одной модели), но правило записано, чтобы
    // порядок обхода не решал молча.
    if (key && !out.has(key)) out.set(key, entry);
  };
  for (const result of threedResults(outputsOfKind(band, 'threed'))) {
    if (!result.modelUrl) continue;
    const entry: ModelBehind = {
      modelUrl: result.modelUrl,
      techCardId: result.model?.techCardId ?? result.poster?.techCardId ?? 0,
    };
    put(result.modelUrl, entry);
    if (!result.poster) continue;
    const media = result.poster.media?.media;
    put(media?.thumbnail?.mediaUrl, entry);
    put(media?.compressed?.mediaUrl, entry);
    put(media?.fullSize?.mediaUrl, entry);
  }
  return out;
}

/**
 * ЗА ЭТИМ АДРЕСОМ СТОИТ ФАЙЛ МОДЕЛИ — или пусто.
 *
 * Пусто — первоклассный ответ и означает «эта плитка рисует картинку, и клик по ней открывает
 * картинку». Вне провайдера тоже пусто: стенд, монтирующий одну плитку, ведёт себя как экран, у
 * которого 3D-прогонов нет вовсе.
 */
export function useModelBehind(url?: string | null): string {
  const index = useContext(ThreedModelIndexContext);
  const key = pathKey(url);
  if (!key) return '';
  return index.get(key)?.modelUrl ?? '';
}

/**
 * THE CARD A MODEL BELONGS TO, by the model's own address — or 0 when the band never stated it.
 *
 * Zero is a truthful «not stated», not a card: the modal reads it and draws its snapshot doors
 * inert with that reason instead of filing a picture onto card 0.
 */
export function useModelCard(modelUrl?: string | null): number {
  const index = useContext(ThreedModelIndexContext);
  const key = pathKey(modelUrl);
  if (!key) return 0;
  return index.get(key)?.techCardId ?? 0;
}
