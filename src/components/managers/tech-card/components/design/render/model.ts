import type {
  GetDesignBandResponse,
  common_Color,
  common_DesignBenchSlot,
  common_DesignColourRecipe,
  common_DesignPicture,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';

import { mixedInputNote, provenanceLabel, readProvenance } from '../provenance';
import { isPictureHidden } from '../visibility';
import { SILHOUETTE_VIEWS, isSilhouetteView, normaliseViewKey, viewLabel } from '../views';
import type { SilhouetteView } from '../views';

/**
 * READING THE BAND FOR THE TWO GENERATIVE SCREENS — everything FABRIC RENDER and 3D need to know
 * about a card, as pure functions over the one band read. No component computes any of this for
 * itself: the input strip, the palette, the colour history and the two gates all have to agree
 * about which picture is a render and which revision it belongs to, and three organs each deriving
 * that separately is how they end up disagreeing on screen.
 *
 * EVERY FIELD BELOW IS READ AS IF IT WERE NULL. The gateway is built with `EmitUnpopulated`, so an
 * unset field arrives as an explicit `null` while the generated TypeScript declares it `|
 * undefined`. Both are real. There is no error boundary over this tab — one thrown `TypeError`
 * takes the whole screen white — so nothing here dereferences without `?.` and nothing defaults
 * without `??`.
 */

/* ─────────────────────────── what kind of picture is this ─────────────────────────── */

/**
 * THE KIND VOCABULARY LIVES IN `../bench-kinds`, AND THIS FILE RE-EXPORTS WHAT IT ALWAYS EXPORTED.
 *
 * `runOfPicture` moved there so that `pictureRepresentation` — the one classifier the history
 * filter, the strip's counters, the flat lists and the artifacts panel now share — can live beside
 * the vocabulary it speaks without importing back up into the render section. Same move, same
 * reason, as `benchKindOf` below: this file's own readers see no change.
 */
export { runOfPicture };

/* ═══ ЗДЕСЬ ЖИЛИ `runKindOf` И `declaredKind` — ДВЕ ПОЛОВИНЫ ОДНОГО ПРАВИЛА ════════════════════
   Правило «род прогона первым, объявленный род картинки — запасным» набиралось выражением
   `runKindOf(band, p) || declaredKind(p)` здесь и ещё в трёх местах полосы, каждый раз своими
   словами. Волна G-1 свела их в ОДИН орган — `pictureRepresentation` в `../bench-kinds`, — и обе
   половины остались бы вторым написанием того же: живой экспорт, которым никто не пользуется,
   это приглашение написать правило заново. Кому нужен род прогона как строка — у `common_DesignRun`
   есть поле `kind`; кому нужен РОД КАРТИНКИ как решение — есть классификатор. */

/**
 * MAY THIS PICTURE BE FED TO A FABRIC RENDER? The strip's right-hand side, and the prototype's rule
 * in the prototype's own words: «a hand file was always legal input here».
 *
 * The exclusions are asymmetric ON PURPOSE. A picture is refused only on POSITIVE evidence that it
 * is an output of the generative machine — the run says so, or, when the run is off-page, the
 * picture's own kind does. Everything else is admitted, including a picture this bundle cannot
 * classify, because the failure of the strict reading is an empty strip on a card full of drawings
 * and the failure of the lax one is one extra tile the human ignores.
 */
export function isFlatCandidate(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
): boolean {
  if (isPictureHidden(picture)) return false;
  // A composite holds several views at once; a render reads ONE drawing per view, so it must be
  // split first. Same refusal the bench makes, for the same reason.
  if ((picture.compositeViews ?? []).length > 0) return false;
  /**
   * ═══ ОДИН КЛАССИФИКАТОР НА ВСЕ МЕСТА, ГДЕ МЫ ФИЛЬТРУЕМ ПО РОДУ (G-1) ═════════════════════════
   *
   * Здесь стояли три родовых имени, набранных строками, и рядом — записка, что `pattern` в этот
   * список НЕ дописан и принадлежит другой волне. Это и был дефект: плитка раппорта попадала в
   * «input — flats of this card» и в примерку как законный чертёж. Волна G-1 закрывает его не
   * четвёртой строкой, а тем, что список родов больше не набирается здесь вовсе:
   * `pictureRepresentation` читает ПРОГОН первым (без этого перекрас, объявляющий себя
   * `kind: "render"`, прошёл бы сюда) и собственный род картинки — только как запасной ответ.
   *
   * ⚠ `null` ПО-ПРЕЖНЕМУ ДОПУСКАЕТСЯ, и это та же асимметрия, что была: отказ выносится только по
   * ПОЛОЖИТЕЛЬНОМУ свидетельству, что кадр — вывод генеративной машины. Цена строгого чтения —
   * пустая полоса на карточке, полной чертежей; цена мягкого — одна лишняя плитка, которую человек
   * пропустит глазами.
   *
   * ⚠ ПРОИЗВОДНЫЕ КАДРЫ ЗДЕСЬ НЕ ТРЕБУЮТ НИ ОДНОЙ СТРОКИ. Кроп и правка наследуют род и прогон
   * предка НА СЕРВЕРЕ, в момент записи (`SplitPicture`, `FlattenEditLayer`), поэтому правка флэта
   * приходит сюда флэтом, а кроп рендера — рендером. Полный довод — в шапке `pictureRepresentation`.
   */
  const rep = pictureRepresentation(band, picture);
  return rep === 'flat' || rep === null;
}

/* ─────────────────────────── the bench, as the render reads it ─────────────────────────── */

export type BenchSide = {
  view: SilhouetteView;
  slot: common_DesignBenchSlot | null;
  picture: common_DesignPicture | null;
  /** The CAS token the next write to this slot must echo. 0 = the slot has never been written. */
  slotRev: number;
};

/**
 * WHICH BENCH. The bench has two axes — view × kind — and a render front and a flat front are two
 * DIFFERENT slots both addressed by `view_key: 'front'`. Empty reads as `flat`, exactly as the
 * column's own DEFAULT does, so every caller written before the second axis existed keeps reading
 * the bench it meant.
 *
 * THE SPELLING MOVED TO `../bench-kinds` AND IS RE-EXPORTED FOR THIS FILE'S OWN READERS. It moved
 * because it had been written three times — here, `benchRow` in `history-recall.tsx`, and NOT in
 * `readBench`/`findSlot`, whose missing fourth copy was the L-5 defect. One vocabulary module ends
 * exactly that, the way `../views` did for the first axis.
 */
import {
  COLORWAY_NONE,
  benchKindOf,
  benchRowMatches,
  cardOutputRows,
  outputsHorizon,
  serverStatesOutputs,
  pictureRepresentation,
  renderBenchOccupied,
  runOfPicture,
  colorwayOf,
  type BenchKind,
} from '../bench-kinds';
export { benchKindOf, type BenchKind };
/**
 * RE-EXPORTED, NOT RE-IMPLEMENTED. The render section prints WHICH of the two answers it drew and
 * how much of the colourway the server had to leave behind; both facts live with the reader that
 * produced them (`../bench-kinds`), and this file is the door the render screens already come in
 * through — see `runOfPicture` above, moved for the same reason.
 */
export { outputsHorizon, serverStatesOutputs };

/**
 * The four silhouette sides of ONE bench, in a fixed order, present or not.
 *
 * A side that has never been touched does not exist on the server — the rows are born lazily by the
 * first `SetDesignBenchSlot` — so `slot` is honestly null and `slotRev` is honestly 0, which is the
 * token a lazy first placement is required to send.
 *
 * ⚠ `kind` IS A FILTER, NOT DECORATION, AND ITS ABSENCE WAS A LATENT DEFECT. This function used to
 * key the map by view alone, so the moment a card held BOTH a flat front and a render front, the
 * last row of `band.bench` won and the flat strip could draw a render in its slot (or the reverse).
 * Nothing showed it while nothing wrote render slots; the 3D input writes them now.
 */
export function benchSides(
  band: GetDesignBandResponse,
  kind: BenchKind = 'flat',
  colorwayId: number = COLORWAY_NONE,
): BenchSide[] {
  const byView = new Map<string, common_DesignBenchSlot>();
  for (const row of band.bench ?? []) {
    if (!benchRowMatches(row, kind, colorwayId)) continue;
    const key = normaliseViewKey(row.viewKey);
    if (isSilhouetteView(key)) byView.set(key, row);
  }
  return SILHOUETTE_VIEWS.map((view) => {
    const slot = byView.get(view) ?? null;
    return {
      view,
      slot,
      picture: slot?.picture ?? null,
      slotRev: slot?.slotRev ?? 0,
    };
  });
}

/** Every picture standing in a silhouette slot of one bench right now, keyed by its own id. */
function markedPictureIds(
  band: GetDesignBandResponse,
  kind: BenchKind = 'flat',
  colorwayId: number = COLORWAY_NONE,
): Set<number> {
  const ids = new Set<number>();
  for (const side of benchSides(band, kind, colorwayId)) {
    const id = side.picture?.id ?? 0;
    if (id > 0) ids.add(id);
  }
  return ids;
}

/**
 * Every flat of this card that is NOT in a slot — the right-hand side of the render's input strip.
 *
 * PAGE-BOUND, AND THE SCREEN SAYS SO. The band ships one page of the feed, so this lists the flats
 * of that page and no more. The LEFT side of the strip has no such limit: a bench slot carries its
 * resolved plate however old it is, which is why the two halves are gathered from different places
 * rather than from one filtered list.
 */
export function unmarkedFlats(band: GetDesignBandResponse): common_DesignPicture[] {
  const marked = markedPictureIds(band);
  const out: common_DesignPicture[] = [];
  const push = (pictures: common_DesignPicture[] | undefined | null) => {
    for (const picture of pictures ?? []) {
      const id = picture.id ?? 0;
      if (id <= 0 || marked.has(id)) continue;
      if (!isFlatCandidate(band, picture)) continue;
      out.push(picture);
    }
  };
  for (const run of band.runs ?? []) push(run.pictures);
  for (const batch of band.batches ?? []) push(batch.pictures);
  return out;
}

/** True when the feed has more rows than the band handed over — the strip admits it. */
export function feedIsTruncated(band: GetDesignBandResponse): boolean {
  return !!(band.nextPageToken ?? '').trim();
}

/* ─────────────────────────── renders, by view and by revision ─────────────────────────── */

/**
 * ═══ THE INPUT OF A TURNTABLE IS THE RENDER BENCH — V-14 ══════════════════════════════════════
 *
 * Владелец: «в 3д INPUT — RENDERS BY VIEW нельзя никаким образом просунуть правильные референсы я
 * замаркал артефакты из фабрик рендера но они не отображаются в инпуте».
 *
 * ЗАМЕР, И ОН ОБЪЯСНЯЕТ ОБЕ ПОЛОВИНЫ ЖАЛОБЫ СРАЗУ. Экран 3D читал ЛЕНТУ: «последний рендер каждой
 * стороны», выведенный из `ghost_view` и `rrev` прогонов первой страницы. А сервер, собирая тот же
 * прогон, читает ВЕРСТАК — слоты `kind: render` (`designSelectBench`, design_run.go). Это два
 * РАЗНЫХ списка, у которых не было ни одного общего писателя, и расходились они не иногда, а
 * всегда:
 *
 *  · `select` («chosen») на артефакте фабрик-рендера не читался здесь вовсе — отсюда «замаркал, а
 *    их нет во входе»: пометка ставилась в одном месте, а вход считался в другом;
 *  · рендер приходит ОДНИМ СКЛЕЕННЫМ ЛИСТОМ (`layout: 'one'`), у листа нет `ghost_view` — значит
 *    до разреза этот вывод не показывался вообще, и «0 of 4» стояло на карточке с готовым
 *    рендером;
 *  · а нажатый GENERATE отправлял прогон, входы которого сервер собирал из ПУСТОГО рендер-верстака.
 *
 * ПОЭТОМУ ВХОД 3D — ЭТО ВЕРСТАК, тот же самый, из которого его читает сервер, и marking сюда —
 * такой же явный жест, как «mark ▸» у флэтов. Тогда «просунуть правильные референсы» перестаёт
 * быть невозможным: человек ставит в сторону ЛЮБУЮ картинку рода `render` — сгенерённую, разрезанную
 * из листа или принесённую руками, — и ровно она уезжает в сборку.
 */
export function threedSides(
  band: GetDesignBandResponse,
  colorwayId: number = COLORWAY_NONE,
): BenchSide[] {
  return benchSides(band, 'render', colorwayId);
}

/**
 * Составной лист — это НЕСКОЛЬКО видов в одном файле, и в слот он не встаёт: сервер отказывает
 * (`ErrDesignCompositePlate`), потому что сторона поворотного стола — один вид. Экран обязан
 * различать «такой картинки нет» и «эта есть, но её надо сначала разрезать».
 */
export function pictureIsComposite(picture?: common_DesignPicture | null): boolean {
  return (picture?.compositeViews ?? []).length > 0;
}

/** Одна картинка правой половины полосы 3D: сама плита плюс три факта, решающие её судьбу. */
export type ThreedCandidate = {
  picture: common_DesignPicture;
  /** Помечена «chosen» в FABRIC RENDER (W-12). Такие идут первыми — это ответ владельца. */
  chosen: boolean;
  /**
   * СВОЕЙ пометки нет, но это КАДР ПОМЕЧЕННОГО ЛИСТА — и это не то же самое, что «не выбран».
   *
   * Сразу после прогона фабрик-рендера на карточке ровно один артефакт, склеенный лист, и он
   * единственное, чему человек вообще может сказать `select`. Разрез рождает НОВЫЕ картинки, и
   * своей пометки у них нет — а по контракту кроп это «SIBLING OF ITS PARENT», та же самая
   * картинка, разрезанная. Читать такой кадр как «не выбранный» значит терять вердикт человека
   * ровно в тот момент, когда он впервые становится исполнимым.
   */
  fromChosen: boolean;
  /** Склеенный лист: показывается, но пометить нельзя, пока не разрезан. */
  composite: boolean;
};

/** Каждая картинка страницы по её id — по этой карте поднимаются вверх по `derived_from`. */
function picturesById(band: GetDesignBandResponse): Map<number, common_DesignPicture> {
  const map = new Map<number, common_DesignPicture>();
  const push = (pictures: common_DesignPicture[] | undefined | null) => {
    for (const picture of pictures ?? []) {
      const id = picture.id ?? 0;
      if (id > 0) map.set(id, picture);
    }
  };
  for (const run of band.runs ?? []) push(run.pictures);
  for (const batch of band.batches ?? []) push(batch.pictures);
  return map;
}

/**
 * Есть ли ВЫШЕ по цепочке разрезов картинка, помеченная человеком.
 *
 * `seen` — не осторожность на всякий случай: цикл в `derived_from` (родитель, пришедший с сервера
 * ссылкой на потомка) повесил бы вкладку намертво, а не показал бы неверную плитку. Родитель НЕ НА
 * ЭТОЙ СТРАНИЦЕ ленты — это честное «судить не о чем»: полоса отдаёт одну страницу, и выдумывать
 * пометку за невидимую картинку нельзя.
 */
function derivesFromChosen(
  picture: common_DesignPicture,
  byId: Map<number, common_DesignPicture>,
): boolean {
  const seen = new Set<number>();
  let parentId = picture.derivedFrom ?? 0;
  while (parentId > 0 && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return false;
    if (pictureIsSelected(parent)) return true;
    parentId = parent.derivedFrom ?? 0;
  }
  return false;
}

/**
 * КАЖДЫЙ РЕНДЕР ЭТОЙ КАРТОЧКИ, КОТОРЫЙ НЕ СТОИТ В СТОРОНЕ, — правая половина полосы 3D.
 *
 * РОД ЧИТАЕТСЯ С ПРОГОНА, А ПРИ ЕГО ОТСУТСТВИИ — С САМОЙ КАРТИНКИ, и второе здесь законно ровно
 * потому, что род картинки задаётся НАМИ: дверь загрузки этого экрана шлёт `kind: 'render'`, а
 * верстак сверяет род кадра с родом слота и отказывает при несовпадении. То есть предикат — зеркало
 * серверного правила приёма, а не догадка о незнакомом словаре.
 *
 * ПОРЯДОК: сначала помеченные, потом остальные; внутри — порядок ленты (новое раньше). Пометка
 * владельца обязана быть ВИДНА, иначе она снова «никуда не ведёт».
 *
 * PAGE-BOUND, И ЭКРАН ОБ ЭТОМ ГОВОРИТ: полоса отдаёт одну страницу ленты. Левая половина такого
 * предела не знает — плита слота приезжает разрешённой, сколь бы старой ни была.
 */
export function threedCandidates(
  band: GetDesignBandResponse,
  colorwayId: number = COLORWAY_NONE,
): ThreedCandidate[] {
  const marked = markedPictureIds(band, 'render', colorwayId);
  const byId = picturesById(band);
  const out: ThreedCandidate[] = [];
  const seen = new Set<number>();
  const push = (pictures: common_DesignPicture[] | undefined | null) => {
    for (const picture of pictures ?? []) {
      const id = picture.id ?? 0;
      if (id <= 0 || marked.has(id) || seen.has(id)) continue;
      if (isPictureHidden(picture)) continue;
      /* ═══ ЧУЖОЙ КОЛОРВЕЙ НЕ ПРЕДЛАГАЕТСЯ, ПОТОМУ ЧТО ОН ЗАВЕДОМО МЁРТВ (L-2) ═══════════════
         Плита несёт СВОЙ колорвей, и верстак сверяет его с колорвеем слота: постановка кадра
         ROSSO в верстак OLIVE отвергается сервером (`colorway_mismatch`). Предлагать её значило
         бы рисовать дверь, за которой отказ, — ровно то, чего стоило снятие `hasFabricRender` с
         роли ворот 3D. Легаси-кадр (колорвей 0) при этом законно предлагается в безколорвейный
         верстак и НЕ предлагается в именованный: атрибуцию фильтр не выдумывает. */
      if (colorwayOf(picture) !== colorwayOf({ colorwayId })) continue;
      /* ТОТ ЖЕ КЛАССИФИКАТОР, ЧТО У ФЛЭТОВОГО СПИСКА И У ФИЛЬТРА ИСТОРИИ (G-1). Читалось это и
         раньше «прогон, потом род картинки» — но своей строкой, и рекол отсеивался тем, что его
         род прогона просто не равен `render`. Теперь он отсеивается ИМЕНЕМ: его представление —
         `onmodel`. Кроп рендера при этом остаётся кандидатом, потому что наследует прогон предка. */
      if (pictureRepresentation(band, picture) !== 'render') continue;
      seen.add(id);
      const chosen = pictureIsSelected(picture);
      out.push({
        picture,
        chosen,
        // Своя пометка и унаследованная — РАЗНЫЕ факты и здесь не складываются в один: ярлык
        // `selected` под плиткой обязан означать поле `selected` этой плиты и ничего больше.
        fromChosen: !chosen && derivesFromChosen(picture, byId),
        composite: pictureIsComposite(picture),
      });
    }
  };
  for (const run of band.runs ?? []) push(run.pictures);
  for (const batch of band.batches ?? []) push(batch.pictures);
  // Три ступени, а не две: сперва помеченные сами, затем кадры помеченного листа, затем остальные.
  return [
    ...out.filter((c) => c.chosen),
    ...out.filter((c) => !c.chosen && c.fromChosen),
    ...out.filter((c) => !c.chosen && !c.fromChosen),
  ];
}

/** Одна постановка, которую делает дверь «use the N you chose»: плита, её сторона и что она вытеснит. */
export type ChosenPlacement = {
  view: SilhouetteView;
  picture: common_DesignPicture;
  /** CAS-токен стороны на момент чтения полосы. 0 — сторона ещё не рождена. */
  slotRev: number;
  /** Плита, стоящая в этой стороне сейчас: постановка её ВЫТЕСНИТ, ничего не удаляя. */
  displaces: common_DesignPicture | null;
  /**
   * ПРОИГРАВШИЕ СПОР ЗА ЭТУ СТОРОНУ — помеченные рендеры, объявившие ТОТ ЖЕ вид (Д-4).
   *
   * Раньше их просто не существовало: цикл делал `continue` по `taken.has(view)`, дверь писала
   * «use the 1 you chose», а объясняющий абзац перечислял только победителей. То есть на законной
   * позе («More than one may be chosen» — человек помечает трёх кандидатов на фронт, чтобы
   * сравнить) ДВА его вердикта исчезали без единого слова, и он не мог отличить «эти два не
   * подошли» от «экран их не увидел».
   *
   * Список пуст в подавляющем большинстве случаев и непуст ровно тогда, когда человеку есть что
   * решить. Кто победил — не выдумывается здесь: порядок `threedCandidates` (своя пометка раньше
   * унаследованной, внутри — лента, новое раньше) — тот же, которым полоса и нарисована.
   */
  alsoChosen: common_DesignPicture[];
};

/**
 * ═══ ПОМЕТКА `select` ОБЯЗАНА ДОВОДИТЬ РЕНДЕР ДО ПРОГОНА ══════════════════════════════════════
 *
 * Владелец: «заселекченный рендер в RENDERS OF THIS CARD все равно не попадает в GENERATION — 3D».
 *
 * ЗАМЕР, СНЯТЫЙ С ПОСЛЕДСТВИЯ, А НЕ С РАЗМЕТКИ. Полоса, где `selected` стоит на четырёх кадрах
 * разреза (101..104), каждый со своим `ghost_view` (front, back, side L, side R), а рендер-верстак
 * пуст: «renders of this card» честно говорит «6 renders · 4 selected», вход 3D показывает те же
 * четыре плиты с ярлыком `selected` и подписью «chosen · not marked» — и при этом «0 of 4 marked»,
 * все четыре стороны «required · blocks 3D», кнопки GENERATE в «generation — 3D» НЕТ ВОВСЕ, и на
 * провод не уходит ничего. Пометка была видна и не значила ничего.
 *
 * ПОЧЕМУ ЭТОГО НЕ ЗАКРЫЛ ПРЕДЫДУЩИЙ КРУГ (V-14). Тогда починили ПОКАЗ: помеченные встали первыми
 * справа от линии и получили ярлык. Но вход прогона — это ВЕРСТАК (сервер собирает снимок входов
 * сам, `DesignInputSnapshot` «Assembled by the SERVER only»), а в верстак пометка не писала ничего.
 * Между «я выбрал этот рендер» и «прогон его увидел» стоял второй, поштучный жест `mark ▸ → сторона`
 * — четыре раза, причём сторону человек называл ЗАНОВО, хотя её несёт сама плита (`ghost_view`) и
 * экран её же и печатает («run 3 · front · r3»).
 *
 * ПОЧЕМУ ДВЕРЬ, А НЕ АВТОМАТИКА. `selected` — множественная пометка-вердикт («More than one may be
 * chosen»): человек законно помечает три кандидата на фронт, чтобы сравнить. Ставить каждый из них
 * в сторону молча значило бы, что последний вердикт втихую вытесняет предыдущий, а сторона —
 * исключительна. Поэтому пометка НЕ пишет верстак сама; её доводит один явный жест, и этот жест
 * называет, сколько плит поставит.
 *
 * ЧЕЙ ВЕРДИКТ ПОБЕЖДАЕТ ПРИ СПОРЕ ЗА СТОРОНУ. Порядок `threedCandidates` — сначала помеченные, а
 * внутри порядок ленты (новое раньше), — поэтому сторону забирает САМЫЙ СВЕЖИЙ помеченный рендер.
 * Другого порядка на этом экране нет: ровно так же он и нарисован.
 *
 * И ПРОИГРАВШИЙ СПОР НАЗЫВАЕТСЯ ВСЛУХ (Д-4). Он не выбрасывается из счёта, а ложится в
 * `alsoChosen` победителя — потому что «More than one may be chosen» это ЗАКОННАЯ поза (три
 * кандидата на фронт, чтобы сравнить), а сторона исключительна. До этого дверь писала «use the 1
 * you chose» и перечисляла одних победителей, называя лишь два исключения — лист и рендер без
 * стороны; два вердикта человека исчезали без единого слова, и отличить «эти не подошли» от
 * «экран их не увидел» было нечем.
 *
 * КАДР ПОМЕЧЕННОГО ЛИСТА СЧИТАЕТСЯ ВЫБРАННЫМ, И БЕЗ ЭТОГО ПОЧИНКА НЕ РАБОТАЛА БЫ В САМОМ ЧАСТОМ
 * СЛУЧАЕ. Замерено: полоса, где `select` стоит на ЛИСТЕ (100), а четыре кадра разреза своей
 * пометки не несут, — дверь не появлялась, прогон по-прежнему не отправлялся. А это ровно та поза,
 * в которую приходит человек, пометивший рендер сразу после прогона: тогда на карточке НЕТ НИЧЕГО,
 * КРОМЕ ЛИСТА, и пометить он может только его; кадры рождаются позже и пустыми. См. `fromChosen`.
 *
 * ЧТО СЮДА НЕ ПОПАДАЕТ, И ЭТО НЕ УМОЛЧАНИЕ, А ПРАВИЛО. Сам склеенный лист — несколько видов в
 * одном файле, сервер отказывает ему в слоте (`ErrDesignCompositePlate`), и разрезать его должен
 * человек. Помеченный рендер БЕЗ `ghost_view` не называет стороны, и подставить её за него значило
 * бы выдумать факт: такую плиту по-прежнему ставят руками через `mark ▸`.
 */
export function chosenRenderPlacements(
  band: GetDesignBandResponse,
  colorwayId: number = COLORWAY_NONE,
): ChosenPlacement[] {
  const bySide = new Map(threedSides(band, colorwayId).map((side) => [side.view as string, side]));
  /** Победитель каждой стороны — чтобы проигравший приписывался К НЕМУ, а не считался нигде. */
  const won = new Map<string, ChosenPlacement>();
  const out: ChosenPlacement[] = [];
  for (const candidate of threedCandidates(band, colorwayId)) {
    // `threedCandidates` уже выбросил плиты, СТОЯЩИЕ в сторонах: помеченный рендер, который уже на
    // своём месте, не порождает постановки, и счётчик двери честно доходит до нуля.
    // Порядок кандидатов — своя пометка раньше унаследованной, — поэтому при споре за сторону
    // кадр с собственным вердиктом побеждает кадр, который вердикт лишь унаследовал.
    if ((!candidate.chosen && !candidate.fromChosen) || candidate.composite) continue;
    if ((candidate.picture.id ?? 0) <= 0) continue;
    const view = normaliseViewKey(candidate.picture.ghostView);
    if (!isSilhouetteView(view)) continue;
    const side = bySide.get(view);
    if (!side) continue;
    const winner = won.get(view);
    if (winner) {
      // ПРОИГРАВШИЙ НЕ ВЫБРАСЫВАЕТСЯ, А ЗАПИСЫВАЕТСЯ ЗА ПОБЕДИТЕЛЕМ (Д-4). Сторона исключительна,
      // поэтому поставить его некуда; но это ВЕРДИКТ ЧЕЛОВЕКА, и молча его терять нельзя — экран
      // обязан сказать, что на сторону претендовало несколько и кто её забрал.
      winner.alsoChosen.push(candidate.picture);
      continue;
    }
    const placement: ChosenPlacement = {
      view: view as SilhouetteView,
      picture: candidate.picture,
      slotRev: side.slotRev,
      displaces: side.picture,
      alsoChosen: [],
    };
    won.set(view, placement);
    out.push(placement);
  }
  return out;
}

/**
 * EVERY OUTPUT OF ONE KIND THE CARD HOLDS — the renders, or the turntable frames.
 *
 * READ OFF THE RUN, like everything else here (`runKindOf`): `picture.kind` is an open string whose
 * production vocabulary this bundle has never seen, and a list filtered against a dictionary you
 * have not seen empties silently. Hidden pictures are dropped — `hidden_at` is the one persistent
 * verb for invisibility and a screen that ignores it shows a plate its owner has already withdrawn.
 *
 * ═══ WHOLE-CARD WHEN THE SERVER STATES IT, THIS PAGE OF THE FEED WHEN IT DOES NOT (H-9) ════════
 *
 * The body below used to be the whole function, and it walked `band.runs` — twelve rows of the
 * merged feed. So «renders of this card» meant «renders among the twelve newest runs», an older
 * render run left the section the moment a flat trace or a 3D try was launched, and every crop
 * split off it left with it, because a crop lives inside its parent's run row. That is the bug the
 * owner caught on beta with one render on screen out of four runs' worth.
 *
 * `cardOutputRows` answers whole-card. `null` from it is a server older than the field, and then —
 * and ONLY then — this page walk still runs, unchanged to the line, so a rolled-back binary keeps
 * showing exactly what it showed before this wave. The caller must say which of the two it drew;
 * `render/outputs.tsx` prints a different scope line and a different footnote for each.
 *
 * ⚠ THE NARROWING KEY DIFFERS BETWEEN THE TWO BRANCHES, AND ON PURPOSE. The whole-card branch
 * narrows by `picture.colorway_id`, which is the key the server's own per-colourway totals are
 * built on and the key the bench already narrows by; the run's colourway would file an uploaded
 * BLK render plate — `run_colorway_id` 0, its own colourway named and real — under «unattributed»
 * and drop it out of its own section. The page walk keeps narrowing by the RUN because every
 * picture it can reach came out of one, and rewriting it would be changing old binaries' behaviour
 * in a branch nobody can measure.
 */
export function outputsOfKind(
  band: GetDesignBandResponse,
  kind: 'render' | 'threed',
  /**
   * WHOSE outputs — `undefined` narrows nothing and is the honest default for a caller that has no
   * colourway in hand. A number (0 included) narrows to the runs made FOR that colourway, 0 being
   * the unattributed ones, which is every render made before this axis existed.
   *
   * ⚠ ON A SERVER THAT DOES NOT STATE `outputs` THIS IS STILL PAGE-BOUND, AND THE SCREEN MUST SAY
   * SO. In that branch «renders of ROSSO» means «of ROSSO, on this page», a colourway whose runs
   * are all older than the page shows nothing, and that is a fact about the page rather than about
   * the colourway. `serverStatesOutputs` is how a screen tells the two apart.
   */
  colorwayId?: number,
): { picture: common_DesignPicture; run: common_DesignRun }[] {
  const whole = cardOutputRows(band, kind);
  if (whole) {
    if (colorwayId === undefined) return whole;
    return whole.filter(({ picture }) => colorwayOf(picture) === colorwayOf({ colorwayId }));
  }

  const out: { picture: common_DesignPicture; run: common_DesignRun }[] = [];
  for (const run of band.runs ?? []) {
    if ((run.kind ?? '').trim().toLowerCase() !== kind) continue;
    if (colorwayId !== undefined && colorwayOf(run) !== colorwayOf({ colorwayId })) continue;
    for (const picture of run.pictures ?? []) {
      if (isPictureHidden(picture)) continue;
      if ((picture.id ?? 0) <= 0) continue;
      out.push({ picture, run });
    }
  }
  return out;
}

/* ─────────────────────────── «selected», W-12 ─────────────────────────── */

/**
 * ═══ THE MARK «SELECTED» ON A RUN'S PICTURE — W-12 ════════════════════════════════════════════
 *
 * THE FIELD IS ON THE WIRE. `common_DesignPicture.selected` is a boolean of its own, and the
 * contract states in as many words why it is not `hidden_at` with the sign flipped: hiding says «do
 * not show me this», choosing says «this is the one», a card can hold four visible turntables with
 * one chosen among them, and spending `hidden_at` on both would make un-hiding a rejected frame
 * silently re-elect it. Every reader in this bundle goes through this one function so the two
 * notions cannot be confused at a call site.
 *
 * A FLAT NEEDS NO SUCH FLAG AND DOES NOT GET ONE: the bench slot IS the choice, because a slot
 * holds at most one plate. The flag exists for 3D precisely because the bench refuses `kind=threed`
 * and a turntable frame therefore had nowhere at all to be elected.
 */
export function pictureIsSelected(picture?: common_DesignPicture | null): boolean {
  return picture?.selected === true;
}

/**
 * DOES THE SERVER THAT ANSWERED STATE THE FLAG AT ALL?
 *
 * NOT the same question as «does the contract have the field» — this bundle's contract does, since
 * it was regenerated. The question is about the BINARY on the other end: a rolled-back one answers
 * the band's routes with a message that has no `selected` in it, and `EmitUnpopulated` means a
 * server that HAS the field always sends it (as `false` when unset). So `undefined` is a truthful
 * «this server does not know about the mark» and `false` is a truthful «not chosen» — reading both
 * as «not chosen» would make a screen filtered on the mark look convincingly empty against an old
 * binary. This band already treats rolled-back binaries as a live case; see `use-design-band.ts`.
 */
export function serverStatesSelected(picture?: common_DesignPicture | null): boolean {
  return typeof picture?.selected === 'boolean';
}

/**
 * THE VERB THAT WRITES THE MARK EXISTS NOW — `SetDesignPictureSelected`, on the band's write seam
 * (`useDesignWrites().setPictureSelected`). The one case in which a select door must still be
 * drawn inert is a SERVER that does not state the field at all (`serverStatesSelected` above): a
 * binary older than the field would answer the verb's route with a 404/501, and a door that
 * collects that refusal teaches «the admin is broken» where the truth is «this server is older
 * than the mark». This sentence is that door's reason.
 */
export const SELECT_MARK_NOT_STATED =
  'this server does not state `DesignPicture.selected` at all — a binary older than the field. ' +
  'The mark cannot be set against it; nothing else is broken';

/**
 * The revisions the four marked sides come from, ascending and deduplicated.
 *
 * ⚠ ТОЛЬКО ИЗВЕСТНЫЕ. `rrev` живёт на ПРОГОНЕ, а плита слота законно бывает старше первой страницы
 * ленты — и картинка, принесённая руками, прогона не имеет вовсе. Считать «неизвестно» отдельной
 * ревизией значило бы блокировать 3D на каждой карточке с историей и на каждом своём файле;
 * молчание здесь правдиво, а сравнивать есть смысл только то, что названо.
 */
export function threedRevisions(band: GetDesignBandResponse, sides: BenchSide[]): number[] {
  const revs = new Set<number>();
  for (const side of sides) {
    if (!side.picture) continue;
    const rrev = runOfPicture(band, side.picture)?.rrev ?? 0;
    if (rrev > 0) revs.add(rrev);
  }
  return Array.from(revs).sort((a, b) => a - b);
}

/**
 * The picture ids a 3D run would be built from, in view order. Empty when FRONT is missing.
 *
 * ═══ ЧЕТЫРЁХ СТОРОН БОЛЬШЕ НЕ ТРЕБУЕТСЯ, ТРЕБУЕТСЯ ФРОНТ (K-10/K-11) ══════════════════════════
 *
 * Раньше отсутствие ЛЮБОЙ стороны возвращало пустой список, и это было верно, пока 3D собиралось
 * из поворотного стола: кадры вокруг вещи имеют смысл только полным кругом. Теперь модель
 * провайдера — `multi-view-to-3d`: она строит объём ИЗ ВИДОВ, и видов может быть от одного. Мягче
 * стал не наш вкус, а вход: единственная сторона, без которой прогон отвергается (бесплатно,
 * `provider_bad_request`), — фронт.
 *
 * ПОЭТОМУ СПИСОК СОБИРАЕТСЯ ИЗ ЗАПОЛНЕННЫХ, В ПОРЯДКЕ ВИДОВ, а пустым остаётся ровно в одном
 * случае — фронта нет. Больше видов даёт лучший объём, и это говорит экран; но требовать все
 * четыре значило бы запрещать законный прогон, а обходится такой запрет перезагрузкой вкладки.
 */
export function turntableSourceIds(sides: BenchSide[]): number[] {
  const byView = new Map(sides.map((side) => [side.view as string, side]));
  if ((byView.get('front')?.picture?.id ?? 0) <= 0) return [];
  const ids: number[] = [];
  for (const view of SILHOUETTE_VIEWS) {
    const id = byView.get(view)?.picture?.id ?? 0;
    if (id > 0) ids.push(id);
  }
  return ids;
}

/** The views a 3D run actually carries — the marked sides, in the bench's own order. */
export function threedRunViews(sides: BenchSide[]): string[] {
  return sides.filter((side) => !!side.picture).map((side) => side.view as string);
}

/* ─────────────────────────── money ─────────────────────────── */

/**
 * ═══ ЗДЕСЬ НЕТ ЧИТАТЕЛЯ ДЕНЕГ, И ЭТО РЕШЕНИЕ, А НЕ ПРОПУСК ════════════════════════════════════
 *
 * Тут жили `BudgetLine` и `budgetLine()` — дневная полоса `today $0.41 of $2.00` и, главное, флаг
 * `exhausted`, которым ЧЕТВЕРО ворот этой полосы отказывали в запуске. Ушло всё, вместе с
 * потолком как понятием. Владелец, дословно и дважды: «у нас в принципе не должно быть потолка
 * похуй чем он съеден убери потолок».
 *
 * ПОТОЛКА БОЛЬШЕ НЕТ НИ НА ОДНОЙ СТОРОНЕ. Сервер снёс колонку `design_settings.daily_budget`,
 * оба своих отказа и самый повод `budget_exceeded`; `DesignBudget.cap` объявлен `reserved 4`, то
 * есть номер поля закрыт навсегда и вернуть его молча нельзя. Читатель, оставленный здесь «на
 * всякий случай», разыменовывал бы поле, которого не может быть, — и был бы ровно той дверью, в
 * которую потолок вернулся бы.
 *
 * ДЕНЬГИ ПРИ ЭТОМ НЕ УШЛИ. Расход жив целиком: оценка, факт, цена попытки, движение дня, снятие
 * резерва и `GetBudget`. Человеку показывается ЦЕНА ПРОГОНА — на его строке в истории, в панели
 * прогона и в свидетельстве рекола, — и показывается тем же `formatMoney` из `generation/money`.
 * Дневной СУММЫ на экране нет с круга 4 (T-12), и тоже по слову владельца: «нам надо показывать
 * только цену генерации и все». Не заводить её здесь снова.
 */

/* ─────────────────────────── the two gates ─────────────────────────── */

export type Gate = { ok: true } | { ok: false; reason: string };

/**
 * THE GATE NAMES WHAT IS MISSING, NEVER THE PROFILE.
 *
 * The prototype's refusal quotes the prompt profile («profile flat-to-fabric @ v2 wants front and
 * back») because the prototype invented one. This admin cannot: `profile_name` / `profile_version`
 * are OUTPUT-ONLY on a run — pinned by the server at launch and unknowable before it — and prompt
 * profiles are server configuration that no card field reads. So the reason states the requirement
 * itself, which is the half of that sentence the technologist can act on anyway.
 */
/**
 * ═══ БЕЗ КАКИХ СТОРОН ПРОГОН РЕНДЕРА НЕ СТАРТУЕТ — ОДИН ОТВЕТ НА ОДИН ВОПРОС ══════════════════
 *
 * Вынесено из тела `renderGate` и экспортировано, потому что этот список читают ДВОЕ: сами ворота
 * (они отказывают) и полоса входа (она красит пустой слот и говорит «the render needs it»). Пока
 * ответов было два, они совпадали ПО СОВПАДЕНИЮ: полоса брала свой из `SHEET_MIN_VIEWS`, а тот
 * документирован как требование ЛИСТА и прямо оговаривает, что «nothing here refuses». В день,
 * когда листу понадобится третья сторона, полоса покрасила бы SIDE L и заявила, что рендер её
 * требует, — при живой кнопке GENERATE и воротах, отвечающих «ok». Экран, отказывающий в прогоне,
 * который ворота разрешают, — это тот самый разъезд, ради устранения которого этот файл и
 * называет вещи один раз.
 *
 * `SHEET_MIN_VIEWS` при этом остаётся у листа и у верстака («the sheet needs it») — одна константа
 * с одной властью, а не с двумя.
 */
export const RENDER_MIN_VIEWS: readonly string[] = ['front', 'back'];

export function renderGate(band: GetDesignBandResponse): Gate {
  const sides = benchSides(band);
  const missing = sides
    .filter((side) => RENDER_MIN_VIEWS.includes(side.view))
    .filter((side) => !side.picture)
    .map((side) => viewLabel(side.view));
  if (missing.length) {
    return {
      ok: false,
      reason: `a fabric render is coloured over the flats on the bench — front and back must hold a drawing; missing: ${missing.join(', ')}`,
    };
  }
  return { ok: true };
}

/**
 * DOES THIS CARD OWN A FABRIC RENDER AT ALL — W-13, read and never recomputed.
 *
 * ⚠ THIS IS NO LONGER THE 3D DOOR, AND THE CONTRACT SAYS SO IN CAPITALS ON THE FIELD ITSELF. The
 * door is membership in `render_bench_colorway_ids` (see `threedGate`): that set counts OCCUPIED
 * SLOTS, this flag counts PICTURES, and the two legitimately disagree — a render uploaded and never
 * placed on a side makes the flag true and leaves the set empty. A screen following the old rule
 * opens the button into a `no_fabric_render` refusal.
 *
 * WHAT IT IS STILL THE RIGHT ANSWER TO: the EMPTY-STATE question — «this card has no fabric renders
 * whatsoever», as opposed to «it has them, they are simply not on a bench yet». That is what the
 * kinds strip asks when it decides whether the 3D cell should send a person to the flats, and that
 * sentence is true whatever colourway is picked, because a card with no renders has no colourway
 * with renders either.
 *
 * `undefined` IS NOT `false`. A rolled-back binary answers without the field; reading its silence
 * as «no render» would lock 3D on every card that server serves. Absence means «this server does
 * not state it», and the honest reaction is to say nothing and let the server refuse if it must.
 */
export function fabricRenderGate(band: GetDesignBandResponse): Gate {
  if (band.hasFabricRender === false) {
    return {
      ok: false,
      reason:
        '3D turns a fabric render, and this card owns none that is visible — draw the flats, ' +
        'render them, then come back. The refusal is the server’s: a run of kind 3D is rejected ' +
        'without one',
    };
  }
  return { ok: true };
}

export function threedGate(
  band: GetDesignBandResponse,
  /** Which colourway is being built. 0 = the unattributed bench, a real and permanently legal one. */
  colorwayId: number = COLORWAY_NONE,
  /** Its human name, for the refusal. Empty = «no colourway», said in those words below. */
  colorwayLabel: string = '',
): Gate {
  // THE SERVER'S REFUSAL COMES FIRST, so the client's first sentence about 3D is the same sentence
  // the server would answer with. The finer conditions below are about assembling ONE turntable out
  // of four sides and are the client's own; they can only narrow this, never widen it.
  const fabric = fabricRenderGate(band);
  if (!fabric.ok) return fabric;
  /**
   * ═══ THE DOOR IS MEMBERSHIP IN `render_bench_colorway_ids`, NOT `has_fabric_render` (L-3) ═════
   *
   * The contract now says this in capitals on the flag itself: «DO NOT DRAW THE 3D DOOR FROM THIS
   * FLAG». The two facts legitimately disagree — the flag counts PICTURES on the card, the set
   * counts OCCUPIED SLOTS — and a card whose fabric render was uploaded but never placed on a side
   * carries the flag true with the set empty. Under the old rule that card drew an open button
   * straight into a `no_fabric_render` refusal, which is the outcome the set was added to prevent.
   *
   * SCOPED, BECAUSE THE RUN IS SCOPED. A threed run reads ONLY its own colourway's render bench
   * (`designSelectBench`), so «this card has renders» is no longer an answer to «may THIS run be
   * asked for»: a card with four ROSSO sides and nothing under OLIVE must refuse OLIVE, or it
   * would sell a build with no input at all.
   *
   * THE FLAG IS STILL READ, ONE LINE ABOVE, AND IT IS NOT A DUPLICATE. It answers the OTHER
   * question — «this card owns no fabric render AT ALL» — which is the empty-state sentence that
   * sends a person to the flats, and it cannot contradict this check (no pictures ⇒ no occupied
   * slots). The finer refusal below then names the colourway rather than the card.
   */
  if (!renderBenchOccupied(band.renderBenchColorwayIds, colorwayId)) {
    const named = colorwayLabel.trim();
    return {
      ok: false,
      reason: named
        ? `${named} has no fabric render on its bench yet — render this colourway first, then mark its sides. 3D reads ONLY that colourway's bench, never a mixture`
        : 'the colourway-less bench holds no fabric render — render one without a colourway, or pick a colourway that has renders. 3D reads ONE bench, never a mixture',
    };
  }
  const sides = threedSides(band, colorwayId);
  const front = sides.find((side) => side.view === 'front');
  if (!front?.picture) {
    // ОТКАЗ НАЗЫВАЕТ ДВЕРЬ, КОТОРАЯ ЕГО СНИМАЕТ. Человек, пометивший рендеры в «renders of this
    // card», приходит сюда именно с вопросом «а где они»; отказ, который про них молчит, отправляет
    // его искать ошибку в генерации.
    const chosen = chosenRenderPlacements(band, colorwayId).length;
    return {
      ok: false,
      // ═══ ОДНА СТОРОНА ОБЯЗАТЕЛЬНА, И ЭТО ФРОНТ (K-10/K-11) ═══════════════════════════════════
      // Здесь перечислялись ВСЕ незаполненные стороны как «missing», потому что поворотный стол
      // собирался кругом. `multi-view-to-3d` строит объём из видов, и без фронта прогон
      // отвергается бесплатно (`provider_bad_request`) — а без спинки не отвергается. Отказ,
      // называющий обязательным то, что обязательным не является, запрещает законный прогон.
      reason:
        '3D is built from the marked renders, and the FRONT is the one it cannot do without — ' +
        'a run without it is rejected before anything is charged. Mark a render into front. ' +
        (chosen
          ? `You chose ${chosen} render${chosen === 1 ? '' : 's'} in FABRIC RENDER: «use the ${chosen} you chose» above puts ${chosen === 1 ? 'it into its side' : 'them into their sides'}`
          : 'The renders of this card are on the right of the line above'),
    };
  }
  const revs = threedRevisions(band, sides);
  if (revs.length > 1) {
    return {
      ok: false,
      reason: `four sides of ONE revision r — now mixing ${revs.map((r) => `r${r}`).join(' and ')}`,
    };
  }
  return { ok: true };
}

/* ─────────────────────────── the fabric of a render ─────────────────────────── */

/**
 * THREE WAYS TO STATE CLOTH, AND THEY COMBINE. The owner's answer of 2026-08-31, verbatim:
 * «можно комбинировать» фото ткани, цвет пикером и текст.
 *
 * They are not three modes of one field. They are three DIFFERENT statements about one garment —
 * a photograph carries the material, a picked colour carries the colour, prose carries the finish —
 * and a render may carry any subset of them at once. `DesignColourRecipe` always had room for all
 * three (`fabric_media_id`, `code`/`hex`, `words`) and the server never enforced exclusivity: it
 * was this screen that forced a choice, through a segmented switch that cleared the other two
 * fields every time it moved.
 *
 * BECAUSE THEY COMBINE THEY CAN DISAGREE, AND THE ANSWER IS NOT COMPUTED HERE. A blue swatch beside
 * a red picker is not an input error to be validated away; it is two claims about one cloth. The
 * ranking that settles it is written into the PROMPT — `internal/designgen/renderprompt.go`, in
 * words the model reads — so that the same disagreement resolves the same way on every run. This
 * module only REPEATS that ranking to the human (`fabricAuthority()`); a client that resolved the
 * conflict for itself would be a second opinion about a question the prompt has already answered,
 * and the two would drift the first day one of them was edited.
 */
/**
 * ═══ ТРЕТЬЯ КЛАУЗА: ДВА НЕВЕРНЫХ ВАРИАНТА И ПОЧЕМУ ВЫБРАН ЭТОТ ══════════════════════════════
 *
 * Строка стоит ПОДПИСЬЮ ГРУППЫ, то есть висит над экраном ПОСТОЯННО, при любом составе рецепта.
 * Значит она обязана быть истинной в каждом из них, иначе экран противоречит сам себе.
 *
 *  · «the words only add what neither states» — истинно всегда, но занижало: после правки промпта
 *    на обычном пути слова УПРАВЛЯЮТ материалом, а «only add» звучит как «в лучшем случае дополнят».
 *  · «the words state what neither CAN — sheerness, weight, hand, drape» — БЕЗУСЛОВНОЕ обещание, и
 *    оно ЛОЖНО, когда в прогоне едет фотография ткани: она эти самые свойства и заявляет. Замерено
 *    на подписанном стенде: подпись обещала, а строка ранга двумя рядами ниже (`data-words-rank`
 *    = `outranked`) тут же отбирала. Это ровно форма «дал и отнял», которую бэкенд отверг в своей
 *    собственной первой редакции; выпустить её на клиенте значило бы выпустить отвергнутое.
 *
 * ВЫБРАНО: назвать ОСИ — чтобы H-13 был виден с экрана, — и вернуть оговорку «what neither of them
 * states».
 *
 * ⚠ ТРЕТЬЯ РЕДАКЦИЯ ДЕЛАЕТ ЭТУ ОГОВОРКУ УСЛОВНОЙ ПО ПОСТРОЕНИЮ, А НЕ НА СЛОВАХ, И ЭТО ЗАМЕРЕННЫЙ
 * ДЕФЕКТ, А НЕ ШЛИФОВКА. Вторая редакция НАЗЫВАЛА оговорку условной, но текст был КОНСТАНТОЙ —
 * одна строка на любой рецепт. На СТРАНИЦЕ её ложь ловила строка ранга двумя рядами ниже; в
 * МОДАЛКЕ «what the model gets», ПОСЛЕДНЕЙ поверхности перед деньгами, строки ранга нет ПО
 * ПОСТРОЕНИЮ: у `clothWordsRank` был ровно один вызывающий, и тот стоял на странице.
 *
 * Замерено на подписанном стенде: при живой фотографии ткани страница печатала
 * `data-words-rank="outranked"` («против неё эти слова — описание, а не приказ»), а модалка в тот
 * же момент обещала «the words state what neither of them states — sheerness, weight, hand,
 * drape», и слов «description, not instruction» в диалоге не было НИГДЕ. Обещание без поправки, в
 * двух сантиметрах от кнопки, которая списывает деньги.
 *
 * ЛЕЧИТСЯ НЕ ВТОРЫМ ВЫЗОВОМ `clothWordsRank` В МОДАЛКЕ, А ОДНИМ ИСТОЧНИКОМ НА ОБЕ ПОВЕРХНОСТИ:
 * второй вызывающий — это второе место, где кто-то забудет. Текст подписи теперь САМ является
 * функцией рецепта, поэтому обе поверхности правы по построению, а не по дисциплине.
 *
 * ПЕРВЫЕ ДВЕ КЛАУЗЫ ОБЩИЕ И НЕ ВЕТВЯТСЯ: порядок «фотография → цвет → слова» верен при любом
 * рецепте, и два написания одной шапки разошлись бы молча ровно между теми двумя поверхностями,
 * которые эта функция и сводит.
 */
const AUTHORITY_HEAD =
  'the photo states the material · the picked colour overrides the photo\u2019s colour · ';

/**
 * ⚠ ВОЗВРАЩАЕТСЯ ПАРА «СОСТОЯНИЕ + ТЕКСТ», А НЕ ОДНА СТРОКА, И ЭТО ЗАКРЫВАЕТ ШОВ, ЗАМЕРЕННЫЙ
 * МУТАЦИЕЙ. Обе поверхности печатают текст И объявляют состояние наружу (`data-fabric-authority`,
 * по которому проба сверяет их между собой). Пока состояние считалось на месте — вторым
 * выражением над тем же предикатом, — игла, вывернувшая ветку ТЕКСТА, оставляла атрибут
 * правдивым: экран лгал словами, а разметка говорила правду, и утверждение по атрибуту оставалось
 * зелёным. Одна функция называет обе половины, и разойтись им больше негде.
 */
export function fabricAuthority(recipe?: common_DesignColourRecipe | null): {
  state: 'governs' | 'outranked';
  text: string;
} {
  /**
   * ⚠ ЧИТАЕТСЯ ТОТ ЖЕ ПРЕДИКАТ, ЧТО У СТРОКИ РАНГА (`clothWordsRank`), А НЕ ПОХОЖИЙ НА НЕГО. Два
   * написания условия «едет ли фотография» разошлись бы молча — и разошлись бы как раз между
   * страницей и модалкой, то есть между теми двумя поверхностями, которые эта функция и сводит.
   */
  return clothWordsRank(recipe).governs
    ? {
        state: 'governs',
        text: `${AUTHORITY_HEAD}the words state what neither of them states — sheerness, weight, hand, drape`,
      }
    : {
        state: 'outranked',
        /**
         * ⚠ АППОЗИЦИЯ «— sheerness, weight, hand, drape» ЗДЕСЬ СНЯТА НАМЕРЕННО. Она называет
         * доменом слов ровно те три свойства, которые фотография заявляет САМА; при живой
         * фотографии это не «поменьше правды», а прямая ложь о том, чем слова распорядятся.
         */
        text: `${AUTHORITY_HEAD}against the cloth photograph the words are description, not instruction`,
      };
}

/** The default recipe of a card that has never rendered: nothing stated at all. */
export const EMPTY_RECIPE: common_DesignColourRecipe = {
  source: '',
  code: '',
  hex: '',
  words: '',
  fabricMediaId: 0,
  // `fabrics` появилось на проводе вместе с несколькими тканями на изделие (V-8). Пустой список —
  // единственное правдивое значение «ничего не сказано вовсе»: `undefined` здесь означало бы то же,
  // но говорило бы это молчанием поля, которого у типа больше нет права не иметь.
  fabrics: [],
};

/* ─────────────────────────── H-13: what the cloth IS, on this run ─────────────────────────── */

/**
 * ═══ ДВЕ ОСИ СВОЙСТВА ТКАНИ, СКАЗАННЫЕ НА ПРОГОНЕ, А НЕ НА КАРТОЧКЕ (H-13) ════════════════════
 *
 * Владелец: «нам надо иметь возможность сказать на генерации фабрик рендеров что ткань
 * полупрозрачная например или имеет примерно такую грамматуру».
 *
 * ЭТО ПОДАЧА, А НЕ СВОЙСТВО ТКАНИ КАРТОЧКИ, и разница здесь несущая. Ассет-ткань живёт на полке и
 * переживает прогоны; «полупрозрачная» сказано ПРО ЭТОТ РЕНДЕР — той же природы, что цвет и слова
 * рядом. Хранить его на ассете значило бы завести второй ответ на вопрос, у которого ответ уже
 * есть (лоскут ткани), и разойтись с ним молча.
 *
 * ═══ ПОЧЕМУ НОВОГО ПОЛЯ НА ПРОВОДЕ НЕТ, И ЭТО НЕ ЭКОНОМИЯ ════════════════════════════════════
 *
 * Провальный режим «сохранено, но не поехало» МЁРТВ ПО ПОСТРОЕНИЮ, пока единственное место, где
 * свойство живёт после нажатия, — это отправленное предложение. Поэтому обе оси композируются в
 * `colour.words` (`statedWords`), путь которого до промпта существует целиком и покрыт голденами
 * бэкенда: `snapshot.go` пишет блок «fabric in words», а ранговая клауза промпта велит строить из
 * этих слов ВЕС, ПОВЕРХНОСТЬ и ПАДЕНИЕ ткани — то есть граммаж и прозрачность падают ровно в
 * названные слоты.
 *
 * ═══ ⚠ НАЗВАННЫЙ ПРЕДЕЛ — И ИСТОРИЯ ДВУХ ЕГО НЕВЕРНЫХ РЕДАКЦИЙ ══════════════════════════════
 *
 * Первая редакция называла ограничением только фотографию, а СОСЕДНЯЯ строка ссылалась на «ветку
 * „слова без фотографии“». ТАКОЙ ВЕТКИ НЕ СУЩЕСТВОВАЛО НИКОГДА: утвердительная фраза жила в поле
 * `solo` и печаталась при `len(carried) == 1` (`renderFabricParagraph`), то есть когда слова —
 * ЕДИНСТВЕННЫЙ источник; а вторым источником считался ЛЮБОЙ непустой `code` ИЛИ `hex`
 * (`hasColour`). Засев именованного колорвея кладёт оба, поле `name` (H-8) кладёт `code` — значит
 * на пути по умолчанию слова уезжали в клаузу, единственным глаголом которой было «IS TO BE
 * IGNORED», притом отсылавшую к фотографии, которой в прогоне НЕТ. H-13 был почти инертен.
 *
 * ЭТО ПОЧИНЕНО НА БЭКЕНДЕ (отдельной волной, уходит на бету раньше клиента). Ранжирование не
 * перевёрнуто — фотография → цвет → слова стоит, — но клауза слов теперь НАЗЫВАЕТ, чем слова
 * законно распоряжаются в компании: заявленный цвет заявляет ЦВЕТ И НИЧЕГО БОЛЬШЕ, поэтому слово о
 * прозрачности, граммаже, руке и падении ДОПОЛНЯЕТ, а не противоречит, и модель строит из него
 * переплетение, вес, поверхность и падение. Отдельная оговорка выведена для фотографии: она сама
 * заявляет прозрачность, вес и падение, поэтому ПРОТИВ ФОТОГРАФИИ те же слова — описание, а не
 * приказ.
 *
 * ИТОГОВОЕ УСЛОВИЕ, ОДНОЙ ФРАЗОЙ: свойство ткани, сказанное словами, перебивается ТОЛЬКО тогда,
 * когда в прогоне едет ФОТОГРАФИЯ ткани. Заявленный цвет его НЕ перебивает.
 *
 * ЧТО ДЕЛАЕТ КЛИЕНТ: `clothWordsRank` ниже вычисляет ровно это условие, а экран ГОВОРИТ ЕГО ДО
 * ДЕНЕГ — строкой под композицией. Своего поля на проводе здесь нет и не нужно.
 */
export const CLOTH_OPACITIES = ['opaque', 'semi-sheer', 'sheer'] as const;
export type ClothOpacity = (typeof CLOTH_OPACITIES)[number] | '';

/**
 * Границы граммажа у ДВЕРИ, тем же приёмом, что раппорт паттерна: газовый шифон начинается около
 * 20 г/м², плотное пальтовое сукно кончается около 2000. Число вне этих границ не «строгая
 * валидация», а опечатка, которая уехала бы в промпт словом «about 18000 g/m²» и стоила бы прогон.
 */
export const CLOTH_GSM_MIN = 20;
export const CLOTH_GSM_MAX = 2000;

/** Целое в границах, либо 0 = «не сказано». Пустое поле — законный ответ, а не ошибка ввода. */
export function normaliseGsm(value: number | string): number {
  const n = Math.round(Number(String(value ?? '').trim()));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(CLOTH_GSM_MAX, Math.max(CLOTH_GSM_MIN, n));
}

/**
 * ═══ ЧИСЛО ИЗ ТОГО, ЧТО ЧЕЛОВЕК НАБРАЛ ИЛИ ВСТАВИЛ — ЗАМЕРЕННЫЙ ДЕФЕКТ, А НЕ УДОБСТВО ══════════
 *
 * Поле граммажа читало ввод как `value.replace(/[^\d]/g, '')`, то есть ВЫБРАСЫВАЛО десятичную
 * точку и СКЛЕИВАЛО оставшиеся цифры. Комментарий над ним утверждал, что «точка не теряет данных,
 * она просто не является частью ответа». Замерено через всю цепочку до провода — неправда:
 *
 *   набрано «180.5»        → в поле «1805»  → куплено «about 1805 g/m²»   (ошибка В ДЕСЯТЬ РАЗ)
 *   вставлено «180.00 g/m²» → в поле «2000» → куплено «about 2000 g/m²»   (ошибка В ОДИННАДЦАТЬ)
 *
 * ⚠ ПОЧЕМУ КЛАМП ЭТО НЕ ЛОВИЛ И НЕ МОГ. 1805 падает ВНУТРЬ законного предела 20…2000 и выглядит
 * правдоподобным тяжёлым сукном; «сторож у двери» пропускает его с чистой совестью. А `180.00 g/m²`
 * — самая вероятная вставка на это поле вообще (строка со спецификации поставщика), и она
 * упиралась ровно в потолок, то есть выглядела «сработавшим клампом», а не потерей данных.
 *
 * ЧТО ДЕЛАЕТ ЭТА ФУНКЦИЯ: берёт ПЕРВОЕ ЧИСЛО из свободного текста, понимая и точку, и запятую
 * (европейская раскладка пишет «180,5»), и округляет его до целого — граммаж целый по
 * определению. Единицы, пробелы и прочий хвост спецификации отбрасываются как хвост, а НЕ
 * приклеиваются к числу.
 *
 * ⚠ БЕЗ КЛАМПА, И ЭТО НАМЕРЕННО. Кламп на каждой букве превращал бы первую набранную цифру в 20
 * под пальцами; инвариант 20…2000 держат `blur` поля и композитор (`statedWords`) — единственная
 * дверь на провод. Здесь только «какое число человек написал».
 */
export function readGsm(value: string): number {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/,/g, '.');
  const m = cleaned.match(/\d+(?:\.\d+)?|\.\d+/);
  if (!m) return 0;
  const n = Math.round(Number(m[0]));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Что сказано про ткань ЭТОГО прогона сверх её цвета и лоскута. Пустое = не сказано, и это легально. */
export type ClothDraft = {
  opacity: ClothOpacity;
  /** 0 = не сказано. */
  weightGsm: number;
};

export const EMPTY_CLOTH: ClothDraft = { opacity: '', weightGsm: 0 };

/**
 * ═══ ЕДИНСТВЕННЫЙ ПИСАТЕЛЬ СЛОВ, УЕЗЖАЮЩИХ НА ПРОВОД ═════════════════════════════════════════
 *
 * Композиция одна на всё: живая подпись под рядами, модалка «what the model gets» и тело прогона
 * читают ЭТУ функцию. Второе написание той же склейки — ровно тот дефект, ради которого она
 * названа единственным писателем: подпись обещала бы одно, а покупалось бы другое.
 *
 * ПОРЯДОК КЛАУЗ УТВЕРЖДЁН И НЕ СЛУЧАЕН: прозрачность → граммаж → свободные слова. Первые две —
 * измеримые свойства, которые промпт кладёт в свои слоты; свободные слова идут последними, потому
 * что они ДОПОЛНЯЮТ, а не заменяют, и в конце фразы читаются именно так.
 *
 * `about` перед числом — не украшение: владелец просит сказать «ПРИМЕРНО такую грамматуру», и
 * приблизительность обязана быть в словах, а не в вольности числа.
 */
export function statedWords(draft: {
  recipe?: common_DesignColourRecipe | null;
  cloth?: ClothDraft | null;
}): string {
  const cloth = draft.cloth ?? EMPTY_CLOTH;
  /**
   * ⚠ КЛАМП СТОИТ ЗДЕСЬ, А НЕ ТОЛЬКО НА `blur` ПОЛЯ, И ЭТО НЕ ПЕРЕСТРАХОВКА. Композитор — ЕДИНСТВЕННАЯ
   * дверь на провод; инвариант «20…2000», объявленный у самого числа, обязан держаться там, где
   * значение превращается в предложение, иначе он держится случайной последовательностью событий.
   * Замерено: без этого живая подпись печатала «about 18000 g/m²» ровно до первого blur — строку,
   * которая не уехала бы никогда. Подпись, обещающая непокупаемое, — тот же дефект, что и молчание.
   */
  const value = normaliseGsm(cloth.weightGsm);
  const gsm = value > 0 ? `about ${value} g/m²` : '';
  return [cloth.opacity, gsm, (draft.recipe?.words ?? '').trim()].filter(Boolean).join(', ');
}

/**
 * ═══ ОБРАТНАЯ К `statedWords` — И ОНИ ПРАВЯТСЯ ТОЛЬКО ПАРОЙ ══════════════════════════════════
 *
 * ЗАЧЕМ ОНА ВООБЩЕ НУЖНА (замеренный дефект, а не симметрия ради симметрии). Черновик засевается
 * ПОСЛЕДНИМ РЕЦЕПТОМ КАРТОЧКИ, а в нём `words` — это уже СОБРАННАЯ нами строка прошлого прогона
 * («semi-sheer, about 180 g/m², fine rib»). Структурная половина (`cloth`) при этом начинается
 * пустой. Значит человек, открывший студию второй раз и выбравший `opaque` + 220, покупал бы
 * «opaque, about 220 g/m², semi-sheer, about 180 g/m², fine rib» — свойства, названные ДВАЖДЫ и
 * противоречащие друг другу, в платном запросе.
 *
 * ПОЭТОМУ ЗАСЕВ РАЗБИРАЕТ СТРОКУ ОБРАТНО: чипы и число встают там, где стояли, а в свободных словах
 * остаётся только хвост. Это не догадка о чужом тексте — формат написан здесь же, соседней
 * функцией, и разбирается по её собственной грамматике: клаузы идут с начала строки, в том же
 * порядке, через `, `.
 *
 * ЧЕЛОВЕК, НАБРАВШИЙ «semi-sheer» РУКАМИ В СВОБОДНЫХ СЛОВАХ, получит его чипом. Это не потеря:
 * заявление то же самое, и в следующий раз оно уедет ровно один раз.
 */
export function splitStatedWords(words?: string | null): { cloth: ClothDraft; words: string } {
  let rest = (words ?? '').trim();
  const cloth: ClothDraft = { ...EMPTY_CLOTH };

  /**
   * ⚠ КЛАУЗА ПОТРЕБЛЯЕТСЯ, ТОЛЬКО ЕСЛИ `accept` СОГЛАСЕН, И ЭТО НЕ ПЕДАНТИЗМ — ЭТО ПОТЕРЯ ДАННЫХ.
   *
   * Пока разбор ВСЕГДА клампил найденное число, он переписывал человеческий текст своими правилами:
   * «about 5 g/m²» возвращалось как 20, «about 3000 g/m²» — как 2000 (прогон, реально купленный при
   * 3000, показывал бы и пере-покупал 2000), а «about 0 g/m², matte» ИСЧЕЗАЛО целиком: клауза
   * съедалась, ноль читался как «не сказано», и от строки оставалось «matte».
   *
   * Правило теперь одно, и оно же есть определение обратимости: РАЗБИРАЕТСЯ ТОЛЬКО ТО, ЧТО МОГ
   * НАПИСАТЬ КОМПОЗИТОР. Всё остальное — чужой текст, и его место в свободном хвосте, откуда он
   * доедет до модели дословно.
   */
  const takeLeading = (
    re: RegExp,
    accept: (m: RegExpMatchArray) => boolean,
  ): RegExpMatchArray | null => {
    const m = rest.match(re);
    if (!m || !accept(m)) return null;
    rest = rest.slice(m[0].length).replace(/^\s*,\s*/, '').trim();
    return m;
  };

  const opacity = takeLeading(
    new RegExp(`^(${CLOTH_OPACITIES.join('|')})(?=\\s*,|\\s*$)`, 'i'),
    () => true,
  );
  if (opacity) cloth.opacity = opacity[1].toLowerCase() as ClothOpacity;
  const gsm = takeLeading(
    /^about\s+(\d{1,5})\s*g\/m²(?=\s*,|\s*$)/i,
    // Своё же число, записанное своими же правилами: непустое и совпадающее с клампом ПОСИМВОЛЬНО.
    (m) => normaliseGsm(m[1]) > 0 && String(normaliseGsm(m[1])) === m[1],
  );
  if (gsm) cloth.weightGsm = normaliseGsm(gsm[1]);

  return { cloth, words: rest };
}

/**
 * ═══ КТО КОГО ПЕРЕБИВАЕТ, СКАЗАННОЕ ДО ДЕНЕГ (H-13) ═════════════════════════════════════════
 *
 * Условие снято построчно с `renderprompt.go` — довод целиком в шапке блока выше. Здесь только его
 * вычисление, ОДНО на весь клиент: подпись под рядами и любой будущий читатель обязаны говорить
 * одно и то же, потому что расхождение здесь стоит купленной картинки.
 *
 * `governs` ложно РОВНО В ОДНОМ случае — когда в прогоне едет ФОТОГРАФИЯ ткани
 * (`fabric_media_id`): она сама заявляет прозрачность, вес и падение, и против неё те же слова
 * читаются описанием, а не приказом.
 *
 * ⚠ ЗАЯВЛЕННЫЙ ЦВЕТ СЮДА НЕ ВХОДИТ, И ЭТО НЕ УПРОЩЕНИЕ. Первая редакция считала его вторым
 * старшим — тогда это было правдой, и ровно из-за неё H-13 был почти инертен на пути по умолчанию.
 * Промпт теперь говорит прямо: цвет заявляет цвет и ничего больше. Оставить здесь старое условие
 * значило бы пугать человека рангом, которого больше нет, — а ложная тревога стоит доверия к
 * строке ровно столько же, сколько молчание стоило картинки.
 */
export function clothWordsRank(recipe?: common_DesignColourRecipe | null): { governs: boolean } {
  /**
   * ⚠ ПОЛЕ `outrankedBy` СНЯТО. Пока старших было двое, оно называло, КТО именно перебил, и экран
   * подставлял его в фразу. Старший остался один, и поле выродилось в константу, которую никто не
   * читает: подпись на экране называет фотографию прямым текстом. Возвращать данные, которых никто
   * не спрашивает, — это заготовка для расхождения, а не задел.
   */
  return { governs: !fabricStatement(recipe).photo };
}

/**
 * ЧТО ИМЕННО ЭТОТ ПРОГОН СОШЬЁТ — одна фраза для строки инвентаря у кнопки GENERATE.
 *
 * ⚠ ЭТО ПОЛОВИНА РАБОТЫ СНЕСЁННОГО ЗАГОЛОВКА-ЗАЯВЛЕНИЯ (H-12). Свотч 44px с именем рецепта стоял
 * над контролами и отвечал на «из чего будет этот рендер» ВТОРЫМ голосом: под нетронутым черновиком
 * он повторял ряд факта колорвея слово в слово. Ответ теперь один и стоит в двух шагах от денег —
 * там, где на него смотрят; вторую половину (что несёт САМ КОЛОРВЕЙ) взял ряд FABRIC.
 *
 * ЧИТАЕТСЯ ПО ТОМУ ЖЕ ПОРЯДКУ СТАРШИНСТВА, что и промпт: ткани полки, потом одинокая фотография,
 * потом выбранный цвет, потом слова. Пустая строка — законный ответ пустого черновика; ворота
 * кнопки в этом случае и так закрыты и говорят почему.
 */
export function madeOfLine(recipe?: common_DesignColourRecipe | null): string {
  /**
   * ⚠ НЕ ЛЕСТНИЦА «ПЕРВЫЙ СОВПАВШИЙ», А ИСТОЧНИК ПЛЮС ЗАЯВЛЕНИЕ. Первая редакция возвращалась на
   * первом же совпадении, и заявление H-13 исчезало С ЛИНИИ, БЛИЖАЙШЕЙ К ДЕНЬГАМ, на КАЖДОМ пути,
   * где заявлен ещё и цвет или ткань, — то есть на обычной подаче H-13. Замерено: рецепт
   * `{code:'dusty rose', hex:'#a41f22', words:'semi-sheer, about 180 g/m²'}` давал
   * «made of dusty rose · #a41f22», и строка денег молчала про прозрачность, которую подпись двумя
   * рядами выше только что пообещала. Источник и заявление — РАЗНЫЕ половины ответа «из чего это
   * будет», и обе едут в прогон.
   *
   * ТИРЕ ВНУТРИ КЛАУЗЫ, `·` МЕЖДУ КЛАУЗАМИ: сама строка денег разделена точками, и третья точка
   * склеила бы «из чего» с «сколько картинок» в один поток.
   */
  const cloths = (recipe?.fabrics ?? [])
    .map((f) => (f.name ?? '').trim())
    .filter(Boolean);
  const named = [
    (recipe?.code ?? '').trim(),
    hexIsPaintable(recipe?.hex) ? (recipe?.hex ?? '').trim().toLowerCase() : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const source = cloths.length
    ? cloths.join(' + ')
    : (recipe?.fabricMediaId ?? 0) > 0
      ? 'the cloth photo'
      : named;
  const words = (recipe?.words ?? '').trim();
  if (!source) return words ? `made of the cloth stated as «${words}»` : '';
  return words ? `made of ${source} — ${words}` : `made of ${source}`;
}

/**
 * ПРЕДЕЛ ДЛИНЫ ИМЕНИ ЦВЕТА — И ОН ЖИВЁТ ЗДЕСЬ, А НЕ В АТРИБУТЕ ПОЛЯ.
 *
 * ⚠ `maxLength` НА `<input>` ОГРАНИЧИВАЕТ ТОЛЬКО НАБОР С КЛАВИАТУРЫ. Значение приходит в это поле и
 * ПРОГРАММНО — засевом колорвея, — а `colorway.dev_name` в базе `VARCHAR(255)`, и на `code` у
 * сервера валидации нет вовсе. Шестидесятизначное имя рисовалось целиком, уезжало дословно и
 * заполняло собой строку денег; человек при этом мог его только СОКРАЩАТЬ, но не дополнять —
 * `maxLength` не даёт добавить символ к значению, которое уже длиннее предела. Предел поэтому
 * применяется там, где значение ПИШЕТСЯ.
 */
export const COLOUR_NAME_MAX = 40;

/**
 * ⚠ БЕЗ `trim()`, И ЭТО НЕ НЕБРЕЖНОСТЬ. Эту функцию зовёт и ПРАВКА ПОЛЯ, на каждой букве: обрезка
 * краёв там означала бы, что человек не может набрать пробел между словами — «dusty » схлопывался
 * бы обратно в «dusty» под пальцами. Пробелы по краям безвредны: заявленность считается по `trim()`
 * (`fabricStatement`), и серверный `colourPhrase` тримит сам. Обрезают ЗАСЕВЫ, у своих источников.
 */
export function clampColourName(value?: string | null): string {
  return (value ?? '').slice(0, COLOUR_NAME_MAX);
}

/** A hex a browser will actually paint. Three or six digits, the two shapes `<input type='color'>`
 *  and CSS agree on; anything else is a half-typed value and must not reach a swatch. */
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function hexIsPaintable(hex?: string | null): boolean {
  return HEX_RE.test((hex ?? '').trim());
}

/**
 * ═══ HEX, ПРИВЕДЁННЫЙ К ТОМУ ВИДУ, В КОТОРОМ ОН ВООБЩЕ ЯВЛЯЕТСЯ ЦВЕТОМ ══════════════════════════
 *
 * ⚠ ЗАЧЕМ ОН НУЖЕН ОТДЕЛЬНО ОТ `normaliseHex` СОСЕДНЕГО МОДУЛЯ. Тот приводит уже КРАСИМЫЙ hex к
 * шести знакам и отвергает всё, у чего нет решётки. Здесь предмет другой: то, что человек НАБРАЛ
 * или ВСТАВИЛ в текстовое поле, где решётку не ставят («a41f22» с любого сайта палитр).
 *
 * ⚠ И ЗАЧЕМ ОН ВООБЩЕ СУЩЕСТВУЕТ — ЗАМЕРЕННОЕ РАСХОЖДЕНИЕ ДВУХ ОСЕЙ, А НЕ ОПРЯТНОСТЬ.
 *
 * Ось экрана — `hexIsPaintable` (три или шесть знаков ПОСЛЕ решётки). Ось сервера — «непустой
 * `colourPhrase(code, hex)`» (`renderprompt.go`), то есть ЛЮБОЙ непустой hex. Они расходились на
 * пяти значениях из шести проверенных: при `hex` = «#ab» / «a41f22» / «red» / «#a41f2» / «#GGG»
 * экран рисовал штриховку, не называл никакого цвета и говорил, что прогон сделан ИЗ СЛОВ, — а
 * купленный промпт получал ранг 2 «THE STATED COLOUR … governs the COLOUR of this garment» с
 * блоком цвета «a41f22» И ТЕРЯЛ утвердительную сольную клаузу, которую экран только что пообещал.
 * Одно значение поля покупало ДРУГОЙ промпт, чем показанный.
 *
 * ПОЭТОМУ: то, что можно достроить до цвета, достраивается («a41f22» → «#a41f22», «#ABC» →
 * «#aabbcc»); всё прочее возвращается ПУСТЫМ — «цвет не назван». Пустое — законный ответ этого
 * поля, и промпт его умеет: `colourPhrase` печатает тогда одно имя, а при пустом имени не печатает
 * ничего. Приведение стоит и у поля (на `blur`, чтобы человек видел, что с ним сделали), и у двери
 * на провод — сам инвариант держит дверь, поле только показывает его человеку.
 */
export function normaliseTypedHex(value?: string | null): string {
  const raw = (value ?? '').trim().toLowerCase().replace(/^#/, '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/.test(raw)) return '';
  return raw.length === 3 ? `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}` : `#${raw}`;
}

/**
 * WHAT THIS RECIPE ACTUALLY STATES — one boolean per source, and every reader asks this instead of
 * asking «which source is it».
 *
 * There is no longer a single answer to that older question, which is exactly why it is gone: with
 * combination legal, «the source» of a recipe carrying a photo AND a hex is a question with two
 * true answers, and a function forced to return one of them silently hid the other. The gate, the
 * swatch, the caption and the inventory all read this shape instead.
 */
export type FabricStatement = {
  /** A photograph of the cloth travels with the run, as an image in its prompt. */
  photo: boolean;
  /** A colour was picked — a dictionary code, a hex of your own, or both. */
  colour: boolean;
  /** A free description was typed. */
  words: boolean;
};

export function fabricStatement(recipe?: common_DesignColourRecipe | null): FabricStatement {
  return {
    photo: (recipe?.fabricMediaId ?? 0) > 0,
    colour:
      !!(recipe?.code ?? '').trim() || hexIsPaintable(recipe?.hex),
    words: !!(recipe?.words ?? '').trim(),
  };
}

/**
 * A recipe that could be submitted: SOMETHING states the cloth.
 *
 * ANY ONE OF THE THREE IS ENOUGH, AND THAT IS THE OWNER'S OWN LIST — «пример фото ткани цвет ткани
 * или описание ткани текстом или выбрать цвет пикером». A description alone is a legitimate render
 * («black heavy cotton twill»); demanding a colour beside it would refuse a submission the owner
 * named in as many words.
 */
export function recipeIsStated(recipe?: common_DesignColourRecipe | null): boolean {
  const stated = fabricStatement(recipe);
  return stated.photo || stated.colour || stated.words;
}

/**
 * ═══ РЕЗОЛЮЦИЯ ПО СЛОВАРЮ — ТОЧНАЯ, И ЭТО ПРАВКА H-8, А НЕ ПРИДИРКА ══════════════════════════
 *
 * Сравнение шло ЧЕРЕЗ `toUpperCase()`, и пока имя цвета БРАЛИ ИЗ СЛОВАРЯ, это было безобидно: в
 * поле попадал канонический код. После H-8 поле — свободный текст, и регистронезависимость стала
 * механизмом ВЫДУМЫВАНИЯ. Замерено на живых функциях: набранное `blu` резолвилось в запись `BLU`,
 * заголовок печатал «BLU · cobalt» — слово, которого никто не набирал и которое НЕ УЕЗЖАЕТ, — а
 * свотч красился в `#0000ff`, хотя `hex` на проводе пуст. Опись перед деньгами показывала цвет,
 * которого не будет.
 *
 * Точное сравнение чинит обе половины сразу: коды словаря канонически заглавные, поэтому
 * замороженная история с `OLV` читается ровно как читалась, а свободное имя больше ни во что не
 * превращается. Трим остаётся: пробел по краям — не заявление.
 */
export function findDictionaryColour(
  colors: readonly common_Color[] | undefined,
  code?: string | null,
): common_Color | null {
  const wanted = (code ?? '').trim();
  if (!wanted) return null;
  return (colors ?? []).find((c) => (c.code ?? '').trim() === wanted) ?? null;
}

/**
 * The swatch fill of a recipe, or '' when no colour is stated. '' is drawn as a striped surface,
 * never as black — an unknown colour that paints itself black is a lie a swatch tells convincingly,
 * and a photo-only recipe genuinely has no colour of its own on this screen.
 *
 * ⚠ СЛОВАРНЫЙ ФОЛБЭК ОСТАЁТСЯ ТОЛЬКО ДЛЯ НАСТОЯЩИХ КОДОВ, и держит его ТОЧНОЕ сравнение в
 * `findDictionaryColour`. Свободное имя (H-8) в словарь больше не попадает, поэтому свотч у рецепта
 * без `hex` штрихуется — что и есть правда: значения на проводе нет. Набранный hex по-прежнему
 * старше словарного: он и уезжает.
 */
export function colourSwatchHex(
  recipe: common_DesignColourRecipe | null | undefined,
  colors: readonly common_Color[] | undefined,
): string {
  const hex = (recipe?.hex ?? '').trim();
  if (hexIsPaintable(hex)) return hex;
  const entry = findDictionaryColour(colors, recipe?.code);
  return (entry?.hex ?? '').trim();
}

/**
 * The short name of what is stated — the headline over the palette.
 *
 * ⚠ ЗАГОЛОВОК ПЕЧАТАЕТ ТУ ЖЕ ПАРУ, ЧТО УЕЗЖАЕТ, И ЭТО ПЕРЕЖИВШИЙ СЕБЯ ДОВОД, ПЕРЕПИСАННЫЙ ПО ФАКТУ.
 * Здесь стоял абзац про «отклонение от кода», объяснявший снятую форму `CODE → hex`; после H-8
 * доктрина отклонения удалена (цвет ВСЕГДА берут пикером и называют словом), но абзац остался — и
 * ЗАПРЕЩАЛ ровно то, что функция делала: с замороженным `OLV` и набранным поверх hex она печатала
 * «OLV · olive drab» над свотчем, закрашенным набранным цветом. Ровно то противоречие в двух
 * местах, куда человек смотрит, которое абзац называл недопустимым.
 *
 * Правило теперь одно и совпадает с сервером (`colourPhrase`): печатается ИМЯ И ЗНАЧЕНИЕ, то есть
 * то, что уедет. Человеческое имя из словаря дописывается ТОЛЬКО когда добавлять нечего — когда hex
 * не набран или совпадает со словарным, и заголовок со свотчем не могут разойтись.
 */
export function colourLabel(
  recipe: common_DesignColourRecipe | null | undefined,
  colors: readonly common_Color[] | undefined,
): string {
  const stated = fabricStatement(recipe);
  /**
   * ⚠ ИМЯ ПЕЧАТАЕТСЯ ТАК, КАК ЕГО НАБРАЛИ. Капслок ставился, пока имя было КОДОМ словаря — там он
   * канонический. Свободное имя человека (`dusty rose`) заглавными — уже не его слово, а наше, и
   * оно расходится с тем, что уедет в промпт буква в букву.
   */
  const code = (recipe?.code ?? '').trim();
  const hex = (recipe?.hex ?? '').trim().toLowerCase();
  if (code) {
    /**
     * ⚠ ФОРМА «CODE → hex» СНЯТА ВМЕСТЕ СО СВОИМ ДОВОДОМ (H-8). Она называла набранный поверх кода
     * hex ОТКЛОНЕНИЕМ от кодифицированного цвета — доктрина, которую владелец удалил: цвет теперь
     * ВСЕГДА выбирают пикером и называют словом, и пара «имя + значение» это норма, а не отклонение.
     * Печатаем то, что уедет: `colourPhrase` на сервере складывает ровно эту пару.
     */
    const entry = findDictionaryColour(colors, code);
    const dictHex = (entry?.hex ?? '').trim().toLowerCase();
    /**
     * ЧЕЛОВЕЧЕСКОЕ ИМЯ СЛОВАРЯ ДОПИСЫВАЕТСЯ ТОЛЬКО ТАМ, ГДЕ ОНО НИЧЕГО НЕ ЗАСЛОНЯЕТ. Как только
     * набранный hex отличается от словарного, ЗНАЧЕНИЕ важнее прозвища: свотч рисуется набранным,
     * и заголовок обязан назвать ту же пару, иначе экран спорит сам с собой в двух местах, куда
     * человек смотрит одновременно.
     */
    const deviates = hexIsPaintable(hex) && (!entry || hex !== dictHex);
    return deviates ? `${code} · ${hex}` : entry?.name ? `${code} · ${entry.name}` : code;
  }
  if (hexIsPaintable(hex)) return hex;
  if (stated.photo) return 'the fabric photo';
  if (stated.words) return 'described in words';
  return 'no fabric stated';
}

/**
 * The line under the name: EVERY source this run carries, named, in the order of authority.
 *
 * It lists rather than chooses. The old subtitle answered «where the colour comes from» with one
 * source because only one could exist; naming one of three now would hide the other two, and the
 * two it hid are the ones a person would be surprised by when the picture came back.
 */
export function colourSubtitle(
  recipe: common_DesignColourRecipe | null | undefined,
  colors: readonly common_Color[] | undefined,
): string {
  const stated = fabricStatement(recipe);
  const parts: string[] = [];
  if (stated.photo) parts.push('a fabric photo (material)');
  if (stated.colour) {
    // Регистр не трогается по тому же доводу, что в `colourLabel`: печатается набранное слово.
    const code = (recipe?.code ?? '').trim();
    const hex = (recipe?.hex ?? '').trim().toLowerCase();
    const entry = findDictionaryColour(colors, code);
    if (code && !entry) {
      /**
       * ⚠ ЭТО БОЛЬШЕ НЕ АНОМАЛИЯ И НЕ ПРЕДУПРЕЖДЕНИЕ (H-8). Фраза «not in this dictionary, the code
       * travels and the hex cannot» была верна, пока имя цвета брали ИЗ СЛОВАРЯ и промах мимо него
       * означал сломанные данные. Владелец снял словарь кодов с экрана генерации целиком: цвет
       * выбирают пикером и НАЗЫВАЮТ словом. Значит несловарное имя — теперь нормальный, а вскоре и
       * единственный случай, и оставить над ним предупреждение значило бы кричать на человека за то,
       * что он сделал ровно то, о чём его попросили.
       *
       * Резолюция по словарю остаётся ФОЛБЭКОМ ЧТЕНИЯ ветки ниже: замороженные прогоны с кодом
       * `OLV` обязаны читаться после этой правки так же, как читались до неё.
       */
      parts.push(
        `a named colour (${[code, hexIsPaintable(hex) ? hex : ''].filter(Boolean).join(' · ')})`,
      );
    } else {
      parts.push(`a picked colour (${[code, hexIsPaintable(hex) ? hex : ''].filter(Boolean).join(' · ')})`);
    }
  }
  if (stated.words) parts.push('a description in words');
  if (!parts.length) return 'nothing stated yet — a photo, a colour or a description, or any mix of them';
  return parts.join(' + ');
}

/**
 * The `source` string the wire still carries, DERIVED rather than chosen by a control.
 *
 * The field predates combination: its documented vocabulary is `dictionary | own | photo` and it
 * cannot spell «a photo and a picked colour together». Nothing reads it any more — the prompt is
 * built from the populated fields, and this screen reads them too — so writing it is pure
 * compatibility with recipes already stored, and the derivation follows the same order of authority
 * the prompt states: the picked colour is the strongest single word available, the photo the next.
 * It is never allowed to become the thing that DECIDES what travels; the three fields are.
 *
 * ⚠ ПОСЛЕ H-8 ЗНАЧЕНИЕ `dictionary` ЧИТАЕТСЯ КАК «ЦВЕТ НАЗВАН ИМЕНЕМ», И ЭТО СОЗНАТЕЛЬНОЕ ЛЕГАСИ.
 * Словаря кодов на экране генерации больше нет, поле `code` несёт имя, которое человек набрал сам,
 * — но переименовать значение здесь значило бы тронуть читателей ЗАМОРОЖЕННОЙ истории (записи с
 * `dictionary` лежат в `design_run.params` навсегда) ради нуля видимой пользы: строка stored-only,
 * её никто не спрашивает, и что уедет, решают три заполненных поля. Записано комментарием, а не
 * кодом, ровно поэтому.
 */
export function wireColourSource(recipe?: common_DesignColourRecipe | null): string {
  if ((recipe?.code ?? '').trim()) return 'dictionary';
  if (hexIsPaintable(recipe?.hex)) return 'own';
  if ((recipe?.fabricMediaId ?? 0) > 0) return 'photo';
  return '';
}

/* ─────────────────────────── the sheet a render comes back as ─────────────────────────── */

/**
 * THE LEFT-TO-RIGHT ORDER OF THE VIEWS ON A RENDER SHEET — a walk around the garment.
 *
 * The owner's own sample is front, side, back in that order, and this list is that sample
 * generalised to a card that also holds a right side: you walk around the body rather than
 * enumerating a database. It is deliberately NOT `SILHOUETTE_VIEWS` (front, back, side L, side R),
 * which is the order the bench is DRAWN in — a bench is a set of slots to fill and reads best with
 * the two main sides adjacent, a sheet is a photograph and reads as a rotation.
 *
 * ⚠ THIS ORDER IS THE ORDER THE SPLITTER WILL TRUST. `params.views` is recorded verbatim by the
 * store (`compositeViewsOf`) as «what is glued into this image», and the split frames are labelled
 * off that record. So the list sent here, the list the prompt says left-to-right, and the labels
 * of the cut frames are one list — which is only true while exactly one place decides it.
 */
export const RENDER_SHEET_ORDER = ['front', 'side_l', 'back', 'side_r'] as const;

/** The views a render run is asked for: the filled bench slots, in sheet order. */
export function renderSheetViews(band: GetDesignBandResponse): string[] {
  const filled = new Set(
    benchSides(band)
      .filter((side) => !!side.picture)
      .map((side) => side.view as string),
  );
  return RENDER_SHEET_ORDER.filter((view) => filled.has(view));
}

/* ─────────────────────────── the 3D submission ─────────────────────────── */

/**
 * ═══ FRAMES СНЯТ ЦЕЛИКОМ (K-11) ══════════════════════════════════════════════════════════════
 *
 * Владелец, дословно: «и по сути FRAMES пропадает надобность». Здесь стоял `FRAME_CHOICES` —
 * `turntable 12 | turntable 24 | 4 angles`, — то есть ВО СКОЛЬКО КАДРОВ обернуть вещь.
 *
 * ЭТО СЛЕДСТВИЕ K-10, А НЕ ОТДЕЛЬНОЕ ЖЕЛАНИЕ. 3D больше не собирается как поворотный стол из
 * покадровой съёмки: провайдер строит объём ИЗ ВИДОВ (`multi-view-to-3d`), и промежуточной сущности
 * «кадр» на этом пути нет вовсе. Вопрос «сколько кадров» перестал иметь ответ, а не стал
 * неудобным, — поэтому убран орган, а не спрятана кнопка.
 *
 * ЧТО ПРОВЕРЕНО ПЕРЕД СНОСОМ. `frames` на проводе (`DesignThreedParams.frames`) читали РОВНО ДВА
 * места, оба — про ЧЕРНОВИК, а не про историю: ряд выбора в `threed-studio` и строка описи в
 * `what-model-gets`. Ни одна панель прогона, ни история, ни артефакты его не печатали, поэтому
 * снос не осиротил ни одного читателя и не спрятал ни одного факта о замороженных прогонах: их
 * `params.threed.frames` как лежал в базе, так и лежит, просто больше некому спросить.
 *
 * ЧТО УЕЗЖАЕТ ТЕПЕРЬ. Поле контракта живо и заполняется ЯВНЫМ НУЛЁМ — «не сказано». Отправлять
 * 12 после того, как никто не поворачивает вещь на 12 кадров, значило бы заморозить в истории
 * число, которого никто не просил и которое ничему не соответствует.
 */

export const PRESENTATIONS = [
  { value: 'air', label: 'in the air' },
  { value: 'model', label: 'on a model' },
] as const;

export type Presentation = (typeof PRESENTATIONS)[number]['value'];

/**
 * ═══ ТЕЛОСЛОЖЕНИЕ — V-15 ═════════════════════════════════════════════════════════════════════
 *
 * ОДИН ВОПРОС, ДВА РЕГИСТРА ОТВЕТА, И ЭТО НЕ ЛОЖНОЕ РАСЩЕПЛЕНИЕ. Вопрос у экрана один: «на каком
 * теле это стоит». Ответить на него можно ИМЕНЕМ (одна из наших примерочных моделей: у неё есть
 * фотографии, мерки, базовый размер) или СЛОВОМ О ФОРМЕ, когда чьё именно тело — не важно.
 * Проверка по пяти признакам класса «ложный сплит»: вырожденного близнеца нет (модель — строка
 * картотеки, телосложение — класс), выразить одно через другое нельзя (никакая строка картотеки не
 * значит «любое атлетичное тело», и никакое слово не вернёт лицо и мерки Веры), дихотомия не
 * ложная — технолог произносит обе фразы. Поэтому органов не два, а ОДИН: блок «the body», в
 * котором обе половины стоят рядом и обе необязательны по отдельности.
 *
 * НА ПРОВОДЕ ЭТО СТРОКА, А НЕ ENUM, И ЭТО РЕШЕНИЕ КОНТРАКТА: словарь телосложений — вопрос
 * ФОРМУЛИРОВОК, он будет переписан, а enum заморозил бы сегодняшние слова в истории каждого
 * замороженного прогона. Отсюда же правило этого файла: слова живут ровно ЗДЕСЬ, в одном месте,
 * рядом с остальным словарём 3D-подачи — второй список на экране разошёлся бы с первым молча,
 * ровно как это уже случилось с фитом (см. FIT_OPTIONS ниже, «под протест»).
 *
 * СВОБОДНОГО ВВОДА НЕТ НАМЕРЕННО. Строка на проводе — про то, что словарь МЕНЯЕТСЯ, а не про то,
 * что его нет: набранное руками «athlectic» уехало бы в замороженный прогон и не сошлось бы ни с
 * чем никогда.
 */
export const BODY_TYPES = ['slim', 'athletic', 'average', 'curvy', 'plus'] as const;

export type BodyType = (typeof BODY_TYPES)[number];

/**
 * THE FIT VOCABULARY, AND IT IS RESTATED HERE UNDER PROTEST.
 *
 * The card's own list lives in `style-facts-field.tsx` as a private `const FIT_OPTIONS` that is not
 * exported, and this wave may not edit that file. So the same vocabulary now exists twice, which is
 * exactly the drift `./views.ts` was written to end — a list duplicated per screen rots silently,
 * and the symptom would be a 3D override offering a fit the classification block refuses.
 *
 * IT IS THE APP'S LIST, NOT THE PROTOTYPE'S. The prototype offers `oversized` and no
 * `skinny/cropped/tailored`, and its own source marks that list «НЕ ответ владельцу». The card is
 * the single place of truth about fit, so the override may only offer fits the card can hold.
 *
 * TO FIX: export `FIT_OPTIONS` from `style-facts-field.tsx` (or lift it beside `views.ts`) and
 * delete this constant.
 */
export const FIT_OPTIONS = [
  'regular',
  'slim',
  'loose',
  'relaxed',
  'skinny',
  'cropped',
  'tailored',
] as const;

/**
 * The fits the 3D override may offer: the app's vocabulary MINUS the card's own.
 *
 * The card's fit is not dropped, it MOVES — the picker's first entry is `card · <fit>`, a sentinel
 * meaning «no override», and listing the same value twice would make «card · slim» and «slim» read
 * as two different submissions when they are one. A card carrying a fit outside this list (an older
 * record, a value seeded before the list settled) still keeps it: the sentinel prints whatever the
 * card holds, whether or not this bundle has heard of it.
 */
export function fitChoices(cardFit: string): string[] {
  const fit = (cardFit ?? '').trim();
  return FIT_OPTIONS.filter((f) => f !== fit);
}

/* ─────────────────────────── provenance, at strip width ─────────────────────────── */

/**
 * `AI · run 5`, `uploaded · T.` — the provenance line of a cell in an input strip.
 *
 * NOT `slotFootnote`, WHICH IS THE BENCH'S. That one composes the label, the spoken handle AND the
 * batch's whole stamp — `AI · run 5 · run 5 · a`, or `uploaded · upload 1 · a · T. · 09:00 · 12 MB
 * · 3 files` — which is right under a 196px bench plate with a whole footer to itself, and is four
 * wrapped lines under a 132px strip cell that has three. The strip asks a narrower question, so it
 * gets the narrower answer, and it is the prototype's own: the machine and its run, or the hand and
 * whose it was.
 */
export function stripProvenance(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
): string {
  const provenance = readProvenance(picture);
  const parts = [provenanceLabel(provenance)];
  if (provenance.batchId) {
    const batch = (band.batches ?? []).find((b) => b.id === provenance.batchId);
    const author = (batch?.author ?? '').trim();
    if (author) parts.push(author);
  }
  const mixed = mixedInputNote(provenance);
  if (mixed) parts.push(mixed);
  return parts.filter(Boolean).join(' · ');
}

/* ─────────────────────────── frames and thumbnails ─────────────────────────── */

/**
 * The address of the file to draw in a strip cell. Thumbnail first — a cell is 132px wide, not
 * 2000 — and never a bare `media.id`, which draws nothing.
 */
export function pictureThumb(picture?: common_DesignPicture | null): string {
  const media = picture?.media?.media;
  return media?.thumbnail?.mediaUrl || media?.compressed?.mediaUrl || media?.fullSize?.mediaUrl || '';
}

export function mediaThumb(media?: common_MediaFull | null): string {
  const item = media?.media;
  return item?.thumbnail?.mediaUrl || item?.compressed?.mediaUrl || item?.fullSize?.mediaUrl || '';
}
