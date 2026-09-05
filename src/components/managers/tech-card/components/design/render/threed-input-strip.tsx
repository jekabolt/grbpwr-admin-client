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
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

import { slotHolding } from '../bench-kinds';
import { InertDoor } from '../bench-slot';
import { cropFamilies, cutPiecesWord } from '../generation/composite';
import { CropDeck, DECK_PEEK_MAX } from '../generation/crop-deck';
import { VectorModal } from '../modals';
import { useSplitToInput } from '../split-to-input';
import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { SILHOUETTE_VIEWS, normaliseViewKey, viewLabel } from '../views';
import { ApplySplitDoor } from './apply-split';
import { LockBar } from './generate-row';
import {
  liveRunsOfKind,
  outputsOfKind,
  pictureIsComposite,
  pictureOffersSplit,
  pictureThumb,
  slotOrigin,
  slotOriginLine,
  stripProvenance,
  threedSides,
  type Gate,
} from './model';
import { PendingCell } from './outputs';
import { sheetsOf, type FlatSheet } from './render-input-strip';
import { uploadItem } from '../upload-item';
import {
  CELL_WIDTH,
  STRIP_CELL_PX,
  STRIP_FRAME_ASPECT,
  Strip,
  StripCell,
  StripDivider,
} from './strip-cell';

/**
 * INPUT — RENDERS BY VIEW. Ровно то, из чего сервер соберёт эту сборку, — и всё, что в это можно
 * поставить.
 *
 * ═══ ЭТО ЗЕРКАЛО ВЕРСТАКА, А НЕ ВТОРОЙ ЕГО ПИСАТЕЛЬ (J-26) ════════════════════════════════════
 *
 * Владелец, дословно: «в 3D вкладке мы будем видеть только INPUT — RENDERS BY VIEW и там будут
 * как раз наши слоты из FABRIC RENDER SLOTS».
 *
 * ЧТО СТОЯЛО ЗДЕСЬ ДО ЭТОГО КРУГА — 566 строк, и половина из них были ПИСАТЕЛЯМИ ТЕХ ЖЕ СЛОТОВ:
 * `mark ▸` в каждой стороне, дверь загрузки «+ render», дверь «use the N you chose», правая
 * половина полосы со всеми рендерами карточки и три объясняющих абзаца. Они появились кругом
 * V-14/Д-3/Д-4 как ответ на «нельзя просунуть референсы»: тогда 3D было ЕДИНСТВЕННЫМ местом, где
 * рендер-слот вообще можно было написать.
 *
 * J-25 перенёс заполнение слотов туда, где лежит материал, — на FABRIC RENDER. Значит здесь
 * остался бы ВТОРОЙ ПИСАТЕЛЬ ОДНОГО СЛОТА на второй вкладке: два экрана, две прочитанные полосы,
 * два CAS-токена одной строки и два разных скоупа (тот, что выбран здесь, и тот, что выбран там).
 * Отказ, который эта правка делает НЕВЫРАЗИМЫМ, именно этот: слот пишется в одном месте, а 3D
 * показывает ровно `threedSides(band, scope)` — ту же функцию, по которой `turntableSourceIds`
 * собирает `source_picture_ids`, и тот же предикат, что у сервера (`designSelectBench`). Вход и
 * прогон согласны ПО ПОСТРОЕНИЮ, а не по дисциплине двух экранов.
 *
 * ═══ КРУГ 18 (D-9 / D-10 / D-11 / D-12): ВЛАДЕЛЕЦ ВЕРНУЛ ПРАВУЮ ПОЛОВИНУ — И ЛИНИЮ ══════════════
 *
 * Дословно: «в INPUT — RENDERS BY VIEW должны так же показыватся мультивью карточками сделай и на
 * анколапс бекграунд чуть темный» (D-9); «в каждый слот плейсхолдера можно закинуть так же из
 * медиа пикера» (D-10); «должны так же показываться не только мультивью но и если мы герерили не
 * мультивью» (D-11); «должен быть дивайдер между картинками и слотами» (D-12).
 *
 * ЭТО ОТМЕНЯЕТ ПОЛОВИНУ J-26, И ОТМЕНЯЕТ ЕЁ ВЛАДЕЛЕЦ, А НЕ ЭТОТ ФАЙЛ. Довод J-26 — «второй писатель
 * одного слота» — пережил E-6 (`apply splitted` пишет четыре стороны отсюда) и теперь D-10 (файл
 * из медиатеки ложится в сторону отсюда). Что из J-26 ЖИВО и держится здесь по-прежнему:
 *   · левая половина — `threedSides(band, colorway)`, тот же верстак и тот же скоуп, что у прогона;
 *   · снятия (`unmark`) здесь нет: ✕ на плите в FABRIC RENDER SLOTS показывает, что встанет взамен;
 *   · одна запись на сторону, одним CAS-токеном, прочитанным ЭТИМ рендером.
 * Что вернулось: правая половина — все рендеры этого колорвея (с круга 20 — ВСЕ, а не только
 * ещё не поставленные, см. ниже) — тем же органом, что INPUT — FLATS OF THIS CARD: линия,
 * дыры живых прогонов, одиночные кадры с `mark ▸`, листы
 * колодами (`expand ▸` / `apply splitted` + `fold ▾`), раскрытая группа на затемнённом грунте.
 * Полоса входа 3D и полоса входа рендера — ОДИН орган под двумя заголовками, и «везде одинаково»
 * теперь верно и для них.
 *
 * ⚠ ПРАВАЯ ПОЛОВИНА СУЖЕНА КОЛОРВЕЕМ ВЕРСТАКА (`outputsOfKind(band, 'render', colorway)`), И
 * БОЛЬШЕ НИЧЕМ (B-24, круг 20). Кадр чужого колорвея в этот верстак не встаёт
 * (`colorway_mismatch`), и предлагать его значило бы предлагать отказ.
 *
 * А ВОТ ПЛИТА, УЖЕ СТОЯЩАЯ В СЛОТЕ, ОТСЮДА БОЛЬШЕ НЕ ПРОПАДАЕТ. Прежде её выбрасывал `slotHolding`
 * — «одна плита стоит в одном слоте», — и на карточке с четырьмя занятыми сторонами вся правая
 * половина оказывалась пуста со словами «no render is off the bench». Владелец потребовал ровно
 * обратного: «после дивайдера должно показывать тоже самое что в RENDERS OF THIS CARD во вкладке
 * FABRIC RENDER», то есть ВЕСЬ список этого колорвея, с его органами — колодой, дырой живого
 * прогона, тонированным отсеком. Правило сервера при этом не отменено, а переехало С СПИСКА НА
 * ДВЕРЬ: у такой плиты `mark ▸` стоит ИНЕРТНОЙ и называет сторону, в которой плита уже стоит.
 *
 * ⚠ ЛИСТЫ — ЧЕРЕЗ `sheetsOf`, А НЕ `splitDecks`. Правило одно на обе полосы: лист — это КОРЕНЬ
 * родословной с кусками, объявил он виды или нет; ручной рендер, разрезанный человеком, — лист по
 * факту разреза. Написано один раз, в полосе флэтов, и импортировано.
 *
 * ═══ КРУГ 17 (F-10 / F-11 / F-12 / F-14): ОДНА ПОЛОСА РОВНЫХ КНОПОК, БЕЗ ЛИШНИХ СЛОВ ═══════════
 *
 * Владелец: «в INPUT — RENDERS BY VIEW … полнейший пиздец этот текст», «для даже незаспличеного
 * мультивью показываем кнопку аплай сплитед … убери все лишнее», «убери текст "WHAT IS MISSING /
 * no fabric render stands on this card yet — …"», «сделай полировку … что бы все было ровно все
 * кнопки ровные нет лишнего текста ничего не перекосоебано».
 *
 * ПРАВИЛО ОДНО НА ВСЮ ПОЛОСУ: под каждой ячейкой, у которой есть жест, стоит РОВНО ОДНА кнопка
 * `secondary/xs` во всю ширину ячейки (раскрытая колода — две, столбиком, F-14 у полосы флэтов).
 * Пустая сторона — «FABRIC RENDER ▸» (туда, где сторону заполняют из полки и генерации); лист без
 * разреза — «split ▸»; лист с разрезом — `expand ▸`, раскрытый — «apply splitted» + «fold ▾»;
 * одиночный рендер — `mark ▸`. На читаемой карточке те же двери стоят ИНЕРТНЫМИ С ПРИЧИНОЙ, каждая
 * со СВОЕЙ подписью, — кроме читателей (`expand ▸` / `fold ▾`): раскрыть колоду — это читать.
 *
 * ⚠ ПОЛОСА «WHAT IS MISSING» НЕ РИСУЕТСЯ ДЛЯ ОДНОГО ОТКАЗА — ПУСТОГО ВЕРСТАКА (`next: 'render'`).
 * Четыре пустые ячейки со словами «empty · required · blocks 3D» и дверью на FABRIC RENDER — это и
 * есть ответ «чего не хватает». Остальные отказы (нет фронта, смешанные ревизии, на карточке нет
 * рендеров вовсе) полосу сохраняют: они говорят то, чего по ячейкам не прочесть.
 */

/**
 * Инертная дверь — во всю ячейку, как и живая. `InertDoor` рисует `inline-flex` по содержимому;
 * ряд, где живая кнопка на 132px, а погашенная — на 90, читался бы как две разные вещи.
 */
const INERT_DOOR = 'flex w-full [&>button]:w-full';

const READ_ONLY_REASON =
  'this card is read-only for you — cutting a render or putting one into a side is an edit of the card';

/** Radix forbids an empty item value — «mark ▸» is a sentinel, never `''` (see the flats strip). */
const MARK_PROMPT = '__mark__';

const MARK_TITLE =
  'mark puts this render into a side of the input. A side that already holds one gives it up: ' +
  'the displaced render stays on this card and comes back to the right of the line. Nothing is deleted.';

const FRAME_HEIGHT = 'h-[148px]';

/**
 * ОТСЕК ОДНОГО ЧЛЕНА ПОЛОСЫ. Раскрытая колода — лист ПЛЮС его куски, по разные стороны `CropDeck`;
 * коробку, охватывающую обе половины, даёт отсек, и тонируется ровно тот, что держит раскрытую
 * группу (`bgSecondary` — DESIGN.md, panel: «a fill, not a container»). Отсек у КАЖДОГО члена, а
 * не только у группы, — иначе `py-1` сдвинул бы группу относительно соседей.
 *
 * ⚠ ЭТО ТРЕТЬЕ НАПИСАНИЕ `Bay` (первое — `render/outputs.tsx`, второе — `render-input-strip.tsx`),
 * И ЭТО СКАЗАНО ВСЛУХ. Место ему — `strip-cell.tsx`, рядом со `Strip` и `StripDivider`; файл чужой
 * для этой волны, перенос назван в отчёте, а не сделан молча.
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

export function ThreedInputStrip({
  band,
  lock,
  onGoToKind,
  colorwayId,
  colorwayLabel,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  /** Отказ ворот 3D целиком — рисуется полосой под плитками, вместе со своей дверью. */
  lock?: Gate;
  /**
   * Уйти на другое представление студии. Состояние `kind` живёт в ОДНОМ месте на всю студию
   * (`StudioTab`); без пропа дверь рисуется ИНЕРТНОЙ С ПРИЧИНОЙ, а не пропадает.
   */
  onGoToKind?: (kind: 'flat' | 'render') => void;
  /**
   * ═══ ЧЕЙ ВЕРСТАК ПОКАЗАН — И ЭТО ЕДИНСТВЕННОЕ, ЧТО ЭТОТ ФАЙЛ ЗНАЕТ О КОЛОРВЕЕ (L-2/L-3) ═════
   *
   * Число обязано быть ТЕМ ЖЕ, под которым FABRIC RENDER пишет слоты и под которым прогон уезжает
   * на провод (`params.colorway_id`): иначе вход показывает один верстак, а сервер собирает
   * другой. Один источник на всю студию — `useColorwayChoice`. Каждая запись этого файла (D-10,
   * `mark ▸`, `apply splitted`) адресует ровно это число.
   */
  colorwayId?: number;
  colorwayLabel?: string;
  /**
   * ⚠ ВЕРНУЛИСЬ РАДИ ЗАПИСЕЙ — `apply splitted` (E-6), файла в слот (D-10), `mark ▸` (D-11).
   * Разбор того, чем это отличается от «второго писателя», которого запрещал J-26, — в шапке.
   */
  techCardId?: number;
  disabled?: boolean;
}): JSX.Element {
  const colorway = colorwayId ?? 0;
  const sides = useMemo(() => threedSides(band, colorway), [band, colorway]);
  const filled = sides.filter((side) => !!side.picture).length;
  const named = colorwayLabel?.trim() ?? '';
  const writes = useDesignWrites(techCardId ?? 0);
  const split = useSplitToInput({ techCardId: techCardId ?? 0, band });
  const canWrite = !!techCardId && !disabled;

  /**
   * ═══ ПРАВАЯ ПОЛОВИНА — ТО ЖЕ, ЧТО «RENDERS OF THIS CARD» НА FABRIC RENDER (B-24, круг 20) ═════
   *
   * Владелец, дословно: «в INPUT — RENDERS BY VIEW в 3D после дивайдера должно показывать тоже
   * самое что в RENDERS OF THIS CARD во вкладке FABRIC RENDER».
   *
   * ЧТО БЫЛО ДО ЭТОГО КРУГА И ПОЧЕМУ ЭТО ПРИШЛОСЬ ПОМЕНЯТЬ. Полоса показывала СУЖЕННЫЙ список —
   * «рендеры этого колорвея, ещё не стоящие ни в одной стороне» (D-11): всё, что человек уже
   * положил в слот, из неё исчезало. Отсюда и жалоба: заполнив четыре стороны, он получал справа
   * от линии слово «no render is off the bench» на карточке, у которой рендеров полдюжины.
   * Раздел `RENDERS OF THIS CARD` не сужает ничем, кроме рода и колорвея, — теперь и здесь так же.
   *
   * ДВА НАБОРА ВМЕСТО ОДНОГО, И РАЗЛИЧИЕ НЕСУЩЕЕ:
   *   · `shown` — ЧТО ВИДНО. Весь пул, как в `RENDERS OF THIS CARD`.
   *   · `markable` — У ЧЕГО ЖИВАЯ ДВЕРЬ `mark ▸`. Композит в сторону не встаёт вовсе (он лист, его
   *     сначала режут), а плита, уже стоящая в слоте, второй постановки не переживает: сервер
   *     отказывает наотрез, одна плита — один слот. Предлагать такую дверь значило бы предлагать
   *     отказ, поэтому она стоит ИНЕРТНОЙ С ПРИЧИНОЙ, а не пропадает вместе со своей плиткой.
   *
   * `outputsOfKind` — вся карточка, когда сервер её называет (`outputs`), иначе страница ленты;
   * скрытые выброшены там же. Пул родословной — ВСЕ рендеры колорвея, включая стоящие в слоте:
   * кусок, вырезанный из отредактированного листа, доходит до листа только через правку.
   */
  const outputs = useMemo(() => outputsOfKind(band, 'render', colorway), [band, colorway]);
  const pool = useMemo(() => outputs.map((row) => row.picture), [outputs]);
  const families = useMemo(() => cropFamilies(pool), [pool]);
  const shown = useMemo(() => new Set(pool.map((picture) => picture.id ?? 0)), [pool]);
  const markable = useMemo(
    () =>
      new Set(
        pool
          .filter(
            (picture) =>
              !pictureIsComposite(picture) && !slotHolding(band, picture.id ?? 0),
          )
          .map((picture) => picture.id ?? 0),
      ),
    [pool, band],
  );
  const sheets = useMemo(() => sheetsOf(pool, families, shown), [pool, families, shown]);
  /** Одиночные рендеры: то, что не ушло за свой лист и само не стало листом. Новейшее первым. */
  const loose = useMemo(() => {
    const folded = new Set<number>();
    for (const { sheet, members } of sheets) {
      folded.add(sheet.id ?? 0);
      for (const member of members) folded.add(member.id ?? 0);
    }
    return pool
      .filter((picture) => shown.has(picture.id ?? 0) && !folded.has(picture.id ?? 0))
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }, [pool, shown, sheets]);
  /**
   * ЖИВЫЕ ПРОГОНЫ ЭТОГО ЖЕ РОДА И КОЛОРВЕЯ — пунктирные ячейки в голове правой половины (B-24).
   * Тот же орган и тот же список, что в `RENDERS OF THIS CARD` (`PendingCell`, `liveRunsOfKind`):
   * без него полоса в состоянии покоя ничем не признаётся, что прогон уже заказан и оплачен.
   */
  const pending = useMemo(() => liveRunsOfKind(band, 'render', colorway), [band, colorway]);
  /** Сколько показанных рендеров ещё можно положить в сторону — счёт по ДВЕРИ, а не по списку. */
  const notMarked =
    loose.filter((picture) => markable.has(picture.id ?? 0)).length +
    sheets.reduce(
      (n, { members }) => n + members.filter((m) => markable.has(m.id ?? 0)).length,
      0,
    );

  /** Какие стороны заняты — «что вытеснит пометка», сказанное списком (F-5). */
  const occupied = useMemo(
    () => new Set(sides.filter((side) => side.picture).map((side) => side.view)),
    [sides],
  );

  /** Which cell a write is in flight for — a shared `isPending` would say «saving» on all. */
  const [busy, setBusy] = useState<string | null>(null);
  /** ОДНА ОТКРЫТАЯ КОЛОДА НА ПОЛОСУ — тем же законом, что в ленте, выходах и полосе флэтов. */
  const [openDeck, setOpenDeck] = useState<number | null>(null);
  /** Какую картинку правим. Ноль — закрыто. */
  const [editingId, setEditingId] = useState(0);

  /** Зум чужой карточки складывает открытую колоду (E-4); своя и её куски — нет. */
  const foldOnForeignZoom = (pictureId: number) =>
    setOpenDeck((current) => {
      if (current === null || !pictureId) return current;
      if (pictureId === current) return current;
      return families.rootOf.get(pictureId) === current ? current : null;
    });

  const frameOf = (picture: common_DesignPicture) =>
    picture.media ? mediaFullToViewerItem(picture.media) : undefined;

  /**
   * ═══ ПОСТАНОВКА В СТОРОНУ — ТО ЖЕ ТЕЛО, ЧТО У ПОЛОСЫ ФЛЭТОВ, С РОДОМ `render` (D-11) ═════════
   *
   * ⚠ `slotId` НЕ СТАВИТСЯ ВОВСЕ. `view_key` и `slot_id` — ЧЛЕНЫ ОДНОГО `oneof`, и ноль в
   * proto-JSON это ЗАДАННОЕ поле: тело с обоими сервер отвергает ЦЕЛИКОМ («oneof … is already
   * set»). Три двери этого экрана не работали с выпуска ровно из-за этого (F-11).
   * Колорвей — верстака, который читает эта полоса: пул уже сужен им, и кадр другого колорвея сюда
   * не попадает по построению.
   */
  const mark = (picture: common_DesignPicture, view: string) => {
    const side = sides.find((s) => s.view === view);
    const pictureId = picture.id ?? 0;
    if (!side || pictureId <= 0) return;
    setBusy(`p${pictureId}`);
    writes.setBenchSlot.mutate(
      {
        slot: { viewKey: side.view, kind: 'render', colorwayId: colorway },
        pictureId,
        expectedSlotRev: side.slotRev,
      },
      { onSettled: () => setBusy(null) },
    );
  };

  /**
   * ═══ ФАЙЛ ИЗ МЕДИАТЕКИ ПРЯМО В ПУСТУЮ СТОРОНУ, ОДНОЙ ТРАНЗАКЦИЕЙ (D-10) ═══════════════════════
   *
   * Владелец: «в каждый слот плейсхолдера можно закинуть так же из медиа пикера». Тот же вызов,
   * что у полосы флэтов (J-17) и у верстака (`bench.tsx:placeMedia`): `RegisterDesignUpload`
   * заводит медиа в полосу И кладёт кадр в сторону, названную в `target`, одной транзакцией.
   *   · `kind: 'render'` — УТВЕРЖДЕНИЕ этой полосы: под подписью «input — renders by view»
   *     приходит фабрик-рендер, и ничто ниже не восстановит это по пикселям;
   *   · `colorwayId: colorway` — рендер ЭТОГО колорвея, и на элементе, и на цели: сервер
   *     отказывает `colorway_mismatch`, если они расходятся, — здесь они одно число;
   *   · `ghostView` — сторона, которую человек ТОЛЬКО ЧТО НАЗВАЛ, положив файл в этот слот;
   *   · `expectedSlotRev` — ревизия строки, прочитанная ЭТИМ рендером;
   *   · `clientRequestId` минтится один раз на намерение, не внутри мутации.
   * ⚠ И ЗДЕСЬ НЕТ `slotId` — тот же oneof, что выше.
   */
  const placeMedia = (media: common_MediaFull, view: string, expectedSlotRev: number) => {
    const mediaId = media.id ?? 0;
    if (!mediaId) return;
    // Занятость здесь не рисуется: у `MediaSlot` нет лица «пишу», а ответ виден сам — сторона
    // заполняется и приходит слева от линии с перечитанной полосой.
    writes.registerUpload.mutate({
      clientRequestId: newClientRequestId(),
      items: [uploadItem({ mediaId, ghostView: view, kind: 'render', colorwayId: colorway })],
      target: { viewKey: view, kind: 'render', colorwayId: colorway },
      expectedSlotRev,
    });
  };

  /** Правка кадра — тот же угол и та же модалка, что у полосы флэтов (E-3). Только у пишущих. */
  const editCorner = (picture: common_DesignPicture) => {
    const id = picture.id ?? 0;
    if (!canWrite || id <= 0) return undefined;
    return {
      onClick: () => setEditingId(id),
      ariaLabel: `edit render ${id} — draw over this picture`,
      title: 'draw over this render — saving makes a NEW picture; the original is never overwritten',
    };
  };

  /**
   * ОДНА ЯЧЕЙКА ОДИНОЧНОГО РЕНДЕРА — рисуется из двух мест: рядом и внутри раскрытой колоды.
   * Дверь `mark ▸` — та же, что у полосы флэтов: угаданная сторона первой (D-6), занятая подписана
   * `· in use` (F-5), факт вытеснения — подсказкой на обёртке (Radix не пропускает `title`).
   */
  const looseCell = (picture: common_DesignPicture): JSX.Element => {
    const id = picture.id ?? 0;
    const provenance = stripProvenance(band, picture);
    const ghost = normaliseViewKey(picture.ghostView);
    const views = [...SILHOUETTE_VIEWS].sort((a, b) =>
      a === ghost ? -1 : b === ghost ? 1 : 0,
    );
    /* ГДЕ УЖЕ СТОИТ ЭТА ПЛИТА (B-24). С расширением списка до «всех рендеров карточки» плитка,
       занявшая сторону, стоит теперь и справа от линии — и её подпись обязана это СКАЗАТЬ:
       «not marked» на плите, которая стоит во фронте, — прямая ложь. Сторону называем по имени,
       потому что она ЕСТЬ у человека на экране, слева от той же линии. */
    const inSlot = slotHolding(band, id);
    const standsIn = inSlot ? normaliseViewKey(inSlot.viewKey) : '';
    return (
      <StripCell
        key={`pic-${id}`}
        offeredPictureId={id}
        src={pictureThumb(picture)}
        alt={provenance}
        gallery={frameOf(picture)}
        onZoom={() => foldOnForeignZoom(id)}
        onEdit={editCorner(picture)}
        lines={[
          inSlot ? `in slot · ${standsIn ? viewLabel(standsIn) : 'a side'}` : 'not marked',
          provenance,
        ]}
        action={
          !canWrite ? (
            <InertDoor className={INERT_DOOR} label='mark ▸' reason={READ_ONLY_REASON} />
          ) : !markable.has(id) ? (
            /* ⚠ ДВЕРЬ ГАСНЕТ, А НЕ ПРОПАДАЕТ (Д19). Сервер отказывает второй постановке одной
               плиты наотрез — одна плита стоит в одном слоте, — и живая `mark ▸` здесь продавала
               бы отказ. Снять её вовсе значило бы учить, что жеста не существует; погашенная с
               причиной учит, что именно стоит на пути и где это снимается. */
            <InertDoor
              className={INERT_DOOR}
              label='mark ▸'
              reason={
                standsIn
                  ? `this render already stands in ${viewLabel(standsIn)} — take it out there, or put another one into the side you need`
                  : 'this render already stands in a side of the input — one picture stands in one slot'
              }
            />
          ) : (
            <span className='block' data-mark-door={id || undefined} title={MARK_TITLE}>
              <SelectComponent
                name={`mark-render-${id}`}
                value={MARK_PROMPT}
                placeholder='mark ▸'
                disabled={busy === `p${id}`}
                /* ⚠ СЕЛЕКТОР ПРИВОДИТСЯ К МЕТРИКЕ КНОПКИ, А НЕ НАОБОРОТ (F-9/F-14). `min-h-0`
                   обязателен: `min-height` и `height` — РАЗНЫЕ группы у twMerge, и `min-h-[22px]`
                   примитива тихо победил бы `h-5`. Тот же приём, что у `mark ▸` в
                   `render/outputs.tsx`; без него дверь стояла на 6px выше соседних. */
                className='h-5 min-h-0 py-0 text-micro uppercase tracking-label'
                items={[
                  { value: MARK_PROMPT, label: 'mark ▸' },
                  ...views.map((view) => ({
                    value: view,
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
   * РЯД ДВЕРЕЙ ЛИСТА — ТРИ СОСТОЯНИЯ, И ЭТО ТЕ ЖЕ ТРИ, ЧТО У ПОЛОСЫ ФЛЭТОВ (F-4/E-6):
   *   · «лист ещё не разрезан» — `split ▸` (инертный с причиной на читаемой карточке, F-11);
   *   · «лист разрезан — где куски» — `expand ▸`, живой и на читаемой карточке: раскрыть — читать;
   *   · «положить разрез во вход» — `apply splitted` + `fold ▾`, и только у РАСКРЫТОЙ колоды.
   * Владелец (E-6), дословно: «если его расколапсить под мультивью кнопка аплай сплитед».
   */
  const sheetDoors = (deck: FlatSheet, open: boolean) => {
    const id = deck.sheet.id ?? 0;
    const { members } = deck;

    if (!members.length) {
      return !canWrite ? (
        <InertDoor className={INERT_DOOR} label='split ▸' reason={READ_ONLY_REASON} />
      ) : (
        <Button
          variant='secondary'
          size='xs'
          className='w-full'
          data-split-for={id}
          onClick={() => split.openForPicture(deck.sheet, `sheet ${id}`)}
          title='cut this multi-view render into one picture per side; the pieces can then be applied to the input at once'
        >
          split ▸
        </Button>
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

    const apply = !canWrite ? (
      <InertDoor className={INERT_DOOR} label='apply splitted' reason={READ_ONLY_REASON} />
    ) : deck.pieces.length > 0 ? (
      <ApplySplitDoor
        techCardId={techCardId ?? 0}
        sides={sides}
        pieces={deck.pieces}
        benchKind='render'
        /* ТОТ ЖЕ ВЕРСТАК, ЧТО ЧИТАЕТ ЭТА ПОЛОСА И ЧТО СОБИРАЕТ СЕРВЕР. Одно число на обе половины —
           иначе вход показывал бы одно, а прогон уезжал бы с другим. */
        colorwayId={colorway}
        noun='render'
      />
    ) : (
      /* ═══ КУСКИ БЕЗ СТОРОНЫ СИЛУЭТА — ДВЕРИ НЕТ ВОВСЕ (F-11a) ══════════════════════════════
         Здесь стояла ПОГАШЕННАЯ `apply splitted` с причиной «в этом разрезе не названа ни одна
         сторона». Довод был честный — «дверь говорит словом, а не молчит на нажатие», — но он
         решал задачу, которой на этом экране нет: полоса флэтов, тот же глагол и тот же разрез,
         в этом же случае не рисует НИЧЕГО (`render-input-strip.tsx`, `: null`). Два написания
         одного состояния — и владелец видит погашенную дверь на одной полосе и чистую ячейку на
         соседней, про один и тот же лист.
         Владелец (F-14), дословно: «нет лишнего текста ничего не перекосоебано». Выбрано
         молчание: разрез из одних деталей — это не отказ органа, а отсутствие повода его звать;
         сам факт «сторон тут не названо» уже написан под кадром строкой видов. */
      null
    );

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

  const sheetCell = (deck: FlatSheet, open: boolean): JSX.Element => {
    const id = deck.sheet.id ?? 0;
    const { members } = deck;
    const cut = members.length > 0;
    const composite = deck.declared.length > 0;
    return (
      <StripCell
        key={`deck-${id}`}
        cellPictureId={id}
        src={pictureThumb(deck.sheet)}
        alt={
          composite
            ? `multi-view render · ${deck.declared.map(viewLabel).join(', ')}`
            : `render cut by hand · ${cutPiecesWord(members.length)}`
        }
        badge={composite ? 'multi-view' : 'sheet'}
        gallery={frameOf(deck.sheet)}
        /* Свёрнутой колоде поверхность листа раскрывает её, а не зумит (J-2). */
        onOpen={cut && !open ? () => setOpenDeck(id) : undefined}
        onZoom={() => foldOnForeignZoom(id)}
        onEdit={editCorner(deck.sheet)}
        /* Угол `split` — только у неразрезанного склеенного листа (F-8): у разрезанного глагол уже
           другой, `expand ▸`, и два глагола на одном кадре читаются как один сломанный.
           ⚠ ОБА ЧЛЕНА — У `pictureOffersSplit` (`render/model.ts`), одного на все четыре экрана:
           правило, переписанное на месте, теряет член молча (так плитка референса и предъявляла
           угол любому снимку). `composite` рядом остаётся — он тут ещё и ПОДПИСЫВАЕТ ячейку
           («multi-view» против «sheet»), а это другой вопрос, чем «предлагать ли рез». */
        onSplit={
          canWrite && pictureOffersSplit(deck.sheet, cut)
            ? {
                onClick: () => split.openForPicture(deck.sheet, `sheet ${id}`),
                ariaLabel: `split the multi-view render ${id} into views`,
              }
            : undefined
        }
        lines={[
          composite
            ? `${deck.declared.length} views · ${deck.declared.map(viewLabel).join(', ')}`
            : cutPiecesWord(members.length),
          stripProvenance(band, deck.sheet),
        ]}
        action={sheetDoors(deck, open)}
      />
    );
  };

  return (
    <Section
      id='design-threed-input'
      title='input — renders by view'
      question={
        named
          ? `— the fabric render slots of ${named}, one per side`
          : '— the fabric render slots, one per side'
      }
      action={
        /* СЧЁТ, И ТОЛЬКО СЧЁТ. «front is required» стояло здесь вторым написанием того, что
           говорит сама ячейка FRONT («required · blocks 3D»); один факт в двух местах учит
           читать одно из них (F-14). */
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {filled} of 4 filled
          {notMarked > 0 ? ` · ${notMarked} not marked` : ''}
          {sheets.length > 0 ? ` · ${sheets.length} sheet${sheets.length === 1 ? '' : 's'}` : ''}
        </Text>
      }
    >
      <Strip>
        {sides.map((side) => {
          const picture = side.picture;
          if (!picture) {
            const label = viewLabel(side.view);
            const required = side.view === 'front';
            return (
              /* ═══ ПУСТАЯ СТОРОНА — И ЭТО ДВЕРЬ (D-10) ═══════════════════════════════════════
                 Кадр СТАЛ дверью, а не получил дверь рядом: коробка, которая и есть слот,
                 принимает файл сама — ровно как пустая плита верстака и пустой слот полосы
                 флэтов (`EmptyStripCell`). Ячейка написана здесь, а не взята оттуда, потому что
                 `EmptyStripCell` называет род словом «flat» в заголовке пикера и не несёт ни
                 строк этой полосы («required · blocks 3D»), ни ряда дверей; ей нужен проп
                 `noun` — файл чужой, перенос назван в отчёте.

                 ИМЯ СТОРОНЫ — `labelColor`, А НЕ ЦВЕТ ПЛЕЙСХОЛДЕРА (#ccc, ~1.6:1): это
                 единственное, что отвечает на вопрос «какая это сторона». */
              <Bay key={`slot-${side.view}`}>
                <div
                  data-slot-empty={side.view}
                  data-slot-door={canWrite ? 'media' : undefined}
                  className={cn('flex flex-col gap-1', CELL_WIDTH)}
                >
                  {canWrite ? (
                    <MediaSlot
                      aspectRatio={['Custom']}
                      frameAspect={STRIP_FRAME_ASPECT}
                      label={`+ add ${label}`}
                      hint={null}
                      purpose={`design · render for the ${label} slot`}
                      showVideos={false}
                      editMode
                      onSelect={(media) => {
                        const first = media[0];
                        if (first?.id) placeMedia(first, side.view, side.slotRev);
                      }}
                    />
                  ) : (
                    <div
                      className={cn(
                        placeholderClass({ dashed: true }),
                        FRAME_HEIGHT,
                        'w-full flex-col gap-0.5 px-1 text-center',
                      )}
                      style={PLACEHOLDER_SURFACE}
                      title={`no render stands in ${label}. Put one in from the right of the line, or on FABRIC RENDER.`}
                    >
                      {/* ⚠ ЭТО БЫЛ ГОЛЫЙ `<span>` — ЕДИНСТВЕННАЯ ЗАГЛУШКА ПОЛОСЫ МИМО `Text`.
                          Соседняя пустая ячейка (`EmptyStripCell`, `render/strip-cell.tsx`) пишет
                          имя стороны через `Text micro/label/tracking-label` капслоком; здесь имя
                          той же стороны шло базовым размером и без разрядки, то есть КРУПНЕЕ и
                          иначе, чем ровно та же подпись двумя ячейками левее. Слово `empty` —
                          `textColor`: это ответ, а не подпись, и `Text` держит его тон вложенным
                          span'ом, как и раньше. */}
                      <Text
                        size='micro'
                        variant='label'
                        tracking='label'
                        component='span'
                        className='flex flex-col gap-0.5 uppercase'
                      >
                        <span>{label}</span>
                        <span className='text-textColor'>
                          <b>empty</b>
                        </span>
                      </Text>
                    </div>
                  )}

                  {/* ═══ ОБЯЗАТЕЛЕН ФРОНТ, ОСТАЛЬНЫЕ ТРИ — ПОЛЬЗА, А НЕ УСЛОВИЕ (K-10/K-11) ═══
                      `multi-view-to-3d` бесплатно отвергает ровно одно — отсутствие фронта.
                      Ячейка, кричащая «blocks 3D» там, где ничего не блокируется, учит не читать
                      красное. */}
                  <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
                    {required ? 'required' : 'optional'}
                  </Text>
                  {required && (
                    <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
                      <span className='text-error'>blocks 3D</span>
                    </Text>
                  )}
                  {canWrite && (
                    /* `min-w-0 break-words` — как у двух соседей выше: ячейка узкая (132px), и
                       строка без них не даёт колонке сжаться, а раздвигает её собой. */
                    <Text
                      size='nano'
                      variant='label'
                      component='span'
                      className='min-w-0 break-words'
                    >
                      ⌘V · drop · browse
                    </Text>
                  )}

                  {/* ДВЕРЬ ВЕДЁТ ТУДА, ГДЕ СТОРОНУ ЗАПОЛНЯЮТ ИЗ ПОЛКИ И ГЕНЕРАЦИИ. Кнопка, а не
                      подчёркнутый текст (F-14); подпись — имя вкладки, 128px в ячейке 132. Тот же
                      якорь ряда дверей, что у `StripCell` (`data-cell-doors`): геометрию дверей
                      меряют по нему. */}
                  <div data-cell-doors='' className='mt-auto pt-0.5'>
                    {onGoToKind ? (
                      <Button
                        variant='secondary'
                        size='xs'
                        className='w-full'
                        onClick={() => onGoToKind('render')}
                        title={`fill ${label} on FABRIC RENDER — from the renders of this card or from a file`}
                      >
                        FABRIC RENDER ▸
                      </Button>
                    ) : (
                      <InertDoor
                        className={INERT_DOOR}
                        label='FABRIC RENDER ▸'
                        reason='switch to FABRIC RENDER on the strip above: its FABRIC RENDER SLOTS block is where a side is filled, from the renders of this card or from a file'
                      />
                    )}
                  </div>
                </div>
              </Bay>
            );
          }
          const origin = slotOrigin(band, side);
          const line = slotOriginLine(origin);
          return (
            <Bay key={`slot-${side.view}`}>
              <StripCell
                emphasis
                src={pictureThumb(picture)}
                alt={viewLabel(side.view)}
                badge={viewLabel(side.view)}
                cellPictureId={picture.id}
                gallery={frameOf(picture)}
                onZoom={() => foldOnForeignZoom(picture.id ?? 0)}
                /* ═══ ЧТО СТОИТ В СТОРОНЕ — СО ШТАМПА СЛОТА, А НЕ С ЛЕНТЫ (круг 15) ═════════════
                   `run_rrev` и `run_kind` едут на самой строке верстака. Строка чужого рода
                   (`from ON MODEL — a photograph…`) — не украшение: у перекраса собственный род
                   кадра ЧЕСТНО `render`, и без штампа фотография человека в стороне неотличима от
                   фабрик-рендера. */
                lines={[
                  line ? (
                    <span key='origin' className={origin.foreign ? 'text-warning' : undefined}>
                      {`in slot · ${viewLabel(side.view)} · ${line}`}
                    </span>
                  ) : (
                    `in slot · ${viewLabel(side.view)}`
                  ),
                  stripProvenance(band, picture),
                ]}
              />
            </Bay>
          );
        })}

        {/* ═══ ЛИНИЯ (D-12) ══════════════════════════════════════════════════════════════════
            Владелец: «должен быть дивайдер между картинками и слотами». J-26 снял её вместе с
            правой половиной, потому что она разделяла ДВА ВОПРОСА и второго не осталось; D-11
            вернул второй вопрос — «что ещё можно поставить», — и линия вернулась с ним. Стоит и
            при пустой правой половине: она делит вопросы, а не непустые списки. */}
        <StripDivider />

        {/* ═══ ЖИВОЙ ПРОГОН — В ГОЛОВЕ ПРАВОЙ ПОЛОВИНЫ (B-24) ══════════════════════════════════
            Тот же орган, что в `RENDERS OF THIS CARD` (`PendingCell` из `./outputs`), и стоит он
            там же — первым в списке, куда встанет ответ: сервер отдаёт выходы `ORDER BY o.id DESC`,
            значит вернувшаяся плита будет строкой НОЛЬ, и дыра обязана стоять на её месте.
            ⚠ ЭТО ДЕНЬГИ, а не украшение: без признака заказанного прогона человек жмёт GENERATE
            второй раз и покупает второй. Разбор — у самого `PendingCell`. */}
        {pending.map((run) => (
          <Bay key={`live-${run.id ?? run.startedAt ?? ''}`}>
            <PendingCell run={run} />
          </Bay>
        ))}

        {/* ═══ ОДИНОЧНЫЕ РЕНДЕРЫ, НОВЕЙШИЙ ПЕРВЫМ, ПОТОМ ЛИСТЫ (D-11, E-6) ══════════════════════
            Тот же порядок, что у полосы флэтов: одиночный помечается В ОДНУ сторону, лист
            адресует ВЕСЬ вход разом, и жест, переписывающий четыре стороны, стоит после жестов,
            переписывающих одну. */}
        {loose.map((picture) => (
          <Bay key={`pic-${picture.id}`}>{looseCell(picture)}</Bay>
        ))}

        {sheets.map((deck) => {
          const { members } = deck;
          const id = deck.sheet.id ?? 0;
          const open = openDeck === id;
          if (!members.length) {
            return <Bay key={`deck-${id}`}>{sheetCell(deck, false)}</Bay>;
          }
          return (
            /* Раскрытая группа — на затемнённом грунте (D-9: «на анколапс бекграунд чуть
               темный»): `groupOf` тонирует ровно тот отсек, что держит лист и его куски. */
            <Bay key={`deck-${id}`} groupOf={open ? id : 0}>
              <CropDeck
                rootId={id}
                count={members.length}
                peeks={members.map((member) => ({
                  id: member.id ?? 0,
                  url: pictureThumb(member),
                  alt: `piece cut from sheet ${id}`,
                }))}
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
                hostDoor
              >
                {sheetCell(deck, open)}
              </CropDeck>
              {open &&
                members.map((member) => (
                  <Fragment key={member.id}>{looseCell(member)}</Fragment>
                ))}
            </Bay>
          );
        })}

        {/* «Пусто» справа от линии — словом, а не голой линией: пустая правая половина под
            линией читалась бы как «полоса недорисована».
            ⚠ СЛОВА ПЕРЕПИСАНЫ ВМЕСТЕ СО СПИСКОМ (B-24). «off the bench» описывало прежнее сужение
            — «рендеры, ещё не стоящие в стороне», — и на карточке с четырьмя занятыми сторонами
            читалось как «рендеров нет», хотя их полдюжины. Список теперь тот же, что в RENDERS OF
            THIS CARD, и пусто он бывает ровно в одном случае: у этого колорвея нет ни одного
            рендера вовсе. */}
        {!loose.length && !sheets.length && !pending.length && (
          <Text
            size='micro'
            variant='inactive'
            component='span'
            className='self-center'
            data-threed-input-empty=''
          >
            {named
              ? `no render of ${named} on this card yet — generate one on FABRIC RENDER, or drop a file into an empty side.`
              : 'no render on this card yet — generate one on FABRIC RENDER, or drop a file into an empty side.'}
          </Text>
        )}
      </Strip>

      {split.modal}

      {/* ОДИН РЕДАКТОР НА ВСЮ ПОЛОСУ, ПО ИМЕНИ ЦЕЛИ (E-3). `slot={null}` — плитка полосы не слот
          верстака: результат правки ложится на карточку обычным рендером и приходит сюда же. */}
      {editingId > 0 &&
        (() => {
          const base = pool.find((picture) => (picture.id ?? 0) === editingId);
          return base ? (
            <VectorModal
              open
              onOpenChange={(next: boolean) => !next && setEditingId(0)}
              techCardId={techCardId ?? 0}
              band={band}
              base={base}
              slot={null}
              disabled={disabled}
            />
          ) : null;
        })()}

      {/* ⚠ ПУСТОЙ ВЕРСТАК (`next: 'render'`) ПОЛОСУ НЕ РИСУЕТ — довод в шапке (F-12). Остальные
          отказы говорят то, чего по ячейкам не прочесть, и остаются со своими дверями.

          ⚠ ПОДАВЛЕНИЕ ОСТАЁТСЯ ТОЧЕЧНЫМ, А ПОВОД ВЕРНУЛСЯ ОСТАЛЬНЫМ. Владелец назвал ОДИН блок —
          жирный `WHAT IS MISSING` плюс простыню «no fabric render stands on this card yet …», то
          есть заголовок и текст ИМЕННО отказа `next: 'render'`. Соседняя волна прочла это как
          «снести повод у полосы вообще» и увела с экрана ЧУЖИЕ отказы: `next: 'refill'` называет
          номера ревизий (r3/r7), которых на экране больше нет НИГДЕ, а `next: 'front-slot'`
          объясняет, почему обязателен именно фронт. Теперь заголовка нет ни у кого (`LockBar` его
          не рисует), повод есть у всех, кроме названного владельцем, — и эта ветка `!== 'render'`
          глушит ровно ту простыню, про которую он и говорил. */}
      {lock && !lock.ok && lock.next !== 'render' && (
        <LockBar reason={lock.reason}>
          {/* ═══ ДВЕРЬ ОТВЕЧАЕТ ИМЕННО ЭТОМУ ОТКАЗУ (J-26) ══════════════════════════════════════
              Отказов у 3D два, и сервер их различает поимённо: `no_fabric_render` («на верстаке
              нет ничего») и `no_front_render` («есть, но не спереди»). Следующий жест у них
              разный — сделать рендер против положить готовый во фронт, — и пара дверей на оба
              случая заставляла бы гадать, какой из двух показали. */}
          {onGoToKind ? (
            <>
              {/* ОДИН ОТКАЗ — ОДНА ДВЕРЬ, И ЭТО НЕ СИМВОЛИЧНО. «Сгенерировать рендер» под отказом
                  «стороны разных ревизий» продавало бы прогон за $-цену там, где нужный жест
                  бесплатен: переложить одну сторону. Пара дверей рисуется РОВНО в одном случае —
                  у карточки нет ни одного рендера вовсе, и тогда путь и правда может начинаться
                  с чертежа. */}
              {/* ═══ ДВЕРЬ ПОЛОСЫ — ТА ЖЕ КНОПКА, ЧТО И ВСЯ ОСТАЛЬНАЯ ПОЛОСА (пункт 14) ══════════
                  Владелец: «сделай полировку импекабл что бы все было ровно все кнопки ровные».

                  Здесь стояли сырые подчёркнутые `<button>` с `Text micro` внутри — единственные
                  органы полосы, написанные мимо примитива: без рамки, без отбивок, со своим
                  фокусным кольцом и без `uppercase`/`tracking-label`. Дверь говорила тем же
                  глаголом, что `split ▸` и `expand ▸` двумя сотнями строк выше, а выглядела
                  ссылкой — один глагол двумя почерками на одном экране.

                  ⚠ `w-full` СЮДА НЕ ПЕРЕЕХАЛ, И ЭТО НЕ НЕДОДЕЛКА. У соседей по полосе он стоит
                  потому, что там родитель — СТОЛБЕЦ ЯЧЕЙКИ фиксированной ширины, и дверь по слову
                  читалась бы в нём второй вещью. Здесь родитель другой — РЯД `LockBar`
                  (`flex flex-wrap items-center gap-2`, `render/generate-row.tsx`), и `w-full` дал
                  бы каждой двери основу во всю ширину, то есть поставил бы их СТОЛБИКОМ, по одной
                  на строку. Ровность тут даёт МЕТРИКА, а не ширина: `secondary` + `xs` — рамка,
                  `px-1.5 py-px`, `text-micro`, капс с `tracking-label`, — высота и отбивки у всех
                  четырёх одни и те же, а `items-center` ряда ставит их на одну линию.

                  ПОДПИСИ ОСТАЛИСЬ СТРОЧНЫМИ В ИСХОДНИКЕ — как `split ▸`, `expand ▸`, `fold ▾` и
                  все прочие: капс вешает `size='xs'`. Написать их заглавными в тексте значило бы
                  завести второе написание того же правила, и разойдётся оно в первый же раз,
                  когда метрика сменится. */}
              {lock.next === 'front-slot' && (
                <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
                  put a render into FRONT ▸
                </Button>
              )}
              {lock.next === 'refill' && (
                <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
                  re-fill the odd sides on FABRIC RENDER ▸
                </Button>
              )}
              {lock.next === 'flat' && (
                <Button variant='secondary' size='xs' onClick={() => onGoToKind('flat')}>
                  generate a flat ▸
                </Button>
              )}
              {(lock.next === 'flat' || !lock.next) && (
                <Button variant='secondary' size='xs' onClick={() => onGoToKind('render')}>
                  generate a render ▸
                </Button>
              )}
            </>
          ) : (
            /* `INERT_DOOR` — как у всех прочих неживых дверей полосы: без него `InertDoor` встаёт
               `inline-flex` по слову и оказывается единственным органом ряда шириной по тексту. */
            <InertDoor
              className={INERT_DOOR}
              label='generate a render ▸'
              reason='the way out is the strip of representations above — FLAT draws the missing side, FABRIC RENDER colours it and puts it into a slot, and 3D turns what stands there'
            />
          )}
        </LockBar>
      )}
    </Section>
  );
}
