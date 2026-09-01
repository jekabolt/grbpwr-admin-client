import type {
  GetDesignBandResponse,
  common_Color,
  common_DesignBenchSlot,
  common_DesignColourRecipe,
  common_DesignPicture,
  common_DesignRun,
  common_MediaFull,
  googletype_Decimal,
} from 'api/proto-http/admin';
import { parseDecimalNumber } from 'utils/decimal';

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
 * The run a picture came out of, when that run is on the loaded page.
 *
 * `GetDesignBand` returns only the FIRST page of the feed, with each run's pictures already under
 * it — so a picture reached THROUGH `band.runs` always finds its run here. The ones that may not
 * are the plates reached through a bench slot: `slot.picture` is resolved server-side precisely
 * because it is routinely older than the page. Null therefore means «not on this page», never «no
 * run» — for that, read `runId`.
 */
export function runOfPicture(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
): common_DesignRun | null {
  const runId = picture.runId ?? 0;
  if (runId <= 0) return null;
  return (band.runs ?? []).find((run) => run.id === runId) ?? null;
}

/**
 * `flat | render | threed | draft_idea`, or '' when it cannot be told.
 *
 * READ OFF THE RUN AND NOT OFF `picture.kind`, and that is the whole point of this function. The
 * contract spells the run's vocabulary in as many words and freezes it at launch; `DesignPicture.
 * kind` is an open string whose members this bundle has never seen in production, and a filter
 * written against a dictionary you have not seen silently empties a picker — the trap `bench-slot`
 * already documents for the bench. A batch picture answers '' because a manual upload is not a run
 * at all, which is exactly what makes it a legal FLAT input.
 */
export function runKindOf(band: GetDesignBandResponse, picture: common_DesignPicture): string {
  const run = runOfPicture(band, picture);
  return (run?.kind ?? '').trim().toLowerCase();
}

/** The picture's own declared kind, normalised. Corroborating evidence only — see `runKindOf`. */
function declaredKind(picture: common_DesignPicture): string {
  return (picture.kind ?? '').trim().toLowerCase();
}

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
  const kind = runKindOf(band, picture) || declaredKind(picture);
  // ═══ `recolor` ДОБАВЛЕН СЮДА ВОЛНОЙ K-17 ══════════════════════════════════════════════════
  //
  // Перекрашенный снимок — ВЫВОД ГЕНЕРАТИВНОЙ МАШИНЫ, то есть ровно то «положительное
  // свидетельство», по которому этот предикат и отказывает. Без строки ниже он попадал бы в
  // правую половину полосы «input — flats of this card» как законный чертёж — а это фотография
  // вещи на живом человеке, и отдать её фабрик-рендеру значило бы просить перерисовать снимок
  // как флэт.
  //
  // ⚠ ОН НЕ ЛОВИТСЯ РОДОМ КАРТИНКИ, И ЭТО НЕ МЕЛОЧЬ: вывод рекола объявляет `kind: "render"`
  // собственным полем, поэтому отказывает ему ТОЛЬКО чтение рода ПРОГОНА (`runKindOf`) —
  // в точности то, ради чего эта функция читает прогон первым.
  //
  // СОСЕДНИЙ СЛУЧАЙ, КОТОРЫЙ ЗДЕСЬ НЕ ЗАКРЫТ И ПРИНАДЛЕЖИТ ДРУГОЙ ВОЛНЕ: `pattern` (K-13).
  // Плитка объявляет собственный род и потому уже отсеивается родом картинки, но не родом
  // прогона; владельцу того экрана стоит решить, дописывать ли сюда его имя.
  return kind !== 'render' && kind !== 'threed' && kind !== 'recolor';
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
 */
export type BenchKind = 'flat' | 'render';

export function benchKindOf(slot?: common_DesignBenchSlot | null): string {
  return (slot?.kind ?? '').trim().toLowerCase() || 'flat';
}

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
export function benchSides(band: GetDesignBandResponse, kind: BenchKind = 'flat'): BenchSide[] {
  const byView = new Map<string, common_DesignBenchSlot>();
  for (const row of band.bench ?? []) {
    if (benchKindOf(row) !== kind) continue;
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
function markedPictureIds(band: GetDesignBandResponse, kind: BenchKind = 'flat'): Set<number> {
  const ids = new Set<number>();
  for (const side of benchSides(band, kind)) {
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
export function threedSides(band: GetDesignBandResponse): BenchSide[] {
  return benchSides(band, 'render');
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
export function threedCandidates(band: GetDesignBandResponse): ThreedCandidate[] {
  const marked = markedPictureIds(band, 'render');
  const byId = picturesById(band);
  const out: ThreedCandidate[] = [];
  const seen = new Set<number>();
  const push = (pictures: common_DesignPicture[] | undefined | null) => {
    for (const picture of pictures ?? []) {
      const id = picture.id ?? 0;
      if (id <= 0 || marked.has(id) || seen.has(id)) continue;
      if (isPictureHidden(picture)) continue;
      const kind = runKindOf(band, picture) || declaredKind(picture);
      if (kind !== 'render') continue;
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
export function chosenRenderPlacements(band: GetDesignBandResponse): ChosenPlacement[] {
  const bySide = new Map(threedSides(band).map((side) => [side.view as string, side]));
  /** Победитель каждой стороны — чтобы проигравший приписывался К НЕМУ, а не считался нигде. */
  const won = new Map<string, ChosenPlacement>();
  const out: ChosenPlacement[] = [];
  for (const candidate of threedCandidates(band)) {
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
 * EVERY OUTPUT OF ONE KIND THIS PAGE OF THE BAND HOLDS — the renders, or the turntable frames.
 *
 * READ OFF THE RUN, like everything else here (`runKindOf`): `picture.kind` is an open string whose
 * production vocabulary this bundle has never seen, and a list filtered against a dictionary you
 * have not seen empties silently. Hidden pictures are dropped — `hidden_at` is the one persistent
 * verb for invisibility and a screen that ignores it shows a plate its owner has already withdrawn.
 *
 * PAGE-BOUND, AND EVERY CALLER SAYS SO. The band ships one page of the merged feed; this is what
 * that page carries, newest run first, and never a claim about the whole card.
 */
export function outputsOfKind(
  band: GetDesignBandResponse,
  kind: 'render' | 'threed',
): { picture: common_DesignPicture; run: common_DesignRun }[] {
  const out: { picture: common_DesignPicture; run: common_DesignRun }[] = [];
  for (const run of band.runs ?? []) {
    if ((run.kind ?? '').trim().toLowerCase() !== kind) continue;
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

export type BudgetLine = {
  spent: number;
  reserved: number;
  cap: number;
  currency: string;
  /** `spent + reserved` — what the ceiling is actually compared against. */
  booked: number;
  exhausted: boolean;
  /** `today $0.41 of $2.00`, already formatted. */
  text: string;
};

function decimalNumber(value?: googletype_Decimal | null): number {
  const parsed = parseDecimalNumber(value?.value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * `$0.41`, or `0.41` when the currency is not one `Intl` knows.
 *
 * THE TRY/CATCH IS LOAD-BEARING. `Intl.NumberFormat` throws `RangeError` on an unknown currency
 * code, and the code is on the wire precisely so the bar never hard-codes `$` — so a server that
 * one day answers with something this runtime does not recognise would otherwise take the studio
 * white on a money label.
 */
export function formatMoney(amount: number, currency: string): string {
  const code = (currency ?? '').trim().toUpperCase();
  if (code) {
    try {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: code,
        // `narrowSymbol`, or an en-GB locale renders USD as `US$0.41` — technically correct and
        // unreadable in a one-line money bar that already says which day it is about.
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      /* falls through to the plain number below */
    }
  }
  return amount.toFixed(2);
}

/**
 * The band's money bar, or null.
 *
 * NULL IS A FIRST-CLASS ANSWER: every money field is stripped for an account without
 * `costing:read`, and the contract says such a band must show NO BAR AT ALL — a bar with blanks in
 * it reads as «the budget is zero», which is a different and false statement. A cap of zero is read
 * the same way: no ceiling was stated, so no ceiling is claimed and nothing is ever refused on it.
 */
export function budgetLine(band: GetDesignBandResponse): BudgetLine | null {
  const budget = band.budget;
  if (!budget) return null;
  const cap = decimalNumber(budget.cap);
  if (cap <= 0) return null;
  const spent = decimalNumber(budget.spent);
  const reserved = decimalNumber(budget.reserved);
  const currency = (budget.currency ?? '').trim();
  const booked = spent + reserved;
  const reservedText = reserved > 0 ? ` · ${formatMoney(reserved, currency)} reserved` : '';
  return {
    spent,
    reserved,
    cap,
    currency,
    booked,
    exhausted: booked >= cap,
    text: `today ${formatMoney(spent, currency)} of ${formatMoney(cap, currency)}${reservedText}`,
  };
}

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
export function renderGate(band: GetDesignBandResponse): Gate {
  const budget = budgetLine(band);
  if (budget?.exhausted) {
    return {
      ok: false,
      // БЕЗ СУММ (T-12: «нам надо показывать только цену генерации и все»). Отказ обязан назвать
      // ПРИЧИНУ, а причина — «день исчерпан», а не «сколько именно». Числа жили здесь ещё и в
      // подсказке инертной двери, то есть на экране, стоило навести указатель.
      reason: "today's generation ceiling is reached — no new run starts until it resets",
    };
  }
  const sides = benchSides(band);
  const missing = sides
    .filter((side) => side.view === 'front' || side.view === 'back')
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
 * THE SERVER'S OWN ANSWER TO «MAY 3D BE ASKED FOR AT ALL» — W-13, read and never recomputed.
 *
 * `has_fabric_render` is on the band response precisely so the interface does not have to derive
 * it: `StartDesignRun` refuses `kind=threed` without an unhidden fabric render, and a client
 * counting renders off the page it was handed would be wrong by exactly the renders that are NOT on
 * that page — the usual case on a card with any history. So a screen that computed its own answer
 * would draw the door open and collect a refusal, or draw it shut over a card that is ready.
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

export function threedGate(band: GetDesignBandResponse): Gate {
  // THE SERVER'S REFUSAL COMES FIRST, so the client's first sentence about 3D is the same sentence
  // the server would answer with. The finer conditions below are about assembling ONE turntable out
  // of four sides and are the client's own; they can only narrow this, never widen it.
  const fabric = fabricRenderGate(band);
  if (!fabric.ok) return fabric;
  const budget = budgetLine(band);
  if (budget?.exhausted) {
    return {
      ok: false,
      // БЕЗ СУММ (T-12: «нам надо показывать только цену генерации и все»). Отказ обязан назвать
      // ПРИЧИНУ, а причина — «день исчерпан», а не «сколько именно». Числа жили здесь ещё и в
      // подсказке инертной двери, то есть на экране, стоило навести указатель.
      reason: "today's generation ceiling is reached — no new run starts until it resets",
    };
  }
  const sides = threedSides(band);
  const front = sides.find((side) => side.view === 'front');
  if (!front?.picture) {
    // ОТКАЗ НАЗЫВАЕТ ДВЕРЬ, КОТОРАЯ ЕГО СНИМАЕТ. Человек, пометивший рендеры в «renders of this
    // card», приходит сюда именно с вопросом «а где они»; отказ, который про них молчит, отправляет
    // его искать ошибку в генерации.
    const chosen = chosenRenderPlacements(band).length;
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
 * module only REPEATS that ranking to the human (`FABRIC_AUTHORITY`); a client that resolved the
 * conflict for itself would be a second opinion about a question the prompt has already answered,
 * and the two would drift the first day one of them was edited.
 */
export const FABRIC_AUTHORITY =
  'the photo states the material · the picked colour overrides the photo\u2019s colour · the words only add what neither states';

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

/** A hex a browser will actually paint. Three or six digits, the two shapes `<input type='color'>`
 *  and CSS agree on; anything else is a half-typed value and must not reach a swatch. */
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function hexIsPaintable(hex?: string | null): boolean {
  return HEX_RE.test((hex ?? '').trim());
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

export function findDictionaryColour(
  colors: readonly common_Color[] | undefined,
  code?: string | null,
): common_Color | null {
  const wanted = (code ?? '').trim().toUpperCase();
  if (!wanted) return null;
  return (colors ?? []).find((c) => (c.code ?? '').trim().toUpperCase() === wanted) ?? null;
}

/**
 * The swatch fill of a recipe, or '' when no colour is stated. '' is drawn as a striped surface,
 * never as black — an unknown colour that paints itself black is a lie a swatch tells convincingly,
 * and a photo-only recipe genuinely has no colour of its own on this screen.
 *
 * A TYPED HEX OUTRANKS THE DICTIONARY'S OWN, because a person who types one after picking a code is
 * stating a deviation from that code and the swatch has to show the deviation.
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
 * A HEX THAT DEVIATES FROM ITS CODE IS NAMED AS A DEVIATION, not swallowed. Picking a dictionary
 * colour fills BOTH halves (the code and the hex it stands for), so the only way the two can differ
 * is that a person typed over the hex afterwards — a deliberate shift. Printing «OLV · olive drab»
 * over a swatch painted red would be the screen contradicting itself in the two places a person
 * actually looks, and the prompt does not: it sends the code as a name and the hex as the exact
 * value (`colourStatement`, renderprompt.go). The headline says the same thing.
 */
export function colourLabel(
  recipe: common_DesignColourRecipe | null | undefined,
  colors: readonly common_Color[] | undefined,
): string {
  const stated = fabricStatement(recipe);
  const code = (recipe?.code ?? '').trim().toUpperCase();
  const hex = (recipe?.hex ?? '').trim().toLowerCase();
  if (code) {
    const entry = findDictionaryColour(colors, code);
    const named = entry?.name ? `${code} · ${entry.name}` : code;
    const dictHex = (entry?.hex ?? '').trim().toLowerCase();
    if (hexIsPaintable(hex) && dictHex && hex !== dictHex) return `${code} → ${hex}`;
    return named;
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
    const code = (recipe?.code ?? '').trim().toUpperCase();
    const hex = (recipe?.hex ?? '').trim().toLowerCase();
    const entry = findDictionaryColour(colors, code);
    if (code && !entry) {
      parts.push(`${code} — not in this dictionary, the code travels and the hex cannot`);
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
