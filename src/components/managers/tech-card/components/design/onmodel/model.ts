import type {
  GetDesignBandResponse,
  common_DesignColourRecipe,
  common_DesignPicture,
  common_DesignRun,
  common_Fitting,
  common_MediaFull,
} from 'api/proto-http/admin';

import {
  assetFull,
  assetIsPattern,
  assetLabel,
  assetThumb,
  clothShelf,
  fabricUses,
  normaliseHex,
} from '../assets/model';
import { cardOutputRows, runRepresentation } from '../bench-kinds';
import { formatMoney } from '../generation/money';
import { isPictureHidden } from '../visibility';
import {
  EMPTY_RECIPE,
  archivedColorwayGate,
  fabricStatement,
  hexIsPaintable,
  wireColourSource,
  type Gate,
} from '../render/model';

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

/* ─────────────────────────── ТКАНЬ, В КОТОРУЮ ПЕРЕОДЕВАЮТ (J-31) ─────────────────────────── */

/**
 * ═══ ОДНА ПЛИТКА НА ПРОГОН, И ЭТО ФОРМА СОСТОЯНИЯ, А НЕ ПРАВИЛО ПОВЕРХ НЕГО ══════════════════
 *
 * Владелец, дословно: «ON MODEL у нас должна быть возможность загрузить несколько фото на модели
 * в нашей вещи и выбрать и или паттерн/цвет и результатом должен быть уже то что там вещь
 * поменяла цвет ткань и тд». Жест единственного числа: паттерн — один, цвет — один, фотографий
 * сколько угодно.
 *
 * ⚠ И СЕРВЕР ОТКАЗЫВАЕТ ВТОРОЙ ПЛИТКЕ ПОИМЁННО. `one_cloth_only` (`design_run.go`, до резерва):
 * «a recolour re-dresses the garment in ONE cloth … the instruction names exactly one («the
 * garment made of the cloth in image 2»)». Значит выразить две — это выразить прогон, который
 * человек не может запустить. Поэтому выбор здесь — ЧИСЛО (`assetId`), а не список: не «список,
 * который мы обещаем не отращивать», а тип, в котором второй плитки нет.
 *
 * ⚠ ПЛИТКА БЕЗ КАРТИНКИ НЕ ПРЕДЛАГАЕТСЯ ВОВСЕ. Второй серверный отказ, `cloth_without_picture`:
 * «a cloth stated in words alone cannot be laid on a photograph». Ткань уезжает ВТОРОЙ КАРТИНКОЙ
 * вызова, и ткань без `media_id` не уезжает никуда.
 *
 * ⚠ И ТРЕТИЙ ОТКАЗ — ЕДИНСТВЕННЫЙ, КОТОРЫЙ ЖЕСТ ЧЕЛОВЕКА ВСЁ ЕЩЁ МОЖЕТ ПОСТРОИТЬ.
 * `cloth_is_also_a_photograph`: медиа, названное И фотографией к перекрасу, И тканью, дало бы
 * вызов `[9.png, 9.png]` — одна картинка дважды в одном платном запросе. Порядок жестов тут
 * решает всё: выбрать плитку, а ПОТОМ добавить её же из библиотеки снимком — законная
 * последовательность двух законных нажатий. Поэтому правило стоит В ОБЕ СТОРОНЫ: плитка,
 * совпавшая со снимком, выключается в ряду с названной причиной, а ворота отказывают, если она
 * уже выбрана.
 */
export interface ClothChoice {
  assetId: number;
  mediaId: number;
  name: string;
  thumb: string;
  /** Полный адрес картинки — для зума с плитки; пусто, если у ассета его нет. */
  full: string;
  /** Плитка набивки (с раппортом), а не фотография лоскута. Слово на плитке и число в промпте. */
  pattern: boolean;
  repeatMm: number;
  /** Непусто — плитку выбрать нельзя, и это причина словами. Пусто — выбирается. */
  blocked: string;
}

/**
 * ТЕКСТУРЫ ЭТОЙ КАРТОЧКИ, ПРИГОДНЫЕ ДЛЯ ПЕРЕОДЕВАНИЯ, — ТА ЖЕ ПОЛКА, ЧТО У FABRIC RENDER (D-14).
 *
 * Владелец, дословно: «ON MODEL так же должен принимать колор и текстур инпут как FABRIC RENDER».
 *
 * Здесь стояло `shelfAssets(band, ASSET_PATTERN)` — одни плитки набивки, по J-31 («выбрать и или
 * паттерн/цвет»). Полка фабрик-рендера — `clothShelf`: ткани И паттерны, потому что для модели
 * «из чего сшито» и «чем покрыто» один вопрос; сервер кладёт в вызов перекраса ЛЮБУЮ ткань с
 * картинкой («the garment made of the cloth in image 2») и отказывает только ткани БЕЗ картинки
 * (`cloth_without_picture`). Сузить полку здесь значило бы, что фотография лоскута, снятая руками
 * на FABRIC RENDER, на ON MODEL невидима — та же потеря доступа к данным, которую `clothShelf`
 * однажды уже закрывал (Д-1). Читатель ОДИН на оба экрана; порядок — паттерны первыми, как в
 * сетке фабрик-рендера, и по той же причине: плитка набивки на этих экранах главнее лоскута.
 */
export function clothChoices(
  band: GetDesignBandResponse,
  photoMediaIds: readonly number[],
): ClothChoice[] {
  const photos = new Set(photoMediaIds.filter((id) => id > 0));
  const shelf = clothShelf(band);
  const ordered = [...shelf.filter(assetIsPattern), ...shelf.filter((a) => !assetIsPattern(a))];
  const out: ClothChoice[] = [];
  for (const asset of ordered) {
    const mediaId = asset.mediaId ?? 0;
    // Текстура без картинки не показывается: класть на фотографию нечего, и сервер отказал бы
    // `cloth_without_picture`. Предлагать её значило бы предлагать мёртвый выбор.
    if (mediaId <= 0) continue;
    out.push({
      assetId: asset.id ?? 0,
      mediaId,
      name: assetLabel(asset),
      thumb: assetThumb(asset),
      full: assetFull(asset),
      pattern: assetIsPattern(asset),
      repeatMm: asset.repeatMm ?? 0,
      blocked: photos.has(mediaId)
        ? `this texture is also one of the photographs above (media ${mediaId}) — one call cannot carry the same picture twice. Take it out of the photographs, or pick another texture`
        : '',
    });
  }
  return out;
}

/** Выбранная плитка среди предложенных, или `null`. */
export function chosenCloth(choices: readonly ClothChoice[], assetId: number): ClothChoice | null {
  if (assetId <= 0) return null;
  return choices.find((c) => c.assetId === assetId) ?? null;
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
    clothAssetId > 0
      ? fabricUses(band, [clothAssetId]).filter((f) => (f.mediaId ?? 0) > 0)
      : [];
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
  photoMediaIds: readonly number[],
  /**
   * ⚠ ТЕЛО ЗАПРОСА, А НЕ ЧЕРНОВИК. Ворота судят РОВНО ТОТ объект, который уедет
   * (`recolourWireColour`), и по той же причине, по которой его же печатает строка у кнопки:
   * ворота, судящие черновик, и провод, везущий выведенное из него, — это два утверждения об
   * одном прогоне, и расходятся они молча.
   */
  colour: common_DesignColourRecipe,
): Gate {
  const sources = photoMediaIds.length;
  if (sources <= 0) {
    return {
      ok: false,
      reason:
        'no photograph yet — an on-model run works on a picture that already exists, so it needs at least one. Add the shots above; several sides of the same garment are the ordinary case',
    };
  }
  if (sources > RECOLOR_SOURCES_MAX) {
    return {
      ok: false,
      reason: `${sources} photographs in one run — the server takes at most ${RECOLOR_SOURCES_MAX} and refuses the rest before anything is charged. Take some out, or run them in two goes`,
    };
  }
  /**
   * ⚠ ЗЕРКАЛО `cloth_is_also_a_photograph`, И ЭТО ЕДИНСТВЕННЫЙ ИЗ ЧЕТЫРЁХ ТКАНЕВЫХ ОТКАЗОВ,
   * КОТОРЫЙ ЖЕСТ ЧЕЛОВЕКА ЕЩЁ МОЖЕТ ПОСТРОИТЬ. Ряд плиток выключает совпавшую плитку, но порядок
   * обратный — сначала выбрать плитку, потом добавить её же снимком из библиотеки — это два
   * законных нажатия, между которыми ничего не запрещено. Сервер отказал бы бесплатно; ворота
   * избавляют от круга по сети и называют номер медиа, потому что чинится это одним жестом.
   */
  const dup = (colour.fabrics ?? []).find(
    (f) => (f.mediaId ?? 0) > 0 && photoMediaIds.includes(f.mediaId ?? 0),
  );
  if (dup) {
    return {
      ok: false,
      reason: `media ${dup.mediaId} is both a photograph to work on and the cloth to lay on it — one paid call cannot carry the same picture twice, and the server refuses this before anything is charged. Take it out of the photographs, or pick another texture`,
    };
  }
  if (!targetIsStated(colour)) {
    return {
      ok: false,
      reason:
        'nothing to re-dress it in — pick a texture, pick a colour, or describe one in words. The server refuses a run that names none of them: «change the cloth» with nothing named is a request a model answers with any cloth at all, at full price',
    };
  }
  return { ok: true };
}

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

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   ON MODEL · THE ASIDE — one photograph, one paint, one paid call (studio v3, `_step-aside.js`).

   TWO AXES, BOTH SPOKEN OUT LOUD ON THE SCREEN:
     WHAT IS REPAINTED   a strip of shots, fitting | library     up to RECOLOR_SOURCES_MAX
     WHAT IT IS PAINTED  a cloth, a colour, or BOTH TOGETHER

   ⚠ THE SHOT IS A LIST AGAIN, AND THE ROUND BEFORE THIS ONE WAS WRONG ABOUT IT (r3 п.42). This
   header used to argue that «one shot is a GRAMMAR, not a cap» and that the strip «counted
   something that no longer exists on this screen». The owner answered the argument by name: up to
   24 photographs per run, the strip back. The wire never changed — `extra_input_media_ids` is a
   list and always was — so what the slot did was narrow a screen to a fraction of a contract the
   server had open the whole time, and a person with four sides of one garment paid four visits to
   this screen to buy what one visit buys.

   THE PRICE IS A TARIFF, NOT A SUM, AND THE SCREEN DOES NOT MULTIPLY IT. Each photograph is its
   own paid call; this admin owns no tariff (`price_estimate` is output-only), so the shape beside
   GENERATE says «one call per photograph» and never `N × money`. A number of dollars printed from
   `shots.length` would be an invention (pool item, r3).

   THE COLOURWAY IS NOT REQUIRED. Under `colour` there is no colourway at all: the person named a
   colour, not a pair «cloth and colour». It is a LINK written on the picture that comes back
   (`params.colorway_id` → the output declares itself a render of that colourway), never a word in
   the prompt — the studio's one colourway organ on the rail picks it; this screen reads it.
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

export type ShotSource = 'fitting' | 'library';

/** The photograph this run repaints, with what the card knows about it and does NOT send. */
export type OnModelShot = {
  media: common_MediaFull;
  source: ShotSource;
  /** The fitting the shot was taken from; `0` for a library picture. */
  fittingId: number;
  /** `12 Aug` — printed on the card, kept off the wire. Empty for a library picture. */
  stamp: string;
  /** `M` / `M · L` — the sample size(s) tried on. Empty when the fitting names none. */
  size: string;
};

/**
 * WHAT THE PHOTOGRAPH IS PAINTED IN — A CLOTH, A COLOUR, OR BOTH (r3 п.43).
 *
 * ⚠ «ONE OF THREE» IS GONE, AND IT WAS NEVER THE SERVER'S RULE. The state used to hold a `mode`
 * that made the two axes exclusive: a texture pick wiped the colour and a colour pick wiped the
 * texture. The server takes both in one call and has a name for the result — «the garment made of
 * the cloth in image 2», re-tinted to the stated colour (`recolorShape` has printed that exact
 * sentence, «re-clothed in X, re-tinted to Y», the whole time). Exclusivity was a client rule with
 * no owner; the owner has now refused it in as many words.
 *
 * `assetId` is a NUMBER, not a list: the server refuses two cloths (`one_cloth_only`) and a type
 * that cannot express the second one is worth more than a rule that promises not to add it.
 *
 * `code` IS THE PANTONE REFERENCE, AND IT IS THE DESCRIPTION (r3 п.43/23: «пантон и есть
 * описание»). E-11 stripped `code` at this screen's door on a premise that has expired: it was
 * stripped because a NAME could arrive from a recipe chip without the person ever seeing it. The
 * colour is now picked by its reference, in a picker that shows nothing else, so the name on the
 * wire is the name under the picker's own trigger — see `paintWire`.
 */
export type OnModelPaint = {
  assetId: number;
  hex: string;
  code: string;
};

export const NO_PAINT: OnModelPaint = { assetId: 0, hex: '', code: '' };

/** One photograph of one fitting — what the «from the fittings» chooser lists. */
export type FittingShot = {
  fittingId: number;
  round: number;
  stamp: string;
  size: string;
  media: common_MediaFull;
};

const ZERO_TIMESTAMP = '0001-01-01T00:00:00Z';

/** `12 Aug` — the day of a fitting, as the prototype prints it. Empty for an unset stamp. */
export function fittingDayStamp(stamp?: string | null): string {
  if (!stamp || stamp === ZERO_TIMESTAMP) return '';
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date);
}

/**
 * THE PHOTOGRAPHS OF THIS CARD'S FITTINGS, one row per picture, newest fitting first — the order
 * `ListFittings` already returns. A fitting without pictures contributes nothing: there is
 * nothing on it to repaint. The sizes are named through the dictionary the composer holds.
 */
export function fittingShots(
  fittings: readonly common_Fitting[] | undefined,
  sizeName: (id: number) => string,
): FittingShot[] {
  const out: FittingShot[] = [];
  for (const row of fittings ?? []) {
    const f = row.fitting;
    const id = row.id ?? 0;
    if (id <= 0) continue;
    const size = (f?.sizes ?? [])
      .map((s) => sizeName(s.sizeId ?? 0))
      .filter(Boolean)
      .join(' · ');
    const stamp = fittingDayStamp(f?.fittingDate);
    for (const media of row.media ?? []) {
      if ((media.id ?? 0) <= 0) continue;
      out.push({ fittingId: id, round: f?.roundNumber ?? 0, stamp, size, media });
    }
  }
  return out;
}

/** How many fittings of this card carry at least one photograph — the number on the chip. */
export function fittingsWithShots(shots: readonly FittingShot[]): number {
  return new Set(shots.map((s) => s.fittingId)).size;
}

/** `fitting on 12 Aug` / `fitting 2` / `picture 4012` — the name a shot goes by on this screen. */
export function shotName(shot: OnModelShot | null): string {
  if (!shot) return '';
  if (shot.source === 'fitting') {
    return shot.stamp ? `fitting on ${shot.stamp}` : `fitting ${shot.fittingId}`;
  }
  return `picture ${shot.media.id ?? 0}`;
}

/**
 * ═══ THE ONE OBJECT THE GATE JUDGES, THE ROW PRINTS AND THE WIRE CARRIES (J-31) ═══════════════
 *
 * `params.colour`, built from the paint by the same function that built it last round
 * (`recolourWireColour`): under `texture` the cloth rides in `fabrics` (+ the `fabric_media_id`
 * echo the worker reads), under `colour` the hex rides bare. `code` is stripped at this one door
 * (E-11: no colour NAME leaves this screen); `words` stays empty — the prototype draws no free
 * text here, and on this screen the field would mean COLOUR, never cloth (invariant 8).
 */
export function paintWire(
  band: GetDesignBandResponse,
  paint: OnModelPaint,
): common_DesignColourRecipe {
  const recipe: common_DesignColourRecipe = {
    ...EMPTY_RECIPE,
    hex: paint.hex,
    /**
     * ⚠ THE PANTONE REFERENCE RIDES, AND THAT IS A CHANGE OF PREMISE, NOT A RELAXATION (r3 п.43).
     * E-11 stripped `code` here because the colour organ of the day (the recipe chips of the
     * render's colour-statement row, itself gone since) could hand back a NAME with a value, and
     * this screen showed
     * no name — «the screen would buy a prompt with a name the person never saw». The colour is
     * now picked by its reference alone, and that reference is printed on the picker's trigger and
     * under the swatch. The prompt quotes the pair («18-1248 TCX — the exact value is #9a8b7f»),
     * which is what a Pantone number is FOR: a colour named the same way in the dyehouse.
     */
    code: paint.code,
  };
  // BOTH AXES AT ONCE. `recolourWireColour` already merges them — the cloth into `fabrics` (+ the
  // `fabric_media_id` echo the worker reads) and the hex bare — so nothing here decides between
  // them; that decision was the client's own and is gone.
  return recolourWireColour(band, recipe, paint.assetId);
}

/**
 * `texture "nylon twill"` / `colour #8D3A33` / `''` — the paint in words, ONE spelling for the
 * live row and for the inventory. Empty means «nothing is stated», which the inventory prints as
 * NOT SENT with its reason.
 */
export function paintText(colour: common_DesignColourRecipe): string {
  const cloth = (colour.fabrics ?? []).find((f) => (f.mediaId ?? 0) > 0);
  const clothWord = cloth ? `texture "${(cloth.name ?? '').trim() || 'the picked cloth'}"` : '';
  const code = (colour.code ?? '').trim();
  const hex = normaliseHex(colour.hex);
  const colourWord = code ? `colour ${code}` : hex ? `colour ${hex.toUpperCase()}` : '';
  // BOTH, WHEN BOTH ARE STATED (r3 п.43). One of the two spellings printed alone would be the old
  // exclusive screen speaking over the new body of the request.
  return [clothWord, colourWord].filter(Boolean).join(' · ');
}

/** The words on the group pill: which axes are stated, or that neither is. */
export function paintModeWord(paint: OnModelPaint): string {
  const cloth = paint.assetId > 0;
  const colour = !!paint.code.trim() || hexIsPaintable(paint.hex);
  if (cloth && colour) return 'a cloth and a colour';
  if (cloth) return 'a cloth off the shelf';
  if (colour) return 'a colour';
  return 'nothing picked';
}

/* ─────────────────────────── the gate, with its doors ─────────────────────────── */

export type OnModelDoor = 'photo' | 'paint';

export type OnModelGate =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      /** Where the refusal is lifted. Absent = the exit is already on the rail (the colourway). */
      door?: OnModelDoor;
    };

/**
 * THE GATE ASKS EXACTLY TWO THINGS — is there something TO repaint, and something to repaint it
 * WITH — after the one refusal that is about the NAME, not the material (an archived colourway,
 * checked first: «add the shot» under a name that cannot buy is the wrong advice).
 *
 * The words are the prototype's; the conditions are the server's, mirrored so the person does
 * not buy a round trip for what is visible on screen (`no_source_picture`, `no_target_colour`,
 * `cloth_is_also_a_photograph` — this last one keeps `recolorGate`'s wording, which names the
 * media number the person has to take out).
 */
export function onModelGate(
  /** THE WHOLE STRIP, in the order it will leave — the same list `extra_input_media_ids` carries. */
  shotMediaIds: readonly number[],
  colour: common_DesignColourRecipe,
  colorwayArchived: boolean,
  colorwayLabel: string,
): OnModelGate {
  const named = archivedColorwayGate(colorwayArchived, colorwayLabel, 'on-model picture');
  if (!named.ok) return { ok: false, reason: named.reason };
  const ids = shotMediaIds.filter((id) => id > 0);
  if (ids.length === 0) {
    return {
      ok: false,
      reason: 'nothing to repaint · pick photos from the fittings or upload some',
      door: 'photo',
    };
  }
  /**
   * THE CAP IS THE SERVER'S, AND IT IS SAID WITH ITS OWN WORDS. `recolorGate` already spells the
   * refusal the server would give for free; the strip cannot pass its ceiling by hand, but a
   * ⌘V of a dozen files can, and the run must not be bought to learn it.
   */
  if (ids.length > RECOLOR_SOURCES_MAX) {
    const server = recolorGate(ids, colour);
    return {
      ok: false,
      reason: server.ok ? `at most ${RECOLOR_SOURCES_MAX} photographs in one run` : server.reason,
      door: 'photo',
    };
  }
  const dup = (colour.fabrics ?? []).find((f) => ids.includes(f.mediaId ?? 0));
  if (dup) {
    const server = recolorGate(ids, colour);
    return {
      ok: false,
      reason: server.ok
        ? `media ${dup.mediaId} is both a photograph and the cloth to lay on it · pick another texture`
        : server.reason,
      door: 'paint',
    };
  }
  if (!targetIsStated(colour)) {
    return {
      ok: false,
      reason:
        'nothing to paint with · pick a cloth, make one, or choose a colour. Either one is enough, and both together are allowed',
      door: 'paint',
    };
  }
  return { ok: true };
}

/**
 * ═══ THE STRIP, GROWN BY A GESTURE — one place, so the cap and the duplicates are one answer ══
 *
 * Two doors add to it (the fittings chooser and the library, which hands several files at once)
 * and both land here. A photograph already in the strip is NOT added twice: the server refuses a
 * call carrying one media id twice, and the strip is `extra_input_media_ids` itself. Over the cap
 * the extras are DROPPED rather than queued — the caller says so out loud (`shot-group.tsx`).
 */
export function addShots(
  current: readonly OnModelShot[],
  incoming: readonly OnModelShot[],
): OnModelShot[] {
  const out = [...current];
  const seen = new Set(out.map((s) => s.media.id ?? 0));
  for (const next of incoming) {
    const id = next.media.id ?? 0;
    if (id <= 0 || seen.has(id)) continue;
    if (out.length >= RECOLOR_SOURCES_MAX) break;
    seen.add(id);
    out.push(next);
  }
  return out;
}

/** The ids of the strip, in its order — what the gate judges and the wire carries. */
export function shotMediaIds(shots: readonly OnModelShot[]): number[] {
  return shots.map((s) => s.media.id ?? 0).filter((id) => id > 0);
}

/** The product's `Gate` shape of the same answer — what the shared generate row reads. */
export function asRowGate(gate: OnModelGate): Gate {
  return gate.ok ? { ok: true } : { ok: false, reason: gate.reason };
}
