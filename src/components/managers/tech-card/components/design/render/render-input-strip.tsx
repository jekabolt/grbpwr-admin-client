import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type {
  GetDesignBandResponse,
  common_DesignBatch,
  common_DesignPicture,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { cn } from 'lib/utility';
import { Fragment, useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

import { pictureRepresentation } from '../bench-kinds';
import { cropFamilies, cutPiecesWord } from '../generation/composite';
import { CropDeck, DECK_PEEK_MAX } from '../generation/crop-deck';
import { VectorModal } from '../modals';
import { readProvenance } from '../provenance';
import { useSplitToInput } from '../split-to-input';
import { designKeys, newClientRequestId, useDesignWrites } from '../use-design-band';
import { isPictureHidden } from '../visibility';
import {
  SILHOUETTE_VIEWS,
  isSilhouetteView,
  normaliseViewKey,
  viewLabel,
  type SilhouetteView,
} from '../views';
import { ApplySplitDoor, type SplitPiece } from './apply-split';
import { uploadItem } from '../upload-item';
import {
  RENDER_MIN_VIEWS,
  benchSides,
  feedIsTruncated,
  pictureOffersSplit,
  pictureThumb,
  stripProvenance,
  unmarkedFlats,
} from './model';
import {
  CELL_WIDTH,
  EmptyStripCell,
  STRIP_CELL_PX,
  STRIP_FRAME_ASPECT,
  Strip,
  StripCell,
  StripDivider,
} from './strip-cell';

/**
 * INPUT — FLATS OF THIS CARD. What a fabric render is actually made from.
 *
 * THE LINE DOWN THE MIDDLE IS THE WHOLE ORGAN. Left of it: the drawings the render reads, one per
 * view, each with its provenance — which is the bench, seen from the render's side rather than the
 * sheet's. Right of it: every other flat this card holds, generated or brought by hand, each with a
 * `mark ▸` that puts it in a slot. The two halves are the same pictures under two different
 * questions.
 *
 * THE TWO HALVES ARE GATHERED FROM DIFFERENT PLACES, and they have to be. A bench slot carries its
 * RESOLVED plate however old the picture is, so the left side is always complete. The right side
 * can only list what the band shipped — one page of the feed — so when there is more, the COUNT in
 * the section head says so rather than letting a technologist conclude that a drawing he uploaded
 * last week has disappeared.
 *
 * THE SECTION HOLDS DRAWINGS AND NOTHING ELSE (E-7). It held the card's CLOTHS for two waves —
 * `+ cloth` stood in this very strip, between the view slots and the line — and the owner has now
 * moved that whole setting into the render's own menu, under TEXTURE & COLOUR. The note further
 * down records what left and where it went; the point here is that the title is true again.
 *
 * A HAND FILE WAS ALWAYS LEGAL INPUT HERE. Nothing on this card requires a run: an uploaded flat
 * sits on the right of the line exactly like a generated one, marks into a slot exactly like one,
 * and feeds the render exactly like one. That is why the classification refuses a picture only on
 * positive evidence that it is an OUTPUT of the machine (see `isFlatCandidate`), and admits
 * everything else.
 *
 * ЭТОТ ЭКРАН НЕ ДЕРЖИТ СВОЕГО ПРОСМОТРЩИКА (T-8). Ячейка объявляет только КАДР (`gallery`), а
 * показывает его ОДИН `PictureGalleryProvider` на всю студию (смонтирован в `studio-tab.tsx`). Ряд
 * собирают сами плитки и сортируются по порядку в документе, поэтому человек листает ровно то,
 * что видит.
 *
 * ═══ ПРАВАЯ ПОЛОВИНА БЫЛА СВАЛКОЙ ЛЕНТЫ — F-3/F-4, КРУГ 17 ═══════════════════════════════════
 *
 * Владелец, дословно: «в FABRIC RENDER в INPUT — FLATS OF THIS CARD после дивайдера медиа должны
 * показываться только сортировка флеты а не как сейчас все подряд» и «там также должны
 * отображаться сплиты так как мы их отображаем с возможностью колапса анколапса и там на ховер мы
 * должны мочь сплитнуть и заэдитить а не только призумить».
 *
 * ЗАМЕР ДО ПРАВКИ (`tmp/dsgprobe/f34-measure.mjs`, карточка формы беты — все шесть родов прогонов,
 * разрезанный лист, неразрезанный лист, ручная загрузка). Справа от линии стояло 13 плиток:
 *
 *   40, 41, 42 · 20, 21, 22 · 31, 32, 33 · 90, 91 · 30 · 34
 *   ─────────────  ─────────  ──────────  ──────  ──  ──
 *   vector-прогон   свободные   ТРИ КУСКА   руками  ЛИСТ, ЛИСТ
 *                               ЛИСТА 30            из которого
 *                                                   вырезаны 31–33
 *
 * РОД ЗДЕСЬ БЫЛ НИ ПРИ ЧЁМ: ни одного рендера, ни одного паттерна, ни одной модели справа от линии
 * не стояло — `isFlatCandidate` их отсекает, и на бете тоже (перепись родов: flat/flat 20,
 * render/render 20, flat/NULL 19, threed/threed 4, flat/vector 3, pattern/pattern 3, render/NULL 2,
 * render/recolor 2 — род картинки согласован со своим прогоном). «Все подряд» — это ДВА других
 * дефекта, и замер называет оба:
 *
 *  1. ОДИН ЧЕРТЁЖ СТОЯЛ ДВАЖДЫ. Кусок разреза наследует род и прогон родителя на сервере, поэтому
 *     приходит сюда законным флэтом и попадал в общий ряд ОТДЕЛЬНОЙ плиткой — а лист, из которого
 *     его вырезали, стоял в том же ряду пятью плитками дальше. Тот же материал, показанный два
 *     раза под двумя разными видами, и есть «все подряд».
 *  2. ПОРЯДКА НЕ БЫЛО ВОВСЕ. Ряд шёл порядком ОБХОДА ЛЕНТЫ: прогоны новейшим первым, картинки
 *     внутри прогона по возрастанию, а `batches` — ПОСЛЕ всех прогонов. То есть самые свежие
 *     картинки карточки (ручная загрузка 90, 91) стояли предпоследними, а трёхдневный vector-прогон
 *     открывал ряд. Прочесть этот порядок глазом нельзя, и никакой другой ответ он не даёт.
 *
 * ПОРЯДОК ТЕПЕРЬ ОБЪЯВЛЕН И СОСТОИТ ИЗ ДВУХ КЛЮЧЕЙ:
 *   · сначала одиночные чертежи, потом склеенные листы. Это НЕ вкус: одиночный помечается В ОДНУ
 *     сторону, лист адресует ВЕСЬ вход сразу, и жест, переписывающий четыре слота, обязан стоять
 *     после жестов, переписывающих один (довод E-6, он пережил эту правку целиком);
 *   · внутри каждой группы — новейшее первым, по id картинки. Тот же порядок, которым отвечает
 *     `outputs` (`ORDER BY id DESC`) и которым стоит соседний раздел RENDERS OF THIS CARD. Второй
 *     порядок на соседних полосах одного экрана — это и есть «везде по разному».
 *
 * КУСКИ УШЛИ ЗА СВОЙ ЛИСТ, В КОЛОДУ (F-4). Ровно тем же органом, что в RENDERS OF THIS CARD:
 * `CropDeck` с веером из трёх третей, дверь `expand ▸` в ряду дверей ячейки, раскрытая группа на
 * затемнённом грунте. Никакого второго приёма здесь не заведено — ни своей кнопки, ни своего
 * состояния: правило «уже разрезанному листу не пишем split, пишем expand» принадлежит соседнему
 * экрану, и эта полоса ему подчиняется, а не спорит с ним.
 *
 * ═══ ТРЕТЬЯ ПРОСЬБА — D-5, КРУГ 18: «все подряд» БЫЛО ИЗМЕРЕНО НЕ НА ТОЙ КАРТОЧКЕ ═══════════════
 *
 * Владелец, дословно: «INPUT — FLATS OF THIS CARD все еще после дивайдера не показывают фильтр по
 * флетам а там все подряд я прошу это 3 раз уже сколько можно».
 *
 * ЗАМЕР КРУГА 17 (выше) МЕРИЛ ФИКСТУРУ, У КОТОРОЙ ВСЯ КАРТОЧКА ЛЕЖАЛА НА ОДНОЙ СТРАНИЦЕ. Замер
 * круга 18 сделан на ЖИВОЙ карточке беты (tech_card 38, 73 картинки, 28 прогонов, 21 партия) по
 * строкам базы, и картина другая:
 *
 *   · `GetBand` отдаёт ДВЕНАДЦАТЬ строк ленты (DefaultRunPageLimit, архивные включены). На этой
 *     карточке это прогоны 28…17 — перекрас, четыре рендера, три плитки, два 3D, один vector, — и
 *     на всей странице стоит ОДИН чертёж (#66). Все прогоны рода flat (2, 4, 6, 13, 14, 16) — на
 *     второй странице и дальше. `unmarkedFlats` обходит СТРАНИЦУ, значит справа от линии из
 *     сгенерированных чертежей не стояло НИ ОДНОГО;
 *   · `outputs` собирается сервером по предикату `r.kind IN (render, threed, pattern, recolor)` —
 *     ФЛЭТОВ В НЁМ НЕТ ВОВСЕ. `cardOutputRows(band, 'flat')` на бете — пустой (истинный!) массив,
 *     ветка обхода ленты в `splitDecks` не исполняется никогда, и склеенных листов эта полоса на
 *     живой карточке НЕ ПОКАЗЫВАЛА — при семи листах на карточке;
 *   · в двенадцати новейших партиях — 14 ручных загрузок рода `flat` (род ставит дверь `+ flat`,
 *     а не содержимое файла): среди них фотография модели (#7), фабрик-рендер, принесённый через
 *     флэтовую дверь (#79), два скана карандашных эскизов (#26, #41) и три листа, разрезанные
 *     руками (#1, #26, #41), чьи куски стояли РЯДОМ с листом — `composite_views` у ручного файла
 *     пуст, и `splitDecks` такой лист листом не считает.
 *
 *   Итого справа от линии стояло: 1 чертёж машины + 14 загрузок (из них 7 — куски трёх листов,
 *   показанные второй раз) + 0 листов. То есть буквально ВСЁ, КРОМЕ ФЛЭТОВ. Три раза.
 *
 * ЧТО СДЕЛАНО, ТРИ ВЕЩИ, И КАЖДАЯ ЗАКРЫВАЕТ СВОЮ СТРОКУ ЗАМЕРА:
 *   1. ПРАВАЯ ПОЛОВИНА ЧИТАЕТ ВСЮ КАРТОЧКУ. Когда лента усечена, полоса сама дочитывает её до
 *      конца (`useWholeCardFeed`: `ListDesignRuns` от курсора полосы, по 24 строки, архивные
 *      включены — тот же вызов и тот же флаг, что у продолжения ленты в `useMoreHistory`), и
 *      правая половина считается по СКЛЕЕННОЙ полосе. Левая половина этого не требовала никогда:
 *      слот приезжает разрешённым. Пока дочитывание идёт, счётчик так и говорит; если оно
 *      отказало — стоит прежняя оговорка «newest page only», и это честно;
 *   2. ЛИСТ — ЭТО КОРЕНЬ РОДОСЛОВНОЙ, А НЕ ПОЛЕ `composite_views`. Колоду получает КАЖДЫЙ кадр, из
 *      которого что-то вырезано (`flatSheets`), объявил он виды или нет: ручной лист, который
 *      человек разрезал сам, — лист по факту разреза. Строится здесь же, из той же родословной
 *      (`cropFamilies`), а не через `splitDecks`: тот читает `outputs`, в которых флэтов нет;
 *   3. ФИЛЬТР ПО ПРОИСХОЖДЕНИЮ СТОИТ СРАЗУ ЗА ЛИНИЕЙ — тем самым органом, о котором владелец
 *      спрашивает словом «фильтр»: ряд чипов `all · generated · uploaded · drawn`, числами. Род
 *      картинки здесь ничего не различает (все они `flat`), различает ПРОИСХОЖДЕНИЕ, и оно уже
 *      напечатано под каждым кадром (`stripProvenance`) — чип лишь позволяет по нему сузить.
 *      Умолчание — `all`: то, что человек только что принёс через `+ flat`, обязано остаться на
 *      экране, а не исчезнуть под фильтром, который он не ставил.
 */

/** Radix forbids an empty item value, and an empty one reaching `Select.Root` shows a placeholder
 *  where a label should be — so «mark ▸» is a sentinel, never `''`. */
const MARK_PROMPT = '__mark__';

/**
 * ═══ ЧТО ДЕЛАЕТ ПОМЕТКА — ТЕПЕРЬ ГОВОРИТ САМА ДВЕРЬ (F-5) ════════════════════════════════════
 *
 * Владелец снял абзац под лентой, и в нём был ОДИН факт, которого человек иначе не узнает:
 * «Marking a single flat displaces the picture that held that slot; nothing is deleted».
 *
 * ФАКТ ОСТАЛСЯ, НО СТАЛ СОСТОЯНИЕМ, А НЕ ПРОЗОЙ, и стоит он там, где решение и принимают:
 *   · пункт занятой стороны в списке подписан `· in use` — то есть «выберешь эту — вытеснишь»,
 *     сказанное СПИСКОМ СТОРОН в момент выбора, а не абзацем в подвале;
 *   · сама дверь несёт полное предложение подсказкой, включая «ничего не удаляется».
 * Абзац отвечал на этот вопрос ОДИН РАЗ НА ВСЮ ЛЕНТУ и до того, как его задали; подпись пункта
 * отвечает на него у той стороны, о которой спрашивают.
 */
const MARK_TITLE =
  'mark puts this drawing into a slot of the input. A side that already holds one gives it up: ' +
  'the displaced drawing stays on this card and comes back to the right of the line. Nothing is deleted.';

/**
 * ═══ ОХВАТ ПРАВОЙ ПОЛОВИНЫ — ТЕПЕРЬ ОГОВОРКА ПРИ СЧЁТЕ (F-5) ═════════════════════════════════
 *
 * Вторая снятая простыня говорила: «The right of the line lists the flats of the newest page;
 * older ones are still on the card and still in their slots». Это утверждение о ЧИСЛЕ — сколько
 * из того, что есть на карточке, полоса показала, — и место такому утверждению у самого числа.
 * Оговорка `newest page only` дописывается к счётчику ровно тогда, когда лента усечена, и несёт
 * подсказку. Абзац стоял под лентой ВСЕГДА, в том числе на карточке в одну страницу, где
 * оговаривать было нечего.
 *
 * ⚠ КРУГ 19: ПОДСКАЗКА УКОРОЧЕНА ДО ПЕРВОГО ПРЕДЛОЖЕНИЯ. Владелец снял абзац, а закрывающая его
 * клауза («older ones are still on the card and still standing in their slots») пережила снос
 * здесь, в `title=`, и была найдена разведкой. Осталось ровно то, ради чего подсказка и висит у
 * числа: лента УСЕЧЕНА и почему.
 */
const PAGE_TITLE = 'this card has more history than one page, and reading the older pages failed.';

const READING_TITLE =
  'this card has more history than one page — the older pages are being read now, and their ' +
  'drawings join the right of the line as they arrive.';

/**
 * ═══ ДОЧИТАТЬ ЛЕНТУ ДО КОНЦА — D-5 ═════════════════════════════════════════════════════════════
 *
 * Тот же вызов, тот же размер страницы и тот же флаг архивных, что у продолжения ленты
 * (`useMoreHistory`): `ListDesignRuns` от курсора, который полоса уже принесла, `include_archived`
 * — потому что сам `GetBand` архивные включает и курсор минчен над тем же множеством («THE TOKEN
 * WINS»). Ключ — под ключом полосы, поэтому каждая запись верстака, инвалидируя полосу, сбрасывает
 * и это чтение: правая половина не может показать чертёж, которого на карточке уже нет.
 *
 * ⚠ КУРСОР — ЧАСТЬ КЛЮЧА. Новый прогон сдвигает первую страницу и меняет курсор; чтение под
 * старым курсором пропустило бы строку, ушедшую со страницы на вторую, и она исчезла бы с экрана
 * ровно на время, пока никто не заметит. Новый курсор — новый ключ и новое чтение.
 *
 * ⚠ ПОТОЛОК СТРАНИЦ НАЗВАН ЧИСЛОМ, А НЕ ОСТАВЛЕН НА «ПОКА НЕ КОНЧИТСЯ». Двадцать страниц по 24 —
 * 480 строк ленты; карточка длиннее этого — не карточка, а склад, и полоса тогда честно скажет,
 * что читала не всё, вместо того чтобы читать минуту.
 */
const WALK_PAGE_LIMIT = 24;
const WALK_PAGE_CAP = 20;

type WholeFeed = {
  runs: common_DesignRun[];
  batches: common_DesignBatch[];
  /** whole — вся карточка на экране; reading — идёт; failed / capped — показана не вся. */
  state: 'whole' | 'reading' | 'failed' | 'capped';
};

function useWholeCardFeed(techCardId: number, band: GetDesignBandResponse): WholeFeed {
  const token = (band.nextPageToken ?? '').trim();
  const query = useQuery({
    queryKey: [...designKeys.band(techCardId), 'input-flats', token] as const,
    enabled: techCardId > 0 && !!token,
    queryFn: async () => {
      const runs: common_DesignRun[] = [];
      const batches: common_DesignBatch[] = [];
      let cursor = token;
      let pages = 0;
      while (cursor && pages < WALK_PAGE_CAP) {
        const page = await adminService.ListDesignRuns({
          techCardId,
          limit: WALK_PAGE_LIMIT,
          pageToken: cursor,
          includeArchived: true,
        });
        runs.push(...(page.runs ?? []));
        batches.push(...(page.batches ?? []));
        cursor = (page.nextPageToken ?? '').trim();
        pages += 1;
      }
      return { runs, batches, complete: !cursor };
    },
    staleTime: 60_000,
  });

  return useMemo<WholeFeed>(() => {
    if (!token) return { runs: [], batches: [], state: 'whole' };
    if (query.data) {
      return {
        runs: query.data.runs,
        batches: query.data.batches,
        state: query.data.complete ? 'whole' : 'capped',
      };
    }
    return { runs: [], batches: [], state: query.isError ? 'failed' : 'reading' };
  }, [token, query.data, query.isError]);
}

/**
 * ═══ ПРОИСХОЖДЕНИЕ — ЕДИНСТВЕННОЕ, ЧЕМ ЧЕРТЕЖИ СПРАВА ОТ ЛИНИИ РАЗЛИЧАЮТСЯ (D-5) ═══════════════
 *
 * Род у них один (`flat`) — его ставит дверь, через которую файл вошёл, а не содержимое. Что
 * различает фотографию модели, принесённую через `+ flat`, и чертёж, нарисованный машиной, — это
 * `source_class`, и он уже читается ОДНИМ читателем на всю полосу (`readProvenance`) и печатается
 * под каждым кадром. Чип — тот же словарь, свёрнутый до трёх семейств: слово «generated» покрывает
 * `ai` и `ai + edits` (правка машинного чертежа — по-прежнему машинный чертёж), «uploaded» —
 * файл и импортированный SVG, «drawn» — векторную основу, нарисованную с нуля.
 *
 * `null` — происхождение неизвестно (открытый словарь, новый сервер): такой кадр стоит под `all`
 * и ни под одним семейством, а семейства, которых на карточке нет, чипов не получают.
 */
type Origin = 'generated' | 'uploaded' | 'drawn';
type OriginFilter = 'all' | Origin;
const ORIGINS: { value: Origin; label: string; hint: string }[] = [
  { value: 'generated', label: 'generated', hint: 'drawn by the machine — a FLAT run, or an edit of one' },
  { value: 'uploaded', label: 'uploaded', hint: 'brought in by hand — a file or an imported SVG' },
  { value: 'drawn', label: 'drawn', hint: 'a vector base drawn from nothing' },
];

function originOf(picture: common_DesignPicture): Origin | null {
  switch (readProvenance(picture).sourceClass) {
    case 'ai':
    case 'ai_edits':
      return 'generated';
    case 'uploaded':
    case 'imported_svg':
      return 'uploaded';
    case 'drawn':
      return 'drawn';
    default:
      return null;
  }
}

/** Лист полосы входа: корень родословной с его кусками — объявил он виды или нет.
 *  ⚠ ЭКСПОРТИРУЕТСЯ ДЛЯ ПОЛОСЫ ВХОДА 3D, у которой то же правило (D-9). Дом этого типа и
 *  `sheetsOf` — рядом со `splitDecks` в `./apply-split.tsx`; файл чужой для этой волны, перенос
 *  назван в отчёте. Второе написание правила «лист = корень с кусками» здесь не заведено. */
export type FlatSheet = {
  sheet: common_DesignPicture;
  /** Виды, которые лист ОБЪЯВЛЯЕТ (`composite_views`). Пусто у ручного листа — его разрез и есть
   *  единственное, что о нём известно. */
  declared: string[];
  /** Куски, которые полоса вправе предложить (не в слоте). Это то, что рисуется за листом. */
  members: common_DesignPicture[];
  /** Из них — по одному на сторону силуэта, в порядке обхода: вход `apply splitted`. */
  pieces: SplitPiece[];
};

/**
 * ═══ ЛИСТ — ЭТО КОРЕНЬ РОДОСЛОВНОЙ, А НЕ ПОЛЕ (D-5) ════════════════════════════════════════════
 *
 * Здесь стоял `splitDecks(band, 'flat')`, и на живой бете он возвращал ПУСТО ВСЕГДА: тот читает
 * `outputs`, а сервер собирает `outputs` по родам render|threed|pattern|recolor — флэты в него не
 * входят по предикату, а массив при этом непустой (рендеры), поэтому и запасная ветка обхода
 * ленты не исполнялась. Семь склеенных листов карточки 38 полоса не показывала ни разу.
 *
 * Правило теперь одно и совпадает с соседним экраном (`render/outputs.tsx`): колоду получает
 * КАЖДЫЙ кадр, из которого что-то вырезано, — `cropFamilies` над всем пулом чертежей карточки. Лист
 * с объявленными видами, но ещё не разрезанный, — тоже лист: у него другая дверь (`split ▸`).
 * Ручной файл, разрезанный человеком через окно разреза, — лист ПО ФАКТУ, хотя `composite_views` у
 * него пуст: его куски стояли справа от линии рядом с ним самим, и это была половина «все подряд».
 *
 * ⚠ КОРЕНЬ, СТОЯЩИЙ В СЛОТЕ, КОЛОДЫ НЕ ПОЛУЧАЕТ. Он живёт слева от линии; его куски остаются
 * одиночными чертежами — прятать их за лист, которого справа нет, значило бы потерять их молча.
 */
export function sheetsOf(
  pool: common_DesignPicture[],
  families: ReturnType<typeof cropFamilies>,
  offered: Set<number>,
): FlatSheet[] {
  const out: FlatSheet[] = [];
  for (const sheet of pool) {
    const id = sheet.id ?? 0;
    if (id <= 0 || families.rootOf.has(id)) continue;
    const declared = (sheet.compositeViews ?? []).filter(Boolean);
    const members = (families.membersOf.get(id) ?? []).filter((member) =>
      offered.has(member.id ?? 0),
    );
    const composite = declared.length > 0;
    // Одиночный чертёж без разреза — не лист. Лист без разреза — лист, если он объявил виды.
    if (!composite && !members.length) continue;
    // Корень в слоте — слева от линии; композит в слот не встаёт, значит слева его не бывает.
    if (!composite && !offered.has(id)) continue;

    const seen = new Set<string>();
    const pieces: SplitPiece[] = [];
    for (const piece of members) {
      const view = normaliseViewKey(piece.ghostView);
      if (!isSilhouetteView(view) || seen.has(view)) continue;
      seen.add(view);
      pieces.push({ view: view as SilhouetteView, picture: piece });
    }
    pieces.sort((a, b) => SILHOUETTE_VIEWS.indexOf(a.view) - SILHOUETTE_VIEWS.indexOf(b.view));
    out.push({ sheet, declared, members, pieces });
  }
  return out.sort((a, b) => (b.sheet.id ?? 0) - (a.sheet.id ?? 0));
}

/**
 * ОТСЕК ОДНОГО ЧЛЕНА ЛЕНТЫ. Раскрытая колода — это ЛИСТ ПЛЮС ЕГО КУСКИ, которые живут по разные
 * стороны `CropDeck`: куски рисуются РЯДОМ с ней, обычными ячейками, поэтому коробки, охватывающей
 * обе половины, у самой колоды нет и быть не может. Её даёт отсек, и тонируется ровно тот, что
 * держит раскрытую группу (`bgSecondary` — DESIGN.md, panel: «a fill, not a container»).
 *
 * ⚠ ОТСЕК У КАЖДОГО ЧЛЕНА, А НЕ ТОЛЬКО У ГРУППЫ, И ЭТО НЕ СИММЕТРИЯ РАДИ СИММЕТРИИ: отбивка
 * `py-1` сдвигает содержимое отсека относительно соседей, и группа перестала бы стоять с ними на
 * одной линии. Одинаковый отсек снимает сдвиг по построению — включая ЛЕВУЮ половину ленты, у
 * которой своя метрика была бы видна прямо через разделитель.
 *
 * ⚠ ЭТО ВТОРОЕ НАПИСАНИЕ `Bay` ИЗ `render/outputs.tsx`, И ЭТО СКАЗАНО ВСЛУХ. Там он локальный и
 * не экспортируется; тонированный грунт под раскрытой группой — общий приём двух полос, и его
 * место в `strip-cell.tsx`, рядом со `Strip` и `StripDivider`. Правка чужого файла в этой волне
 * запрещена, поэтому перенос назван в отчёте, а не сделан молча.
 */
function Bay({ groupOf, children }: { groupOf?: number; children: React.ReactNode }): JSX.Element {
  return (
    <div
      data-deck-group={groupOf || undefined}
      className={cn('flex shrink-0 items-stretch gap-2 py-1', groupOf ? 'bg-bgSecondary' : '')}
    >
      {children}
    </div>
  );
}

/**
 * ═══ CLOTH УШЁЛ С ЭТОГО ЭКРАНА ЦЕЛИКОМ — E-7 ═════════════════════════════════════════════════
 *
 * Владелец, дословно: «в фабрик рендере в INPUT — FLATS OF THIS CARD убери CLOTH плейсхолдер
 * давай эту все настройку сделаем в GENERATION — FABRIC RENDER».
 *
 * ЗДЕСЬ СТОЯЛИ 350 СТРОК: хук `useClothRun` (плитки тканей второй пробежкой той же ленты, дверь
 * `+ cloth`, потолок активов с причиной словами, вопрос удаления, вторая дверь «make a pattern»)
 * и чеканка имени `cloth N`. ВСЁ ЭТО ПЕРЕЕХАЛО, А НЕ УДАЛЕНО, — в `./palette.tsx`, под заголовок
 * TEXTURE & COLOUR (E-8), вместе со своими доводами поимённо. Ни одного писателя полоса не
 * потеряла: ткань по-прежнему заводится и убирается ровно одной дверью на всю админку, просто
 * стоит она теперь там, где ткань ВЫБИРАЮТ.
 *
 * ЧТО ЭТИМ ВЫИГРАНО — НЕ МЕСТО, А ЗАГОЛОВОК. Секция называется «input — flats of this card», и
 * до этой правки в ней среди чертежей стояли лоскуты: род ячейки приходилось выводить по
 * подписи под кадром. Теперь заголовок описывает содержимое целиком, и линия посреди ленты
 * снова делит ровно два вопроса — «какой чертёж в какой стороне» и «какие ещё чертежи есть».
 *
 * ⚠ ДОВОД K-9 («CLOTH должен быть дальше в линии с фронт бэк сайд л р») ЭТИМ ОТМЕНЁН ВЛАДЕЛЬЦЕМ,
 * а не забыт. Он был верен, пока ткань выбирали ДВУМЯ экранами ниже: тогда ряд, разорванный
 * надвое, заставлял читать один ответ в два приёма. Теперь ткань и выбирают, и заводят в одном
 * месте, и ходить между двумя блоками больше незачем.
 */

export function RenderInputStrip({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const writes = useDesignWrites(techCardId);
  const split = useSplitToInput({ techCardId, band });

  const sides = useMemo(() => benchSides(band), [band]);
  const marked = sides.filter((side) => !!side.picture);

  /**
   * ═══ ПРАВАЯ ПОЛОВИНА ЧИТАЕТ СКЛЕЕННУЮ ПОЛОСУ — ВСЮ КАРТОЧКУ, А НЕ СТРАНИЦУ (D-5) ═════════════
   *
   * Читатели ниже (`unmarkedFlats`, `pictureRepresentation`, `stripProvenance`) — те же, что и
   * были, и получают ТУ ЖЕ форму: полосу. Только у этой полосы лента дочитана. Дедуп по id —
   * потому что полоса перечитывается на каждую запись, и её первая страница может сдвинуться под
   * уже прочитанным продолжением (тот же довод, что у `useMoreHistory`).
   */
  const more = useWholeCardFeed(techCardId, band);
  const whole = useMemo<GetDesignBandResponse>(() => {
    if (!more.runs.length && !more.batches.length) return band;
    const runIds = new Set((band.runs ?? []).map((run) => run.id ?? 0));
    const batchIds = new Set((band.batches ?? []).map((batch) => batch.id ?? 0));
    return {
      ...band,
      runs: [...(band.runs ?? []), ...more.runs.filter((run) => !runIds.has(run.id ?? 0))],
      batches: [
        ...(band.batches ?? []),
        ...more.batches.filter((batch) => !batchIds.has(batch.id ?? 0)),
      ],
    };
  }, [band, more.runs, more.batches]);

  const others = useMemo(() => unmarkedFlats(whole), [whole]);

  /**
   * ═══ РОДСТВО — ОДИН ЧИТАТЕЛЬ И ОДИН ПУЛ (F-4, D-5) ═══════════════════════════════════════════
   *
   * Пул — ВСЕ чертежи карточки (склеенной полосы), включая те, что стоят в слоте, и включая
   * листы: `cropFamilies` лезет к КОРНЮ родословной ЧЕРЕЗ промежуточные звенья, и кусок,
   * вырезанный из ОТРЕДАКТИРОВАННОГО листа, доберётся до листа только если правка тоже в пуле.
   * Пул поуже — и внук остался бы одиночным чертежом рядом со своим листом, то есть ровно тем
   * дефектом, который эта полоса закрывает.
   *
   * Скрытые — вон: `hidden_at` — единственный глагол невидимости, и корень, которого владелец
   * не видит, не может держать колоду.
   */
  const flatPool = useMemo(() => {
    const pool: common_DesignPicture[] = [];
    const push = (pictures?: common_DesignPicture[] | null) => {
      for (const picture of pictures ?? []) {
        if ((picture.id ?? 0) <= 0 || isPictureHidden(picture)) continue;
        if (pictureRepresentation(whole, picture) !== 'flat') continue;
        pool.push(picture);
      }
    };
    for (const run of whole.runs ?? []) push(run.pictures);
    for (const batch of whole.batches ?? []) push(batch.pictures);
    return pool;
  }, [whole]);
  const families = useMemo(() => cropFamilies(flatPool), [flatPool]);

  /**
   * ЛИСТ И ЕГО КУСКИ, НОВЕЙШИЙ ЛИСТ ПЕРВЫМ.
   *
   * ⚠ ЧЛЕНОМ КОЛОДЫ СЧИТАЕТСЯ ТОЛЬКО ТО, ЧТО ЭТА ПОЛОСА ВПРАВЕ ПРЕДЛОЖИТЬ (`others`). Кусок,
   * УЖЕ СТОЯЩИЙ В СЛОТЕ, живёт слева от линии, и нарисовать его ещё раз внутри колоды значило бы
   * показать одну картинку в обеих половинах — тот самый дубль, ради снятия которого колода здесь
   * и появилась. Счёт кусков на двери поэтому тоже считает предлагаемые, а не все.
   */
  const offered = useMemo(() => new Set(others.map((picture) => picture.id ?? 0)), [others]);
  const sheets = useMemo(
    () => sheetsOf(flatPool, families, offered),
    [flatPool, families, offered],
  );

  /** Одиночные чертежи: то, что не ушло за свой лист и само не стало листом. Новейшее первым. */
  const loose = useMemo(() => {
    const folded = new Set<number>();
    for (const { sheet, members } of sheets) {
      folded.add(sheet.id ?? 0);
      for (const member of members) folded.add(member.id ?? 0);
    }
    return others
      .filter((picture) => !folded.has(picture.id ?? 0))
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }, [others, sheets]);

  /**
   * ═══ ФИЛЬТР ПО ПРОИСХОЖДЕНИЮ — СОСТОЯНИЕ ЭКРАНА, НЕ ЗАПИСЬ (D-5) ═══════════════════════════
   *
   * Считается по ТОМУ, ЧТО СТОИТ СПРАВА ОТ ЛИНИИ: одиночные чертежи и листы (лист — одной
   * единицей, по своему происхождению; куски идут за листом). Семейство без единого кадра чипа
   * не получает, а сам ряд рисуется только когда есть из чего выбирать: два семейства и больше,
   * либо уже поставленный фильтр, который надо чем-то снять.
   */
  const [origin, setOrigin] = useState<OriginFilter>('all');
  const originCounts = useMemo(() => {
    const counts: Record<Origin, number> = { generated: 0, uploaded: 0, drawn: 0 };
    let all = 0;
    const tally = (picture: common_DesignPicture) => {
      all += 1;
      const kind = originOf(picture);
      if (kind) counts[kind] += 1;
    };
    loose.forEach(tally);
    sheets.forEach(({ sheet }) => tally(sheet));
    return { all, ...counts };
  }, [loose, sheets]);
  const originFamilies = ORIGINS.filter((o) => originCounts[o.value] > 0);
  const filterShown = originFamilies.length > 1 || origin !== 'all';
  const admits = (picture: common_DesignPicture) => origin === 'all' || originOf(picture) === origin;
  const shownLoose = useMemo(() => loose.filter(admits), [loose, origin]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownSheets = useMemo(() => sheets.filter(({ sheet }) => admits(sheet)), [sheets, origin]); // eslint-disable-line react-hooks/exhaustive-deps
  const hiddenByFilter = loose.length + sheets.length - shownLoose.length - shownSheets.length;

  /** Какие стороны заняты — это и есть «что вытеснит пометка», сказанное списком (F-5). */
  const occupied = useMemo(
    () => new Set(sides.filter((side) => side.picture).map((side) => side.view)),
    [sides],
  );

  /** Which cell a write is in flight for — a shared `isPending` would say «saving» on all of them. */
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * ОДНА ОТКРЫТАЯ КОЛОДА НА ПОЛОСУ, тем же законом, что в ленте и в выходах: «нажимаешь на другой
   * мультивью старый колапсится обратно». Состояние из одного значения делает второе открытое
   * невыразимым.
   */
  const [openDeck, setOpenDeck] = useState<number | null>(null);
  /** КАКУЮ ИМЕННО КАРТИНКУ ПРАВИМ. Не булево: ячеек много, модалка одна. Ноль — закрыто. */
  const [editingId, setEditingId] = useState(0);

  /**
   * ЗУМ ЧУЖОЙ КАРТОЧКИ СКЛАДЫВАЕТ ОТКРЫТУЮ КОЛОДУ (E-4) — тот же закон и те же три строки, что в
   * ленте и в выходах. Граница по КОЛОДЕ, а не по карточке: зум по самому листу и по любому его
   * куску — работа ВНУТРИ раскрытой группы, и складывать её там значило бы унести куски из
   * документа под уже открытым окном.
   */
  const foldOnForeignZoom = (pictureId: number) =>
    setOpenDeck((current) => {
      if (current === null || !pictureId) return current;
      if (pictureId === current) return current;
      return families.rootOf.get(pictureId) === current ? current : null;
    });

  /** Кадр одной картинки для общего ряда студии, или ничего — у безадресной плиты зума нет. */
  const frameOf = (picture: common_DesignPicture) =>
    picture.media ? mediaFullToViewerItem(picture.media) : undefined;

  const mark = (picture: common_DesignPicture, view: string) => {
    const side = sides.find((s) => s.view === view);
    const pictureId = picture.id ?? 0;
    if (!side || pictureId <= 0) return;
    setBusy(`p${pictureId}`);
    writes.setBenchSlot.mutate(
      // `kind: 'flat'` — WHICH BENCH, not which slot. The bench grew a second axis (view × kind),
      // and a render front and a flat front are now two different slots BOTH addressed by
      // `view_key: 'front'`. This strip marks DRAWINGS into the flat bench; leaving the field empty
      // would still mean flat today, and would silently mean whatever the default becomes later.
      // КОЛОРВЕЯ У ЭТОЙ ПОЛОСЫ НЕТ И НЕ БУДЕТ (L-4). Она размечает ЧЕРТЕЖИ, а чертёж один на
      // карточку: пикер колорвея стоит НИЖЕ неё, в секции генерации, и его власть кончается там.
      { slot: { viewKey: side.view, kind: 'flat', colorwayId: 0 }, pictureId, expectedSlotRev: side.slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  /**
   * ═══ J-17 — ФАЙЛ ИЗ МЕДИАТЕКИ ПРЯМО В ПУСТОЙ СЛОТ, ОДНОЙ ТРАНЗАКЦИЕЙ ═════════════════════════
   *
   * Владелец: «во вкладке FABRIC RENDER если у нас эмпти слот его от сюда же можно добавить из
   * медиа селектора».
   *
   * ОДНА РУЧКА ДЕЛАЕТ ОБЕ ПОЛОВИНЫ: `RegisterDesignUpload` заводит медиа в полосу карточки И
   * кладёт картинку в слот, названный в `target`, в одной транзакции. Значит карточка не может
   * оказаться с плитой в слоте, под которой нет строки, — и наоборот, с загруженным файлом,
   * который никуда не встал.
   *
   * ⚠ ЭТО ТОТ ЖЕ ВЫЗОВ, ЧТО У ВЕРСТАКА (`bench.tsx:placeMedia`), И ПОЛЯ НАЗВАНЫ ТЕ ЖЕ, ПОИМЁННО:
   *   · `kind: 'flat'` — УТВЕРЖДЕНИЕ этой полосы, а не догадка: под подписью «input — flats of
   *     this card» приходит чертёж. Пустое поле значило бы «flat» и сегодня, и «что бы ни стало
   *     умолчанием» завтра;
   *   · `colorwayId: 0` — у чертежа цвета не бывает по существу (L-4): `colorway_forbidden` на
   *     флэте это ОТКАЗ, а не обнуление;
   *   · `ghostView` — сторона, которую человек ТОЛЬКО ЧТО НАЗВАЛ, положив файл в этот слот; ровно
   *     для подтверждаемой человеком догадки поле и заведено;
   *   · `expectedSlotRev` — ревизия строки, прочитанная ЭТИМ рендером: чужая правка того же слота
   *     обязана отказать, а не молча вытеснить плиту;
   *   · `clientRequestId` минтится ОДИН РАЗ на намерение человека и НЕ внутри мутации — повтор со
   *     свежим ключом сервер честно завёл бы второй партией.
   */
  const placeMedia = (media: common_MediaFull, view: string, expectedSlotRev: number) => {
    const mediaId = media.id ?? 0;
    if (!mediaId) return;
    setBusy(`v${view}`);
    writes.registerUpload.mutate(
      {
        clientRequestId: newClientRequestId(),
        items: [uploadItem({ mediaId, ghostView: view, kind: 'flat', colorwayId: 0 })],
        target: { viewKey: view, kind: 'flat', colorwayId: 0 },
        expectedSlotRev,
      },
      { onSettled: () => setBusy(null) },
    );
  };

  const unmark = (view: string, slotRev: number) => {
    setBusy(`v${view}`);
    writes.setBenchSlot.mutate(
      // `picture_id = 0` is UNMARK — empty the slot without deleting it. A different act from
      // deleting a slot, and it has to stay different.
      { slot: { viewKey: view, kind: 'flat', colorwayId: 0 }, pictureId: 0, expectedSlotRev: slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  /**
   * ═══ УГОЛ `edit` НА КАЖДОМ РАСТРЕ, УГОЛ `split` — ТОЛЬКО ТАМ, ГДЕ РЕЖУТ (F-4) ════════════════
   *
   * Владелец: «на ховер мы должны мочь сплитнуть и заэдитить а не только призумить».
   *
   * ПРАВИЛО ВЗЯТО У СОСЕДНЕГО ЭКРАНА ЦЕЛИКОМ, А НЕ НАПИСАНО ЗАНОВО (`render/outputs.tsx`):
   * правка — у ЛЮБОГО кадра (`onEdit` там не сужен ничем, кроме `.glb`, которого в этой полосе не
   * бывает), а разрез — только у СКЛЕЕННОГО и ЕЩЁ НЕ РАЗРЕЗАННОГО листа (`composite && !deck`).
   * Обратное — угол `split ▸` на обычном чертеже — было бы вторым правилом на один орган, ровно
   * тем «везде по разному», на которое владелец жаловался дважды.
   */
  const editCorner = (picture: common_DesignPicture) => {
    const id = picture.id ?? 0;
    if (disabled || id <= 0) return undefined;
    return {
      onClick: () => setEditingId(id),
      ariaLabel: `edit drawing ${id} — draw over this picture`,
      title:
        'draw over this drawing — saving makes a NEW picture; the original is never overwritten',
    };
  };

  /**
   * ═══ УГОЛ `split` У ОДИНОЧКИ, ПРИНЕСЁННОЙ РУКАМИ (круг 19, остаток F-4) ══════════════════════
   *
   * Владелец: «на ховер мы должны мочь сплитнуть и заэдитить а не только призумить». Дыра, которую
   * это закрывает, ЗАМЕРЕНА, а не предположена: мультивью, загруженный через `+ flat`, приходит с
   * ПУСТЫМ `composite_views` (файл ничего о себе не объявляет, и догадка по пикселям — не
   * объявление), поэтому `sheetsOf` его листом не признаёт (`!composite && !members.length` —
   * выход), поэтому он рисуется обычной одиночкой, и разрезать его В ЭТОЙ ПОЛОСЕ было НЕЧЕМ ВООБЩЕ.
   * Человек, принёсший лист с четырьмя видами, упирался в тупик: пометить его можно только В ОДИН
   * слот, а слот держит один вид.
   *
   * ⚠ ПРЕДИКАТ УЖЕ, ЧЕМ «ПОКАЗАТЬ ВЕЗДЕ», И КАЖДОЕ УСЛОВИЕ ЗАКРЫВАЕТ НАЗВАННЫЙ ДЕФЕКТ (пункты 8
   * и 18 круга 19 — «уже сплитнутому не показываем SPLIT ▸» и «не кандидату — тоже»):
   *   · `originOf(picture) === 'uploaded'` — режут ТО, ЧТО ПРИНЕСЛИ РУКАМИ. Машинный чертёж
   *     одного вида угла не получает: `FLAT` рисует по одному виду на картинку, и `split ▸` на
   *     нём предлагал бы разрезать то, что и так неделимо;
   *   · `!families.rootOf.has(id)` — кадр сам не кусок чужого разреза. Эта же ячейка рисуется
   *     ВНУТРИ раскрытой колоды (`looseCell(member)` ниже), и без этого условия угол вставал бы
   *     на кусках, только что вырезанных из листа над ними;
   *   · `!alreadyCut` — из кадра ещё ничего не вырезано. Резать второй раз законно, но глагол уже
   *     другой, и два глагола на одном кадре читаются как один сломанный — то же правило, что у
   *     листа двадцатью строками ниже.
   *     ⚠ СЧЁТ КУСКОВ БЕРЁТСЯ НЕСУЖЕННЫЙ, а не `sheetsOf`-овский: там члены отфильтрованы по
   *     `offered`, и лист, ВСЕ куски которого уже стоят в слотах, снова выпал бы в одиночки —
   *     то есть угол вернулся бы ровно на разрезанное.
   *
   * ⚠ ВТОРОЙ ДВЕРИ РАЗРЕЗА НЕ ЗАВЕДЕНО: это тот же `split.openForPicture`, что у листа. Копия
   * механизма разошлась бы с оригиналом в первый же круг.
   *
   * ═══ ПОЧЕМУ ЭТО НЕ СХЛОПНУЛОСЬ В `pictureOffersSplit` ЦЕЛИКОМ ═══════════════════════════════
   *
   * Общий предикат (`render/model.ts`) отвечает на вопрос «система ЗНАЕТ, что видов несколько?» —
   * то есть читает `composite_views`. У листа, принесённого руками, это поле ПУСТО ПО ОПРЕДЕЛЕНИЮ
   * (разбор выше), поэтому `pictureOffersSplit` вернул бы на нём `false` — и закрыл бы ровно ту
   * единственную дверь, где человек ОБЪЯВЛЯЕТ такой лист многовидовым. Свести два правила в одно
   * значило бы вернуть тупик, который эта ячейка и открывала.
   *
   * ПОЭТОМУ ЗДЕСЬ СОЮЗ, А НЕ КОПИЯ: `pictureOffersSplit(picture, alreadyCut) || broughtByHandAndUncut`.
   * Второй член — НЕ второе определение первого, а ИМЕНОВАННОЕ ИСКЛЮЧЕНИЕ из него, и стоит оно
   * рядом со своим правилом, а не вместо него: следующий автор видит обе половины сразу и не
   * перепишет общую заново. Дом исключения — этот файл, а не `render/model.ts`: его ключевой член
   * (`originOf`) читает `readProvenance` и живёт здесь, а экспорт, берущий готовый булев флаг,
   * не нёс бы никакого правила вовсе — только имя.
   *
   * ⚠ ПРАВИЛО ВЛАДЕЛЬЦА ДЕРЖИТСЯ ОБОИМИ ЧЛЕНАМИ, А НЕ ОДНИМ (пункты 8 и 18):
   *   · «уже сплитнутому SPLIT ▸ не показываем» — `!alreadyCut` входит В КАЖДЫЙ из двух членов
   *     (в общий он зашит вторым аргументом), поэтому разрезанный кадр угла не получает ни по
   *     одной ветке;
   *   · «не мультивью — тоже не показываем» — общая ветка требует ОБЪЯВЛЕННЫХ видов, ручная
   *     требует `uploaded`; машинный чертёж одного вида не проходит ни туда, ни сюда.
   *
   * ⚠ ОБЩАЯ ВЕТКА ЗДЕСЬ НИЧЕГО НЕ РАСШИРЯЕТ, И ЭТО ПРОВЕРЕНО ПО КОДУ, А НЕ НА ГЛАЗ: кадр с
   * объявленными видами `sheetsOf` ВСЕГДА забирает в колоду (`!composite && …` — оба его выхода
   * стоят под `!composite`), а `loose` считается вычитанием колод, поэтому до `looseCell` такой
   * кадр не доходит. Ветка стоит СТРАХОВКОЙ на день, когда `sheetsOf` перестанет так делать:
   * тогда правило уже будет спрошено у общего носителя, а не забыто здесь.
   */
  const splitCorner = (picture: common_DesignPicture) => {
    const id = picture.id ?? 0;
    /* ⚠ СЧЁТ КУСКОВ — ПО НЕСУЖЕННОЙ КАРТЕ СЕМЕЙ, а не по `sheetsOf`-овским `members`: там они
       отфильтрованы по `offered`, и лист, ВСЕ куски которого уже стоят в слотах, снова выпал бы
       в одиночки — то есть угол вернулся бы ровно на разрезанное. */
    const alreadyCut = (families.membersOf.get(id) ?? []).length > 0;
    /** Лист, ПРИНЕСЁННЫЙ РУКАМИ и ещё не резанный, — именованное исключение из общего правила. */
    const broughtByHandAndUncut = originOf(picture) === 'uploaded' && !alreadyCut;
    if (
      disabled ||
      id <= 0 ||
      families.rootOf.has(id) ||
      !(pictureOffersSplit(picture, alreadyCut) || broughtByHandAndUncut)
    )
      return undefined;
    return {
      onClick: () => split.openForPicture(picture, `drawing ${id}`),
      ariaLabel: `split the uploaded drawing ${id} into views`,
      title:
        'this file holds several views in one picture and cannot stand in a single slot — cut it ' +
        'into views first, then apply the whole split to the input at once',
    };
  };

  /** ОДНА ЯЧЕЙКА ОДИНОЧНОГО ЧЕРТЕЖА, И ОНА РИСУЕТСЯ ИЗ ДВУХ МЕСТ — рядом и внутри раскрытой
   *  колоды. Второе написание разошлось бы с первым словом или пикселем: это ровно тот дефект,
   *  ради которого `StripCell` и заведён. */
  const looseCell = (picture: common_DesignPicture): JSX.Element => {
    const id = picture.id ?? 0;
    const provenance = stripProvenance(whole, picture);
    /**
     * ═══ УГАДАННАЯ СТОРОНА СТОИТ ПЕРВОЙ В СПИСКЕ, И ЭТО ВСЁ, ЧТО ОНА ДЕЛАЕТ (D-6) ════════════
     *
     * Владелец: «после сплита мы же знаем что это за деталь почему бы ее не показывать первой в
     * разделе марк». У куска разреза `ghost_view` — сторона рамки, которую человек сам назвал в
     * окне разреза; у машинного чертежа — догадка машины, часто неверная на перед/спинка. И то и
     * другое выражается ПОРЯДКОМ: догадка сокращает путь и ничего не утверждает. Слова
     * «probably» здесь нет и не будет (F-17) — подпись утверждала бы, и притом хеджем.
     * Тот же закон, что у `SlotPicker` в ленте генераций.
     */
    const ghost = normaliseViewKey(picture.ghostView);
    const views = [...SILHOUETTE_VIEWS].sort((a, b) =>
      a === ghost ? -1 : b === ghost ? 1 : 0,
    );
    return (
      <StripCell
        key={`pic-${id}`}
        offeredPictureId={id}
        src={pictureThumb(picture)}
        alt={provenance}
        gallery={frameOf(picture)}
        onZoom={() => foldOnForeignZoom(id)}
        onEdit={editCorner(picture)}
        onSplit={splitCorner(picture)}
        lines={['not marked', provenance]}
        action={
          disabled ? undefined : (
            /* ⚠ ПОДСКАЗКА ВИСИТ НА ОБЁРТКЕ, А НЕ НА `SelectComponent`: корень Radix разбирает
               ЗАКРЫТЫЙ список пропов, и `title`/`data-*` до DOM бы не доехали — утверждение по
               ним было бы зелёным над отсутствующим узлом. Тот же приём, что у соседних полос. */
            <span className='block' data-mark-door={id || undefined} title={MARK_TITLE}>
              <SelectComponent
                name={`mark-${id}`}
                value={MARK_PROMPT}
                placeholder='mark ▸'
                disabled={busy === `p${id}`}
                /* ⚠ СЕЛЕКТОР ПРИВОДИТСЯ К МЕТРИКЕ КНОПКИ (F-9/F-14): `h-5 min-h-0`, иначе
                   `min-h-[22px]` примитива побеждает у twMerge и дверь стоит на 6px выше
                   соседних. Тот же приём, что у `mark ▸` в `render/outputs.tsx` и во входе 3D. */
                className='h-5 min-h-0 py-0 text-micro uppercase tracking-label'
                items={[
                  { value: MARK_PROMPT, label: 'mark ▸' },
                  ...views.map((view) => ({
                    value: view,
                    /* «занята» — это СОСТОЯНИЕ СТОРОНЫ, прочитанное у верстака, и стоит оно у
                       того пункта, о котором спрашивают. Пункт при этом ЖИВОЙ: вытеснить —
                       законный и частый жест, а не отказ. */
                    label: occupied.has(view) ? `${viewLabel(view)} · in use` : viewLabel(view),
                  })),
                ]}
                onValueChange={(value: string) => {
                  if (!value || value === MARK_PROMPT) return;
                  mark(picture, value);
                }}
                fullWidth
              />
            </span>
          )
        }
      />
    );
  };

  /**
   * РЯД ДВЕРЕЙ СКЛЕЕННОГО ЛИСТА — ТРИ СОСТОЯНИЯ, И КАЖДОЕ ОТВЕЧАЕТ НА СВОЙ ВОПРОС ЧЕЛОВЕКА:
   *   · «этот лист ещё не разрезан» — живой `split ▸`. Здесь стояло СЛОВО («cut it first —
   *     split ▸ on the frame»), отправлявшее к угловой кнопке; угол — ТИХИЙ орган, он появляется
   *     по наведению, то есть отказ называл орган, которого на экране не видно. Тот же разбор и
   *     та же починка, что у `split first ▸` в `render/outputs.tsx`;
   *   · «этот лист уже разрезан — где куски» — `expand ▸`;
   *   · «положить разрез во вход» — `apply splitted`, и только у РАСКРЫТОЙ колоды: заменять весь
   *     вход, не посмотрев на куски, человек не должен (то же решение, что у двери `set`).
   *
   * ⚠ `expand ▸` И `▾` ЖИВЫ И НА КАРТОЧКЕ ТОЛЬКО ДЛЯ ЧТЕНИЯ. Раскрыть колоду — это ЧИТАТЬ, а не
   * писать; гасить читателя вместе с писателями значит прятать материал от того, кому его как раз
   * и показывают. Гаснут ровно писатели: `split ▸`, `apply splitted`, `mark ▸`, правка.
   */
  const sheetDoors = (deck: FlatSheet, members: common_DesignPicture[], open: boolean) => {
    const id = deck.sheet.id ?? 0;

    if (!members.length) {
      if (disabled) return undefined;
      return (
        <span data-split-sheet={id || undefined} className='flex w-full'>
          <Button
            variant='secondary'
            size='xs'
            className='w-full'
            onClick={() => split.openForPicture(deck.sheet, `sheet ${id}`)}
            title={
              'a sheet holds several views in one file and cannot stand in a single slot — cut it ' +
              'into views first, then apply the whole split to the input at once'
            }
          >
            split ▸
          </Button>
        </span>
      );
    }

    if (!open) {
      return (
        <Button
          variant='secondary'
          size='xs'
          className='w-full'
          aria-expanded={false}
          data-deck-expand={id || undefined}
          onClick={() => setOpenDeck(id)}
          title={`${cutPiecesWord(members.length)} — open them as cards in this row`}
        >
          expand ▸
        </Button>
      );
    }

    /* ⚠ СКЛАДЫВАЮЩАЯ ДВЕРЬ ОБЯЗАТЕЛЬНА, И ЭТО НЕ УКРАШЕНИЕ. `CropDeck` объявленно нем при
       `hostDoor` (веер `aria-hidden`, поверхность листа тоже), поэтому без неё раскрытую колоду
       нечем было бы закрыть ни с клавиатуры, ни читалкой — только раскрыв ЧУЖУЮ. */
    const apply =
      !disabled && deck.pieces.length > 0 ? (
        <ApplySplitDoor
          techCardId={techCardId}
          sides={sides}
          pieces={deck.pieces}
          benchKind='flat'
          /* ⚠ ЧЕРТЁЖ ЦВЕТА НЕ ИМЕЕТ ПО СУЩЕСТВУ (L-4): `colorway_forbidden` на флэте — ОТКАЗ,
             а не обнуление. Ноль здесь читается «у чертежа цвета не бывает», и это то же
             число, которым эта полоса пишет каждый свой слот. */
          colorwayId={0}
          noun='drawing'
        />
      ) : null;

    /**
     * ═══ ДВЕ ДВЕРИ СТОЛБИКОМ, А НЕ В ОДНУ СТРОКУ, И ЭТО ЗАМЕР (F-14) ═══════════════════════
     *
     * Первая редакция ставила их рядом: `apply splitted` на `flex-1` и `▾` в 24px. ЗАМЕРЕНО
     * (`tmp/dsgprobe/f34-width.mjs`): кнопке нужен 121.5px без переноса, а в общей строке ей
     * доставалось 104 — она переносилась на вторую строку, вырастала с 26px до 36 и вставала
     * НА 10 ПИКСЕЛЕЙ ВЫШЕ соседних дверей. Это ровно «всё перекосоёбано» из F-14, и `apply-split`
     * уже платил за него однажды: стрелку с подписи там сняли по тому же замеру.
     *
     * ⚠ СКЛАДЫВАЮЩАЯ ДВЕРЬ — НИЖНЯЯ, И ЭТО НЕ ВКУС. `mt-auto` прижимает ряд дверей к низу
     * ячейки, а лента растягивает ячейки по самой высокой, поэтому НИЖНЯЯ дверь колоды стоит
     * ровно на той же линии, что `mark ▸` у всех соседей. Нижняя — та же дверь, что стояла тут
     * закрытой (`expand ▸`): переключатель НЕ ПЕРЕЕЗЖАЕТ между двумя состояниями, а новый
     * глагол появляется НАД ним. Орган, меняющий место от состояния, приходится искать заново.
     */
    return (
      <div className='flex flex-col gap-1'>
        {apply}
        <Button
          variant='secondary'
          size='xs'
          className='w-full'
          aria-expanded
          data-deck-fold={id || undefined}
          aria-label={`fold the pieces of sheet ${id} back behind it`}
          title='fold these pieces back behind the sheet'
          onClick={() => setOpenDeck(null)}
        >
          fold ▾
        </Button>
      </div>
    );
  };

  const sheetCell = (
    deck: FlatSheet,
    members: common_DesignPicture[],
    open: boolean,
  ): JSX.Element => {
    const id = deck.sheet.id ?? 0;
    const provenance = stripProvenance(whole, deck.sheet);
    const cut = members.length > 0;
    const composite = deck.declared.length > 0;
    return (
      <StripCell
        key={`deck-${id}`}
        cellPictureId={id}
        src={pictureThumb(deck.sheet)}
        alt={
          composite
            ? `multi-view sheet · ${deck.declared.map(viewLabel).join(', ')}`
            : `sheet cut by hand · ${cutPiecesWord(members.length)}`
        }
        /* Ручной лист видов не объявлял — ярлык «multi-view» был бы утверждением, которого файл
           не делал. Что он лист, говорит разрез: слово о кусках стоит строкой под кадром. */
        badge={composite ? 'multi-view' : 'sheet'}
        gallery={frameOf(deck.sheet)}
        /* СВЁРНУТОЙ КОЛОДЕ ПОВЕРХНОСТЬ ЛИСТА РАСКРЫВАЕТ ЕЁ, А НЕ ЗУМИТ (J-2). Зум при этом не
           теряется — он остаётся угловой кнопкой примитива. Раскрытой поверхность снова зумит, а
           складывает колоду объявленная дверь ряда. */
        onOpen={cut && !open ? () => setOpenDeck(id) : undefined}
        onZoom={() => foldOnForeignZoom(id)}
        onEdit={editCorner(deck.sheet)}
        /* ⚠ УГЛА `split` У РАЗРЕЗАННОГО ЛИСТА НЕТ, И ЭТО ПРАВИЛО СОСЕДНЕГО ЭКРАНА, А НЕ МОЁ:
           «уже сплитнутому не показываем SPLIT ▸». Резать второй раз законно, но глагол этой
           ячейки уже другой — `expand ▸`, — и два глагола на одном кадре читаются как один
           сломанный.

           ⚠ ОБА ЧЛЕНА СПРАШИВАЮТСЯ У `pictureOffersSplit` (`render/model.ts`) — одного предиката на
           все четыре экрана, — И ЭТО НЕ ПЕРЕИМЕНОВАНИЕ. Здесь стояло `disabled || cut || !composite`:
           по составу это ровно то же правило, но написанное ЛИТЕРАЛОМ, а правило-литерал теряет член
           молча на первом же переписывании (так плитка референса предъявляла угол по `!readOnly && url`,
           не сверяясь ни с одним из двух). Близнец этой ячейки на входе 3D уже зовёт общий предикат
           (`render/threed-input-strip.tsx`), и два написания одного вопроса на двух полосах — это
           та самая щель, ради которой предикат и вынесли.

           `composite` рядом ОСТАЁТСЯ: он тут ещё и ПОДПИСЫВАЕТ ячейку («multi-view» против «sheet») и
           выбирает строку под кадром, а это другой вопрос, чем «предлагать ли рез». */
        onSplit={
          !disabled && pictureOffersSplit(deck.sheet, cut)
            ? {
                onClick: () => split.openForPicture(deck.sheet, `sheet ${id}`),
                ariaLabel: `split the multi-view sheet ${id} into views`,
              }
            : undefined
        }
        lines={[
          composite
            ? `${deck.declared.length} views · ${deck.declared.map(viewLabel).join(', ')}`
            : cutPiecesWord(members.length),
          provenance,
        ]}
        action={sheetDoors(deck, members, open)}
      />
    );
  };

  /**
   * ОГОВОРКА ОХВАТА — ПО СОСТОЯНИЮ ДОЧИТЫВАНИЯ, А НЕ ПО ОДНОМУ ФЛАГУ ЛЕНТЫ (D-5). Усечённая
   * лента больше не значит «справа только страница»: она дочитывается. Оговорка стоит ровно в
   * двух случаях, когда справа НЕ вся карточка, — пока чтение идёт и если оно отказало, — и у
   * каждого своё слово, потому что следующий жест человека разный: подождать или перечитать.
   */
  const truncated = feedIsTruncated(band);
  const coverage =
    !truncated || more.state === 'whole'
      ? null
      : more.state === 'reading'
        ? { note: 'reading older pages…', title: READING_TITLE }
        : { note: 'newest page only', title: PAGE_TITLE };

  return (
    <Section
      /* ОБЪЯВЛЕННЫЙ ЯКОРЬ КОРОБКИ. Утверждение E-7 — это утверждение ОТСУТСТВИЯ («в этой секции
         нет ни одной плитки ткани»), а такое утверждение стоит ровно столько, сколько стоит
         объявленная коробка, по которой его можно проверить. Класс для этого не годится: он
         переживает правку смысла и оставляет пробу зелёной над сломанным экраном. */
      id='design-render-input'
      title='input — flats of this card'
      question='— the drawings the render is made from, one per side'
      action={
        <Text
          size='micro'
          variant='label'
          component='span'
          className='uppercase'
          data-input-count=''
          data-input-coverage={coverage ? more.state : 'whole'}
          /* Оговорка охвата несёт предложение целиком — F-5, разбор у `PAGE_TITLE`. */
          title={coverage?.title}
        >
          {/* Одной строкой, а не двумя: JSX схлопывает перенос в ПРОБЕЛ, и «0 sheet s» вылезло бы
              ровно из аккуратного форматирования. */}
          {marked.length} marked · {others.length} not marked
          {sheets.length > 0 ? ` · ${sheets.length} sheet${sheets.length === 1 ? '' : 's'}` : ''}
          {coverage ? ` · ${coverage.note}` : ''}
        </Text>
      }
    >
      {/* ═══ ОДНА ЛЕНТА, ДВА ВОПРОСА ═══════════════════════════════════════════════════════════
          Порядок ленты: четыре слота → ЛИНИЯ → дверь руками → одиночные чертежи (новейшее
          первым) → склеенные листы (новейший первым, куски за своим листом).

          ДВУХ `GroupLabel` НАД ЛЕНТОЙ НЕТ. Они появились, когда рядов было два, и каждый
          подписывал свой; над ОДНОЙ лентой «flats» подписывал бы и ткани тоже, то есть врал бы.
          Кто есть кто, лента говорит сама: у вида — ярлык вида на кадре и толстая рамка слота, у
          листа — ярлык `multi-view` и число видов строкой под кадром. Числа стоят в `action`
          секции, одной строкой, где их и читают вместе. */}
      <Strip>
        {/* ═══ ЧЕТЫРЕ СЛОТА РИСУЮТСЯ ВСЕГДА, ЗАНЯТЫ ОНИ ИЛИ НЕТ (H-11) ══════════════════════════
            Пробег идёт по `sides`, а не по `marked`: порядок обхода (`SILHOUETTE_VIEWS`) — это и
            есть порядок слотов, и пустой вид обязан стоять на СВОЁМ месте между занятыми, иначе
            «чего не хватает» приходится вычислять, а не читать. Счётчики в шапке секции считают
            по-прежнему занятые (`marked`) — теперь они совпадают с тем, что видит глаз. */}
        {sides.map((side) => {
          const picture = side.picture;
          if (!picture) {
            return (
              <Bay key={`slot-${side.view}`}>
                <EmptyStripCell
                  view={side.view}
                  /* ⚠ ТРЕБОВАНИЕ ЧИТАЕТСЯ У ТЕХ ЖЕ ВОРОТ, КОТОРЫЕ ОТКАЗЫВАЮТ (`renderGate`), а не
                     у `SHEET_MIN_VIEWS`: тот отвечает на вопрос ЛИСТА и сам оговаривает, что
                     ничего не запрещает. Довод целиком — у константы в `./model`. */
                  required={RENDER_MIN_VIEWS.includes(side.view)}
                  /* J-17. На read-only карточке двери нет вовсе — не серая кнопка, а её
                     отсутствие: каждая ЗАПИСЬ этого экрана гаснет так же. */
                  onPlaceMedia={
                    disabled ? undefined : (media) => placeMedia(media, side.view, side.slotRev)
                  }
                />
              </Bay>
            );
          }
          return (
            <Bay key={`slot-${side.view}`}>
              <StripCell
                emphasis
                src={pictureThumb(picture)}
                alt={viewLabel(side.view)}
                badge={viewLabel(side.view)}
                gallery={frameOf(picture)}
                onZoom={() => foldOnForeignZoom(picture.id ?? 0)}
                lines={[`in slot · ${viewLabel(side.view)}`, stripProvenance(band, picture)]}
                /* «unmark» ОСТАЁТСЯ СЛОВОМ В ПОДВАЛЕ, А НЕ УГЛОВЫМ ✕ ПРИМИТИВА, и это не
                   отступление от общего закона углов. ✕ примитива означает «убрать картинку», а
                   здесь картинка никуда не девается: пустеет СЛОТ, а плита остаётся на карточке,
                   справа от линии. Глифом эти два акта неразличимы, и на выпущенной карточке цена
                   ошибки — потерянная работа. */
                action={
                  disabled ? undefined : (
                    <Button
                      variant='secondary'
                      size='xs'
                      className='w-full'
                      loading={busy === `v${side.view}`}
                      onClick={() => unmark(side.view, side.slotRev)}
                    >
                      unmark
                    </Button>
                  )
                }
              />
            </Bay>
          );
        })}

        {/* The line. It stands even when one side is empty: it separates two QUESTIONS, not two
            non-empty lists, and a divider that comes and goes stops reading as a boundary. */}
        <StripDivider />

        {/* ═══ ФИЛЬТР ПО ПРОИСХОЖДЕНИЮ — СРАЗУ ЗА ЛИНИЕЙ, СТОЛБИКОМ (D-5) ═══════════════════════
            Владелец: «после дивайдера не показывают фильтр». Стоит там, где назван: первым
            членом правой половины, ПЕРЕД дверью и списком, которыми правит. Столбик, а не
            строка: лента горизонтальная, и ряд чипов в ней читался бы как ещё три ячейки; столбик
            шириной в самый длинный чип занимает одну колонку и стоит с кадрами на одном верхе.
            Чипы — те же, что у ARTIFACTS и у выбора колорвея (`Chip`, `aria-pressed`): состояние
            несут заливка и объявление, число — сколько под этим словом стоит справа от линии.
            ⚠ РЯД НЕ РИСУЕТСЯ, КОГДА СУЖАТЬ НЕЧЕГО: одно семейство на карточке — фильтр из одного
            члена обещал бы жест, у которого нет второго исхода. */}
        {filterShown && (
          <Bay>
            <div
              role='group'
              aria-label='show drawings by origin'
              data-flat-filter={origin}
              className='flex shrink-0 flex-col items-start gap-1'
            >
              <Text size='nano' variant='label' component='span'>
                filter
              </Text>
              <Chip
                selected={origin === 'all'}
                pressed={origin === 'all'}
                onClick={() => setOrigin('all')}
                data-flat-filter-chip='all'
                title='every drawing of this card that is not standing in a slot'
              >
                all {originCounts.all}
              </Chip>
              {originFamilies.map((family) => (
                <Chip
                  key={family.value}
                  selected={origin === family.value}
                  pressed={origin === family.value}
                  onClick={() => setOrigin(origin === family.value ? 'all' : family.value)}
                  data-flat-filter-chip={family.value}
                  title={family.hint}
                >
                  {family.label} {originCounts[family.value]}
                </Chip>
              ))}
            </div>
          </Bay>
        )}

        {/* THE HAND DOOR, equal in weight to the machine. A flat brought here lands on the upload
            shelf UNMARKED — `RegisterDesignUpload` with no target — because the human has not yet
            said which view it is, and a ghost guess is not an answer. It appears on the right of
            the line a moment later, FIRST, with the same `mark ▸` as everything else: «newest
            first» puts a just-uploaded drawing at the head of the list it was added to. */}
        {!disabled && (
          <Bay>
            <div className={`flex flex-col gap-1 ${CELL_WIDTH}`}>
              <MediaSlot
                aspectRatio={['Custom']}
                frameAspect={STRIP_FRAME_ASPECT}
                label='+ flat'
                hint={null}
                purpose='design · flat for the render'
                showVideos={false}
                editMode
                onSelect={(media) => {
                  const items = media
                    .map((m) => m.id ?? 0)
                    .filter((id) => id > 0)
                    // `kind: 'flat'` is a STATEMENT, not a guess (unlike `ghostView`): this door
                    // sits under «input — flats of this card», so what comes through it is a
                    // drawing. Nothing downstream could recover that from the pixels.
                    // …и колорвея у него нет по существу: `colorway_forbidden` на флэте — отказ,
                    // а не обнуление. Ноль здесь читается «у чертежа цвета не бывает».
                    .map((mediaId) => uploadItem({ mediaId, kind: 'flat' }));
                  if (!items.length) return;
                  writes.registerUpload.mutate({
                    // Minted once per human intent and NOT inside the mutation: a retry carrying a
                    // fresh id would make the server honestly file a second batch.
                    clientRequestId: newClientRequestId(),
                    items,
                  });
                }}
                allowMultiple
              />
              <Text size='nano' variant='label' component='span'>
                bring your own
              </Text>
              <Text size='nano' variant='label' component='span'>
                ⌘V · drop · browse
              </Text>
            </div>
          </Bay>
        )}

        {shownLoose.map((picture) => (
          <Bay key={`pic-${picture.id}`}>{looseCell(picture)}</Bay>
        ))}

        {/* ═══ СКЛЕЕННЫЕ ЛИСТЫ — ПОСЛЕДНИМИ СПРАВА ОТ ЛИНИИ, И ЭТО ПЕРВЫЙ КЛЮЧ СОРТИРОВКИ (E-6)
            Порядок не косметический: одиночный чертёж помечается В ОДНУ сторону, лист адресует
            ВЕСЬ вход сразу. Жест, переписывающий четыре слота, обязан стоять после жестов,
            переписывающих один, — иначе он читается как ещё один `mark ▸`, только пошире. */}
        {shownSheets.map((deck) => {
          const { members } = deck;
          const id = deck.sheet.id ?? 0;
          const open = openDeck === id;
          if (!members.length) {
            return <Bay key={`deck-${id}`}>{sheetCell(deck, members, false)}</Bay>;
          }
          return (
            <Bay key={`deck-${id}`} groupOf={open ? id : 0}>
              <CropDeck
                rootId={id}
                count={members.length}
                peeks={members.map((member) => ({
                  id: member.id ?? 0,
                  url: pictureThumb(member),
                  alt: `piece cut from sheet ${id}`,
                }))}
                /* ПОЛОСА — НЕ СЕТКА: ячейка здесь фиксированной ширины, и ширина колоды считается
                   явно, а не спанится дорожками. Формула — та же, что у ленты и у выходов: лист
                   плюс по трети на каждый выглядывающий кусок. */
                sheetWidth={`${STRIP_CELL_PX}px`}
                frameAspect={STRIP_FRAME_ASPECT}
                className='shrink-0'
                style={
                  open
                    ? undefined
                    : {
                        width: `calc(${STRIP_CELL_PX}px + ${Math.min(
                          members.length,
                          DECK_PEEK_MAX,
                        )} * ${STRIP_CELL_PX}px / ${DECK_PEEK_MAX})`,
                      }
                }
                open={open}
                onToggle={() => setOpenDeck((current) => (current === id ? null : id))}
                /* Дверь колоды — в ряду дверей ячейки (`expand ▸` / `apply splitted` + `▾`), а не
                   своей строкой под кадром: F-9, тот же довод, что у выходов. */
                hostDoor
              >
                {sheetCell(deck, members, open)}
              </CropDeck>
              {open &&
                members.map((member) => (
                  <Fragment key={member.id}>{looseCell(member)}</Fragment>
                ))}
            </Bay>
          );
        })}

        {!marked.length && !others.length && !sheets.length && (
          <Text size='micro' variant='inactive' component='span' className='py-6'>
            nothing to mark yet — use + FLAT to bring a drawing in, or generate one on the FLAT
            screen.
          </Text>
        )}

        {/* Фильтр скрыл всё — сказано словом и числом, а не пустотой: пустая правая половина под
            поставленным чипом читалась бы как «чертежей нет», и человек пошёл бы генерировать. */}
        {origin !== 'all' && !shownLoose.length && !shownSheets.length && (
          <Text
            size='micro'
            variant='inactive'
            component='span'
            className='self-center'
            data-flat-filter-empty={hiddenByFilter}
          >
            no {origin} drawings off the bench — {hiddenByFilter} hidden by the filter
          </Text>
        )}
      </Strip>

      {/* ═══ ЗДЕСЬ СТОЯЛИ ДВЕ ПРОСТЫНИ — F-5, СНЯТЫ ДОСЛОВНО ПО ТРЕБОВАНИЮ ВЛАДЕЛЬЦА ════════════
          Первая («Left of the line — what the render actually reads… under TEXTURE & COLOUR»)
          пересказывала лентой уже сказанное: четыре слота видно, `*` и красная приписка у
          обязательной стороны стоят на самой ячейке, `⌘V · drop · browse` стоит в пустом слоте,
          `multi-view` и число видов — на кадре листа. Уцелел ОДИН её факт, которого лента не
          говорила, — что пометка ВЫТЕСНЯЕТ, а не удаляет; он переехал в дверь `mark ▸` подписью
          занятой стороны и подсказкой (`MARK_TITLE`).
          Вторая («This card has more history than one page…») была утверждением о ЧИСЛЕ и уехала
          к числу: оговорка `newest page only` у счётчика секции плюс `PAGE_TITLE` подсказкой.
          Ни один довод не потерян; потеряны два абзаца, которые их пересказывали. */}

      {/* Модалка разреза — ПОД лентой: в прокручиваемом ряду ей места нет, а открывается она
          дверью `split ▸` либо углом кадра. */}
      {split.modal}

      {/* ОДИН РЕДАКТОР НА ВСЮ ПОЛОСУ, ПО ИМЕНИ ЦЕЛИ (E-3). Держать его внутри ячейки значило бы
          столько модалок, сколько плиток; булев флаг открыл бы их разом над всеми.
          `slot={null}` — плитка полосы не слот верстака: результат правки никуда вставать не
          обязан, он ложится на карточку обычным чертежом и приходит сюда же, справа от линии. */}
      {editingId > 0 &&
        (() => {
          const base =
            others.find((picture) => (picture.id ?? 0) === editingId) ??
            sheets.find(({ sheet }) => (sheet.id ?? 0) === editingId)?.sheet;
          return base ? (
            <VectorModal
              open
              onOpenChange={(next: boolean) => !next && setEditingId(0)}
              techCardId={techCardId}
              band={band}
              base={base}
              slot={null}
              disabled={disabled}
            />
          ) : null;
        })()}
    </Section>
  );
}
