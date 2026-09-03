import type {
  GetDesignBandResponse,
  common_DesignColourRecipe,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';

import { ASSET_PATTERN, assetLabel, assetThumb, fabricUses, shelfAssets } from '../assets/model';
import { cardOutputRows, runRepresentation } from '../bench-kinds';
import { formatMoney } from '../generation/money';
import { isPictureHidden } from '../visibility';
import { fabricStatement, hexIsPaintable, wireColourSource, type Gate } from '../render/model';

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
  repeatMm: number;
  /** Непусто — плитку выбрать нельзя, и это причина словами. Пусто — выбирается. */
  blocked: string;
}

/**
 * ПЛИТКИ ЭТОЙ КАРТОЧКИ, ПРИГОДНЫЕ ДЛЯ ПЕРЕОДЕВАНИЯ.
 *
 * Полка спрашивается у ОБЩЕГО читателя (`shelfAssets(band, ASSET_PATTERN)`) — того же, которым
 * полку читают экран паттернов и ряд тканей фабрик-рендера. Свой фильтр `kind === 'pattern'`
 * рядом был бы вторым определением «что такое паттерн этой карточки».
 */
export function clothChoices(
  band: GetDesignBandResponse,
  photoMediaIds: readonly number[],
): ClothChoice[] {
  const photos = new Set(photoMediaIds.filter((id) => id > 0));
  const out: ClothChoice[] = [];
  for (const asset of shelfAssets(band, ASSET_PATTERN)) {
    const mediaId = asset.mediaId ?? 0;
    // Плитка без картинки не показывается: класть на фотографию нечего, и сервер отказал бы
    // `cloth_without_picture`. Предлагать её значило бы предлагать мёртвый выбор.
    if (mediaId <= 0) continue;
    out.push({
      assetId: asset.id ?? 0,
      mediaId,
      name: assetLabel(asset),
      thumb: assetThumb(asset),
      repeatMm: asset.repeatMm ?? 0,
      blocked: photos.has(mediaId)
        ? `this tile is also one of the photographs above (media ${mediaId}) — one call cannot carry the same picture twice. Take it out of the photographs, or pick another pattern`
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
  // ПУСТОЙ НАБОР НАЗЫВАЕТ ПРАВИЛО, А НЕ ОТСУТСТВИЕ. Строка кнопки всегда кончается словами «priced
  // by the server when the run starts», и «nothing to buy · priced by the server» противоречило бы
  // само себе на пол-строки. Правило же верно всегда, и это ровно то, что человеку надо знать до
  // того, как он положит первый снимок.
  if (sources <= 0) return 'each photograph is one paid call';
  const s = sources === 1 ? '' : 's';
  const head = `${sources} picture${s} back · ${sources} paid call${s}, one per photograph`;
  /**
   * ⚠ ЧТО ИМЕННО СДЕЛАЮТ С КАЖДЫМ СНИМКОМ — ТОЖЕ ЗДЕСЬ, И ЧИТАЕТСЯ ЭТО С ТЕЛА ЗАПРОСА (J-31).
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
      ? `re-clothed in ${(cloth.name ?? '').trim() || 'the picked pattern'}, re-tinted to ${tint}`
      : `re-clothed in ${(cloth.name ?? '').trim() || 'the picked pattern'}`
    : tint
      ? `recoloured to ${tint}`
      : (colour?.words ?? '').trim()
        ? 'recoloured to the colour described in words'
        : '';
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
      reason: `media ${dup.mediaId} is both a photograph to work on and the cloth to lay on it — one paid call cannot carry the same picture twice, and the server refuses this before anything is charged. Take it out of the photographs, or pick another pattern`,
    };
  }
  if (!targetIsStated(colour)) {
    return {
      ok: false,
      reason:
        'nothing to re-dress it in — pick a pattern, pick a colour, or describe one in words. The server refuses a run that names none of them: «change the cloth» with nothing named is a request a model answers with any cloth at all, at full price',
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
