import type {
  GetDesignBandResponse,
  common_DesignPicture,
  common_MediaFull,
} from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { cn } from 'lib/utility';
import { Fragment, useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

import { cardOutputRows } from '../bench-kinds';
import { cropFamilies, cutPiecesWord } from '../generation/composite';
import { CropDeck, DECK_PEEK_MAX } from '../generation/crop-deck';
import { VectorModal } from '../modals';
import { useSplitToInput } from '../split-to-input';
import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { SILHOUETTE_VIEWS, viewLabel } from '../views';
import { ApplySplitDoor, splitDecks, type SplitDeck } from './apply-split';
import {
  RENDER_MIN_VIEWS,
  benchSides,
  feedIsTruncated,
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
 * предложение целиком подсказкой. Абзац стоял под лентой ВСЕГДА, в том числе на карточке в одну
 * страницу, где оговаривать было нечего.
 */
const PAGE_TITLE =
  'this card has more history than one page. The right of the line lists the drawings of the ' +
  'newest page; older ones are still on the card and still standing in their slots.';

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
  const others = useMemo(() => unmarkedFlats(band), [band]);
  const marked = sides.filter((side) => !!side.picture);
  /**
   * СКЛЕЕННЫЕ ЛИСТЫ ФЛЭТОВ — ВТОРОЙ РОД ЯЧЕЙКИ СПРАВА ОТ ЛИНИИ (E-6).
   *
   * Их НЕТ в `others` намеренно и правильно: `isFlatCandidate` выбрасывает композиты, потому что
   * в СЛОТ такой лист не встаёт — сервер отказывает (`ErrDesignCompositePlate`). Ровно поэтому
   * владелец их и не видел. Показываются они здесь ДРУГИМ глаголом: `split ▸` у неразрезанного,
   * `expand ▸` + `apply splitted` у разрезанного, — а не `mark ▸`, который отказал бы.
   *
   * ⚠ «ЛИСТ» ЗДЕСЬ — ЭТО ВСЕГДА ВЫХОД ПРОГОНА, И ЭТО ЗАМЕР, А НЕ ДОПУЩЕНИЕ. На бете (73 картинки
   * карточки) `composite_views` непусто у 18 строк, и ВСЕ восемнадцать — выходы прогонов; у 21
   * загруженной руками картинки это поле не заполнено НИ РАЗУ. Значит `splitDecks` никогда не
   * увидит листом файл, который человек принёс сам: ни колоды, ни `split ▸` в этой полосе он не
   * получит, сколько бы видов на нём ни было нарисовано. Это НЕ дефект этой волны и чинить его
   * здесь нечем (поле заполняет сервер на выходе прогона) — но и строить на «отсюда можно
   * разрезать любой лист» нельзя: неверно.
   */
  const decks = useMemo(() => splitDecks(band, 'flat'), [band]);

  /**
   * ═══ РОДСТВО — ОДИН ЧИТАТЕЛЬ И ОДИН ПУЛ (F-4) ════════════════════════════════════════════════
   *
   * `cropFamilies` — тот же читатель, которым родство читают лента, выходы и сам `splitDecks`;
   * пул — тот же, из которого `splitDecks` берёт листы (`cardOutputRows`, ВСЯ карточка), плюс
   * страница ленты для откаченного бинаря, у которого `outputs` не пришло вовсе.
   *
   * ⚠ ПУЛ ОБЯЗАН БЫТЬ ТЕМ ЖЕ, А НЕ ПОХОЖИМ. `cropFamilies` лезет к КОРНЮ родословной ЧЕРЕЗ
   * промежуточные звенья: кусок, вырезанный из ОТРЕДАКТИРОВАННОГО листа, доберётся до листа
   * только если правка тоже лежит в пуле. Пул поуже — и внук остался бы одиночным чертежом рядом
   * со своим листом, то есть ровно тем дефектом, который эта правка и закрывает.
   *
   * ⚠ И ЭТО ЖЕ ДЕЛАЕТ ДЕГРАДАЦИЮ ЧЕСТНОЙ. Кусок, чей лист до полосы не доехал (лист скрыт, лист
   * не того рода), корня в пуле не находит и остаётся ОДИНОЧНЫМ. Это верно: спрятать кусок за
   * лист, которого на экране нет, значило бы потерять его молча.
   */
  const families = useMemo(() => {
    const rows = cardOutputRows(band, 'flat');
    const pool: common_DesignPicture[] = rows ? rows.map((row) => row.picture) : [];
    const seen = new Set(pool.map((picture) => picture.id ?? 0));
    for (const picture of others) {
      const id = picture.id ?? 0;
      if (!seen.has(id)) pool.push(picture);
    }
    return cropFamilies(pool);
  }, [band, others]);

  /**
   * ЛИСТ И ЕГО КУСКИ, НОВЕЙШИЙ ЛИСТ ПЕРВЫМ.
   *
   * ⚠ ЧЛЕНОМ КОЛОДЫ СЧИТАЕТСЯ ТОЛЬКО ТО, ЧТО ЭТА ПОЛОСА ВПРАВЕ ПРЕДЛОЖИТЬ (`others`). Кусок,
   * УЖЕ СТОЯЩИЙ В СЛОТЕ, живёт слева от линии, и нарисовать его ещё раз внутри колоды значило бы
   * показать одну картинку в обеих половинах — тот самый дубль, ради снятия которого колода здесь
   * и появилась. Счёт кусков на двери поэтому тоже считает предлагаемые, а не все.
   */
  const sheets = useMemo(() => {
    const offered = new Set(others.map((picture) => picture.id ?? 0));
    return decks
      .map((deck) => ({
        deck,
        members: (families.membersOf.get(deck.sheet.id ?? 0) ?? []).filter((member) =>
          offered.has(member.id ?? 0),
        ),
      }))
      .sort((a, b) => (b.deck.sheet.id ?? 0) - (a.deck.sheet.id ?? 0));
  }, [decks, families, others]);

  /** Одиночные чертежи: то, что не ушло за свой лист. Новейшее первым. */
  const loose = useMemo(() => {
    const folded = new Set<number>();
    for (const { members } of sheets) for (const member of members) folded.add(member.id ?? 0);
    return others
      .filter((picture) => !folded.has(picture.id ?? 0))
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }, [others, sheets]);

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
        items: [{ mediaId, ghostView: view, kind: 'flat', colorwayId: 0 }],
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

  /** ОДНА ЯЧЕЙКА ОДИНОЧНОГО ЧЕРТЕЖА, И ОНА РИСУЕТСЯ ИЗ ДВУХ МЕСТ — рядом и внутри раскрытой
   *  колоды. Второе написание разошлось бы с первым словом или пикселем: это ровно тот дефект,
   *  ради которого `StripCell` и заведён. */
  const looseCell = (picture: common_DesignPicture): JSX.Element => {
    const id = picture.id ?? 0;
    const provenance = stripProvenance(band, picture);
    return (
      <StripCell
        key={`pic-${id}`}
        offeredPictureId={id}
        src={pictureThumb(picture)}
        alt={provenance}
        gallery={frameOf(picture)}
        onZoom={() => foldOnForeignZoom(id)}
        onEdit={editCorner(picture)}
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
                items={[
                  { value: MARK_PROMPT, label: 'mark ▸' },
                  ...SILHOUETTE_VIEWS.map((view) => ({
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
  const sheetDoors = (deck: SplitDeck, members: common_DesignPicture[], open: boolean) => {
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
    deck: SplitDeck,
    members: common_DesignPicture[],
    open: boolean,
  ): JSX.Element => {
    const id = deck.sheet.id ?? 0;
    const provenance = stripProvenance(band, deck.sheet);
    const cut = members.length > 0;
    return (
      <StripCell
        key={`deck-${id}`}
        cellPictureId={id}
        src={pictureThumb(deck.sheet)}
        alt={`multi-view sheet · ${deck.declared.map(viewLabel).join(', ')}`}
        badge='multi-view'
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
           сломанный. */
        onSplit={
          disabled || cut
            ? undefined
            : {
                onClick: () => split.openForPicture(deck.sheet, `sheet ${id}`),
                ariaLabel: `split the multi-view sheet ${id} into views`,
              }
        }
        lines={[
          deck.declared.length
            ? `${deck.declared.length} views · ${deck.declared.map(viewLabel).join(', ')}`
            : 'a multi-view file',
          provenance,
        ]}
        action={sheetDoors(deck, members, open)}
      />
    );
  };

  const truncated = feedIsTruncated(band);

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
          /* Оговорка охвата несёт предложение целиком — F-5, разбор у `PAGE_TITLE`. */
          title={truncated ? PAGE_TITLE : undefined}
        >
          {/* Одной строкой, а не двумя: JSX схлопывает перенос в ПРОБЕЛ, и «0 sheet s» вылезло бы
              ровно из аккуратного форматирования. */}
          {marked.length} marked · {others.length} not marked
          {decks.length > 0 ? ` · ${decks.length} multi-view` : ''}
          {truncated ? ' · newest page only' : ''}
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
                    .map((mediaId) => ({ mediaId, ghostView: '', kind: 'flat', colorwayId: 0 }));
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

        {loose.map((picture) => (
          <Bay key={`pic-${picture.id}`}>{looseCell(picture)}</Bay>
        ))}

        {/* ═══ СКЛЕЕННЫЕ ЛИСТЫ — ПОСЛЕДНИМИ СПРАВА ОТ ЛИНИИ, И ЭТО ПЕРВЫЙ КЛЮЧ СОРТИРОВКИ (E-6)
            Порядок не косметический: одиночный чертёж помечается В ОДНУ сторону, лист адресует
            ВЕСЬ вход сразу. Жест, переписывающий четыре слота, обязан стоять после жестов,
            переписывающих один, — иначе он читается как ещё один `mark ▸`, только пошире. */}
        {sheets.map(({ deck, members }) => {
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

        {!marked.length && !others.length && !decks.length && (
          <Text size='micro' variant='inactive' component='span' className='py-6'>
            nothing to mark yet — use + FLAT to bring a drawing in, or generate one on the FLAT
            screen.
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
            sheets.find(({ deck }) => (deck.sheet.id ?? 0) === editingId)?.deck.sheet;
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
