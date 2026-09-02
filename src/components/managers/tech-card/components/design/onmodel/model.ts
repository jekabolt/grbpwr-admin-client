import type {
  GetDesignBandResponse,
  common_DesignColourRecipe,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';

import { runRepresentation } from '../bench-kinds';
import { formatMoney } from '../generation/money';
import { isPictureHidden } from '../visibility';
import { fabricStatement, type Gate } from '../render/model';

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
 */
export function recolorOutputs(
  band: GetDesignBandResponse,
): { picture: common_DesignPicture; run: common_DesignRun }[] {
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

/* ─────────────────────────── цена, названная до нажатия ─────────────────────────── */

/** Во что обошёлся ПОСЛЕДНИЙ закончившийся рекол этой карточки — свидетельство, не прогноз. */
export type RecolorCharge = {
  runId: number;
  /** `$0.09`, уже отформатировано. Пусто здесь не бывает: см. `lastRecolorCharge`. */
  money: string;
  /** Сколько картинок он вернул. 0 = прогон ничего не отдал, и строка тогда не строится. */
  pictures: number;
};

/**
 * ВО ЧТО ОБОШЁЛСЯ ПОСЛЕДНИЙ ЗАКОНЧИВШИЙСЯ РЕКОЛ, или `null`.
 *
 * `null` — ПЕРВОКЛАССНЫЙ ОТВЕТ и означает три разные правды сразу: реколов на этой странице ленты
 * нет; они есть, но не закончились; или у читателя нет `costing:read` и все денежные поля с него
 * сняты. Ни одну из них нельзя рисовать нулём — «$0.00 за 3 снимка» читается как «бесплатно», а
 * это единственное, чего денежная строка говорить не смеет.
 *
 * ЧИТАЕТСЯ `price_actual`, А НЕ `price_estimate`: смета — то, что зарезервировали, факт — то, что
 * списали, включая ОПЛАЧЕННЫЕ НЕУДАЧНЫЕ ПОПЫТКИ. Свидетельство о цене обязано быть о деньгах,
 * которые ушли.
 */
export function lastRecolorCharge(band: GetDesignBandResponse): RecolorCharge | null {
  for (const run of recolorRuns(band)) {
    if ((run.status ?? '').trim().toLowerCase() !== 'done') continue;
    const money = formatMoney(run.priceActual, run.currency);
    if (!money) continue;
    const pictures = (run.pictures ?? []).length || (run.requestedOutputs ?? 0);
    if (pictures <= 0) continue;
    return { runId: run.id ?? 0, money, pictures };
  }
  return null;
}

/**
 * ФОРМА ЗАКАЗА ОДНОЙ СТРОКОЙ — то, что печатается рядом с кнопкой.
 *
 * Она называет ДВА числа и ни одного выдуманного: сколько картинок вернётся и сколько платных
 * вызовов за них заплатят. Эти два числа равны, и равенство — это и есть весь ответ на «почему
 * дорожает»: у соседних экранов один вызов покупает лист из четырёх видов, здесь каждый снимок
 * покупается отдельно.
 */
export function recolorShape(sources: number): string {
  // ПУСТОЙ НАБОР НАЗЫВАЕТ ПРАВИЛО, А НЕ ОТСУТСТВИЕ. Строка кнопки всегда кончается словами «priced
  // by the server when the run starts», и «nothing to buy · priced by the server» противоречило бы
  // само себе на пол-строки. Правило же верно всегда, и это ровно то, что человеку надо знать до
  // того, как он положит первый снимок.
  if (sources <= 0) return 'each photograph is one paid call';
  const s = sources === 1 ? '' : 's';
  return `${sources} picture${s} back · ${sources} paid call${s}, one per photograph`;
}

/* ─────────────────────────── ворота ─────────────────────────── */

/**
 * ПОЧЕМУ ЭТОТ ПРОГОН НЕЛЬЗЯ ОТПРАВИТЬ — и каждая причина ЗЕРКАЛИТ отказ, который сервер поставил
 * бы бесплатно, вместо того чтобы изобретать свои условия.
 *
 * ДВА ИЗ ТРЁХ ОТКАЗОВ НАЗВАНЫ КОНТРАКТОМ ПОИМЁННО: `no_source_picture` — ни одной фотографии в
 * `params.extra_input_media_ids`; `no_target_colour` — в `params.colour` не сказано ничего. Оба
 * FailedPrecondition-подобные и оба выносятся ДО резервирования, то есть стоят ноль. Ворота здесь
 * не заменяют их, а избавляют человека от круга: он видит, чего не хватает, рядом с органом,
 * который это добавляет.
 *
 * ⚠ ВОРОТА НИКОГДА НЕ ШИРЕ СЕРВЕРНЫХ. Любое условие, придуманное здесь и отсутствующее там,
 * запретило бы законный прогон, а обойти его можно перезагрузкой вкладки — то есть это была бы
 * помеха, а не защита.
 */
export function recolorGate(
  band: GetDesignBandResponse,
  sources: number,
  recipe: common_DesignColourRecipe | null | undefined,
): Gate {
  if (sources <= 0) {
    return {
      ok: false,
      reason:
        'no photograph yet — a recolour changes the colour of a picture that already exists, so it needs at least one. Add the shots above; several sides of the same garment are the ordinary case',
    };
  }
  if (sources > RECOLOR_SOURCES_MAX) {
    return {
      ok: false,
      reason: `${sources} photographs in one run — the server takes at most ${RECOLOR_SOURCES_MAX} and refuses the rest before anything is charged. Take some out, or run them in two goes`,
    };
  }
  if (!targetColourIsStated(recipe)) {
    return {
      ok: false,
      reason:
        'no target colour stated — pick one from the dictionary, type a hex, or describe it in words. The server refuses a recolour with no colour named: «change the colour» with nothing named is a request a model answers with any shade at all, at full price',
    };
  }
  return { ok: true };
}

/**
 * СКАЗАН ЛИ ЦЕЛЕВОЙ ЦВЕТ — И ЭТО НЕ `recipeIsStated`.
 *
 * Тот общий предикат считает рецепт заявленным, если сказано ЛЮБОЕ из трёх, ФОТОГРАФИЮ ТКАНИ
 * ВКЛЮЧАЯ, — и для фабрик-рендера это верно: лоскут действительно называет материал. Для рекола
 * фотография ткани не является целевым цветом ни в каком смысле, а контракт перечисляет
 * удовлетворяющие поля поимённо: «Any one of code / hex / words satisfies it». Взять сюда общий
 * предикат значило бы открыть ворота рецептом, в котором названа только ткань, и купить отказ
 * `no_target_colour` за круг по сети.
 */
export function targetColourIsStated(
  recipe: common_DesignColourRecipe | null | undefined,
): boolean {
  const stated = fabricStatement(recipe);
  return stated.colour || stated.words;
}
