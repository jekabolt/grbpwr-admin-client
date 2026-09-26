import type {
  GetDesignBandResponse,
  common_DesignColourRecipe,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';

import { fabricUses } from '../assets/model';
import { cardOutputRows, runRepresentation } from '../bench-kinds';
import { isPictureHidden } from '../visibility';
import { fabricStatement, hexIsPaintable, wireColourSource } from '../render/model';

/**
 * ═══ RECOLOR — THE `recolor` RUN'S SHARED READERS AND WRITERS (C-06) ════════════════════════════
 *
 * What outlived the ON MODEL screen. The screen is gone (its request is the PLAYGROUND workflow
 * Change a Color, `playground/registry/tiles/change-color.tsx`); the kind, its door, its money and
 * its outputs are not. Moved here verbatim from `onmodel/model.ts`, comments included, so the tile
 * and ARTIFACTS (`artifacts-panel.tsx`, `recolorOutputs`) read one neutral module instead of the
 * folder of a screen that no longer exists. Nothing below changed behaviour in the move.
 */

/**
 * ═══ ON MODEL — ЧТЕНИЕ ПОЛОСЫ ДЛЯ ЭКРАНА ПЕРЕКРАСКИ (K-17) ════════════════════════════════════
 *
 * Владелец: «раздел ON MODEL должен быть таким что мы можем загрузить фото реальное на модели с
 * разных сторон и нам можно будет поменять цвет вещи». И его же решение о том, КАК меняется цвет:
 * ГЕНЕРАЦИЕЙ. Не фильтром и не заливкой по маске — модель перекрашивает вещь, сохраняя переплетение
 * ткани, складки и тени. Поэтому у экрана свой род прогона, `recolor`, а не флаг на рендере: рендер
 * СОЧИНЯЕТ фотографию, которой не существует, а перекраска обязана не трогать ту, которая есть, и
 * две эти инструкции модели противоречат друг другу построчно.
 *
 * ЧТО ЗДЕСЬ ПРИНЦИПИАЛЬНО ИНАЧЕ, ЧЕМ У ДВУХ СОСЕДНИХ ЭКРАНОВ, — ЦЕНА. Фабрик-рендер покупает ОДИН
 * склеенный лист независимо от числа сторон; 3D покупает один поворотный стол. Перекраска покупает
 * ОДИН ПЛАТНЫЙ ВЫЗОВ НА КАЖДЫЙ СНИМОК, и каждый вызов видит только свою фотографию. То есть цена
 * растёт ЛИНЕЙНО по числу снимков — единственное место в полосе, где это так, — и человек обязан
 * прочитать это ДО нажатия, а не узнать из счёта.
 *
 * ЧИСЛА ЦЕНЫ ЗДЕСЬ НЕТ И БЫТЬ НЕ МОЖЕТ, И ЭТО НЕ УМОЛЧАНИЕ. `price_estimate` и `price_actual`
 * OUTPUT-ONLY: сервер резервирует против дня в момент отправки, и НИ ОДНО поле провода не несёт
 * цену прогона, который ещё не заказан. Поэтому экран называет то, что знает точно, — СКОЛЬКО
 * ПЛАТНЫХ ВЫЗОВОВ он покупает, — и отдельно приводит СВИДЕТЕЛЬСТВО: во что обошёлся последний
 * закончившийся рекол ЭТОЙ карточки. Свидетельство названо прошедшим временем; выдать его за
 * прогноз значило бы придумать тариф, а придуманное число ошибается молча.
 */

/**
 * Потолок снимков в одном прогоне. Число — серверное (потолок референсов снимка входов), и отказ
 * по нему бесплатный: `StartDesignRun` отвергает перебор до всякого резервирования.
 *
 * ⚠ КЛИЕНТСКАЯ ПРОВЕРКА ЗДЕСЬ — ЭКОНОМИЯ КРУГА, А НЕ ЗАЩИТА. Настоящий предел живёт на сервере;
 * если он разойдётся с этим числом, победит сервер, а его слова экран покажет дословно.
 */
export const RECOLOR_SOURCES_MAX = 24;

/**
 * Прогоны перекраски этой страницы ленты, новые раньше — порядок самой полосы.
 *
 * РОД СПРАШИВАЕТСЯ У ОБЩЕГО СЛОВАРЯ (`runRepresentation`), а не сравнивается со строкой на месте
 * (G-1): `onmodel` — то же представление, которым ряд представлений считает свою ячейку «on model»
 * и которым фильтр истории выбирает эти же строки. Единственный род прогона, дающий `onmodel`, —
 * `recolor`, поэтому свёртка точная, а не приблизительная.
 */
export function recolorRuns(band: GetDesignBandResponse): common_DesignRun[] {
  return (band.runs ?? []).filter((run) => runRepresentation(run) === 'onmodel');
}

/**
 * КАЖДЫЙ ВЫВОД ПЕРЕКРАСКИ ЭТОЙ СТРАНИЦЫ — плитки блока результатов.
 *
 * РОД ЧИТАЕТСЯ С ПРОГОНА, А НЕ С КАРТИНКИ, по тому же доводу, что и везде в полосе: контракт
 * замораживает словарь `DesignRun.kind`, а `DesignPicture.kind` — открытая строка. И здесь это не
 * теория: вывод рекола ПРИХОДИТ С `kind: "render"` — у карточки нет отдельного рода для
 * перекрашенного снимка, — так что фильтр по картинке сложил бы перекраски в один список с
 * фабрик-рендерами, а `ghost_view` у них пуст, и различить их было бы нечем.
 *
 * ═══ СНИМКИ ВСЕЙ КАРТОЧКИ, А НЕ ЭТОЙ СТРАНИЦЫ ЛЕНТЫ (H-9) ════════════════════════════════════
 *
 * Тот же охват, что у рендеров и плиток, и та же причина. Здесь у него есть и своя цена: рекол —
 * единственный экран полосы, где КАЖДЫЙ снимок стоит отдельного платного вызова, так что снимок,
 * выпавший со страницы ленты, — это оплаченная работа, пропавшая с экрана, который её показывает.
 *
 * ⚠ ЛОВУШКА `recolor → render` ЗАКРЫТА НА ШТАМПЕ, А НЕ ЗДЕСЬ. Общий читатель классифицирует строку
 * по роду ПРОГОНА (`run_kind`), который контракт кладёт в каждый выход именно затем, чтобы это
 * различение пережило уход прогона со страницы. Читай он `picture.kind`, перекраски всей карточки
 * легли бы в RENDERS OF THIS CARD, а этот раздел опустел бы — ровно наоборот тому, что чинится.
 *
 * `recolorRuns` рядом НАМЕРЕННО остаётся постраничным: он отвечает на вопрос о ПРОГОНАХ («какие
 * живы, какие пали, во что обошёлся последний»), а живой прогон по определению новейший и со
 * страницы не выпадает. Деньги и состояния — свойства прогона, и брать их из штампа было бы
 * вымыслом: у штампа их нет.
 */
export function recolorOutputs(
  band: GetDesignBandResponse,
): { picture: common_DesignPicture; run: common_DesignRun }[] {
  const whole = cardOutputRows(band, 'onmodel');
  if (whole) return whole;

  const out: { picture: common_DesignPicture; run: common_DesignRun }[] = [];
  for (const run of recolorRuns(band)) {
    for (const picture of run.pictures ?? []) {
      if (isPictureHidden(picture)) continue;
      if ((picture.id ?? 0) <= 0) continue;
      out.push({ picture, run });
    }
  }
  return out;
}

/**
 * ═══ ЦВЕТ ПРОГОНА — ОДИН ОБЪЕКТ, КОТОРЫЙ ЭКРАН СУДИТ, ПЕЧАТАЕТ И ОТПРАВЛЯЕТ ══════════════════
 *
 * ЭТО ЕДИНСТВЕННЫЙ ПИСАТЕЛЬ `params.colour` ЭТОГО ЭКРАНА, и он чистый. Ворота, строка у кнопки,
 * заголовок-заявление и опись перед деньгами читают РОВНО ЕГО РЕЗУЛЬТАТ, а не каждый свою
 * реконструкцию черновика. Дефект ровно этой формы стоил недели на соседнем экране: подпись
 * говорила «плиты не едут», а тело запроса говорило «шли все».
 *
 * ⚠ `fabric_media_id` ЗДЕСЬ НЕ ЭХО ДЛЯ КРАСОТЫ — БЕЗ НЕГО ТКАНЬ НЕ УЕЗЖАЕТ ВОВСЕ, А ПРОМПТ ВСЁ
 * РАВНО ГОВОРИТ «IMAGE 2». Замерено по задеплоенному бэкенду (`origin/beta`, `designgen`):
 *
 *   · воркер выбирает ремесло по ЗАМОРОЖЕННЫМ параметрам: `clothsWithTexture(p)` смотрит на
 *     `colour.fabrics[].media_id` и при непустом списке ставит `reclothCraft` — «the garment made
 *     of the cloth in image 2»;
 *   · а ВЛОЖЕНИЯ собирает `referenceList`, и у прогона с ОДНОЙ тканью он прикладывает
 *     `p.Colour.FabricMediaID` — скаляр, а не `fabrics[0].media_id` (ветка `len(cloths) < 2`);
 *   · `clothPictures` затем отбирает из этого списка по `fabrics[].media_id`.
 *
 * То есть при `fabrics=[{mediaId:3101}]` и `fabricMediaId:0` список пуст, `ClothReferences` пуст,
 * вызов уезжает одной картинкой — и всё это НА ОПЛАЧЕННОМ прогоне, чей промпт указывает на
 * картинку, которой нет. Дверь такой прогон НЕ ловит: она проверяет `fabrics`, а не скаляр.
 * Единственная защита — эта строка.
 *
 * ⚠ ТКАНЬ БЕЗ КАРТИНКИ ОТСЕИВАЕТСЯ И ЗДЕСЬ, хотя ряд её и не предлагает. Ряд — это UI, а это
 * дверь на провод; предикат тот же, что у сервера (`media_id > 0`), и стоит он там, где
 * собирается тело.
 */
export function recolourWireColour(
  band: GetDesignBandResponse,
  recipe: common_DesignColourRecipe,
  clothAssetId: number,
): common_DesignColourRecipe {
  const fabrics =
    clothAssetId > 0 ? fabricUses(band, [clothAssetId]).filter((f) => (f.mediaId ?? 0) > 0) : [];
  const built: common_DesignColourRecipe = {
    ...recipe,
    /**
     * ⚠ ТОТ ЖЕ ИНВАРИАНТ, ЧТО У ФАБРИК-РЕНДЕРА: орган выбора цвета у двух экранов ОДИН, значит и
     * полунабранный hex сюда приходит тот же. Сервер считает цвет заявленным по ЛЮБОМУ непустому
     * hex, а этот экран — по `hexIsPaintable`; без этой строки «#a41f2» уезжал бы целевым цветом,
     * которого свотч над ним не признаёт. Дверь ПРОПУСКАЕТ, а не достраивает.
     */
    hex: hexIsPaintable(recipe.hex) ? (recipe.hex ?? '').trim() : '',
    fabrics,
    fabricMediaId: fabrics[0]?.mediaId ?? 0,
  };
  // ВЫВЕДЕНО ПОСЛЕ СБОРКИ, А НЕ ДО: `wireColourSource` читает `fabricMediaId`, и вызов над
  // черновиком дал бы «источник» рецепта, которого на провод не уедет.
  return { ...built, source: wireColourSource(built) };
}

/* ─────────────────────────── цена, названная до нажатия ─────────────────────────── */

/**
 * ФОРМА ЗАКАЗА ОДНОЙ СТРОКОЙ — то, что печатается рядом с кнопкой.
 *
 * Она называет ДВА числа и ни одного выдуманного: сколько картинок вернётся и сколько платных
 * вызовов за них заплатят. Эти два числа равны, и равенство — это и есть весь ответ на «почему
 * дорожает»: у соседних экранов один вызов покупает лист из четырёх видов, здесь каждый снимок
 * покупается отдельно.
 */
export function recolorShape(sources: number, colour?: common_DesignColourRecipe | null): string {
  /**
   * ⚠ ЧТО ИМЕННО СДЕЛАЮТ С КАЖДЫМ СНИМКОМ — ЗДЕСЬ, И ЧИТАЕТСЯ ЭТО С ТЕЛА ЗАПРОСА (J-31).
   * Строка собирается из `recolourWireColour` — того самого объекта, который уедет, — потому что
   * «переодели» и «перекрасили» это два РАЗНЫХ платных промпта на сервере (`reclothCraft` против
   * `recolorCraft`), и выбирает между ними ровно наличие ткани с картинкой в `params.colour`.
   * Строка, собранная из черновика, могла бы обещать одно, а купить другое.
   */
  const cloth = (colour?.fabrics ?? []).find((f) => (f.mediaId ?? 0) > 0);
  const hex = (colour?.hex ?? '').trim();
  const code = (colour?.code ?? '').trim();
  const tint = code || hex;
  const did = cloth
    ? tint
      ? `re-clothed in ${(cloth.name ?? '').trim() || 'the picked texture'}, re-tinted to ${tint}`
      : `re-clothed in ${(cloth.name ?? '').trim() || 'the picked texture'}`
    : tint
      ? `recoloured to ${tint}`
      : (colour?.words ?? '').trim()
        ? 'recoloured to the colour described in words'
        : '';
  // ПУСТОЙ НАБОР НАЗЫВАЕТ ПРАВИЛО, А НЕ ОТСУТСТВИЕ. Строка кнопки всегда кончается словами «priced
  // by the server when the run starts», и «nothing to buy · priced by the server» противоречило бы
  // само себе на пол-строки. Правило же верно всегда, и это ровно то, что человеку надо знать до
  // того, как он положит первый снимок. А ЧТО СДЕЛАЮТ — известно и до первого снимка (D-14):
  // ткань и цвет выбираются раньше фотографий, и строка называет их с той же секунды.
  const head =
    sources <= 0
      ? 'each photograph is one paid call'
      : `${sources} picture${sources === 1 ? '' : 's'} back · ${sources} paid call${sources === 1 ? '' : 's'}, one per photograph`;
  return did ? `${head} · ${did}` : head;
}

/* ─────────────────────────── ворота ─────────────────────────── */

/**
 * ЧТО СЧИТАЕТСЯ НАЗВАННОЙ ЦЕЛЬЮ НА ЭТОМ ЭКРАНЕ — И ЭТО НЕ `recipeIsStated`.
 *
 * ⚠ ПРЕДИКАТ РАСШИРЕН ВМЕСТЕ С ДВЕРЬЮ, А НЕ ВМЕСТО НЕЁ (J-31). До этой волны цель могла быть
 * названа только цветом или словами, и общий `recipeIsStated` был здесь ШИРЕ серверного правила:
 * он считал фотографию ткани достаточной, а `no_target_colour` — нет. Теперь дверь считает ткань
 * с картинкой законной целью прямым текстом («…or a cloth with a picture in
 * params.colour.fabrics»), и предикат следует за ней.
 *
 * ⚠ НО НЕ ДО `recipeIsStated`, И РАЗНИЦА ЖИВАЯ. Тот считает заявлением скаляр `fabric_media_id`
 * САМ ПО СЕБЕ; сервер же смотрит на `fabrics[].media_id`. Рецепт, у которого заполнен только
 * скаляр, открыл бы здесь ворота и получил бы `no_target_colour` за круг по сети.
 */
export function targetIsStated(recipe: common_DesignColourRecipe | null | undefined): boolean {
  const stated = fabricStatement(recipe);
  if (stated.colour || stated.words) return true;
  return (recipe?.fabrics ?? []).some((f) => (f.mediaId ?? 0) > 0);
}
