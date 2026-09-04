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
  outputsOfKind,
  pictureIsComposite,
  pictureThumb,
  slotOrigin,
  slotOriginLine,
  stripProvenance,
  threedSides,
  type Gate,
} from './model';
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
 * Что вернулось: правая половина — все рендеры этого колорвея, которые в стороны ещё не встали, —
 * тем же органом, что INPUT — FLATS OF THIS CARD: линия, одиночные кадры с `mark ▸`, листы
 * колодами (`expand ▸` / `apply splitted` + `fold ▾`), раскрытая группа на затемнённом грунте.
 * Полоса входа 3D и полоса входа рендера — ОДИН орган под двумя заголовками, и «везде одинаково»
 * теперь верно и для них.
 *
 * ⚠ ПРАВАЯ ПОЛОВИНА СУЖЕНА КОЛОРВЕЕМ ВЕРСТАКА (`outputsOfKind(band, 'render', colorway)`). Кадр
 * чужого колорвея в этот верстак не встаёт (`colorway_mismatch`), и предлагать его значило бы
 * предлагать отказ. Что стоит в ЛЮБОМ слоте карточки (`slotHolding`) — тоже не предлагается: одна
 * плита стоит в одном слоте, сервер отказывает второй постановке наотрез.
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
   * ═══ ПРАВАЯ ПОЛОВИНА — РЕНДЕРЫ ЭТОГО КОЛОРВЕЯ, ЕЩЁ НЕ СТОЯЩИЕ НИ В ОДНОЙ СТОРОНЕ (D-11) ═══════
   *
   * `outputsOfKind` — вся карточка, когда сервер её называет (`outputs`), иначе страница ленты;
   * скрытые выброшены там же. Пул родословной — ВСЕ рендеры колорвея, включая стоящие в слоте:
   * кусок, вырезанный из отредактированного листа, доходит до листа только через правку.
   */
  const outputs = useMemo(() => outputsOfKind(band, 'render', colorway), [band, colorway]);
  const pool = useMemo(() => outputs.map((row) => row.picture), [outputs]);
  const families = useMemo(() => cropFamilies(pool), [pool]);
  const offered = useMemo(
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
  const sheets = useMemo(() => sheetsOf(pool, families, offered), [pool, families, offered]);
  /** Одиночные рендеры: то, что не ушло за свой лист и само не стало листом. Новейшее первым. */
  const loose = useMemo(() => {
    const folded = new Set<number>();
    for (const { sheet, members } of sheets) {
      folded.add(sheet.id ?? 0);
      for (const member of members) folded.add(member.id ?? 0);
    }
    return pool
      .filter((picture) => offered.has(picture.id ?? 0) && !folded.has(picture.id ?? 0))
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
  }, [pool, offered, sheets]);
  const notMarked = loose.length + sheets.reduce((n, { members }) => n + members.length, 0);

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
          !canWrite ? (
            <InertDoor className={INERT_DOOR} label='mark ▸' reason={READ_ONLY_REASON} />
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
      /* Куски без стороны силуэта — детали: применить их некуда, и дверь говорит это словом,
         а не молчит на нажатие (тот же разбор, что у `set` в `render/outputs.tsx`). */
      <InertDoor
        className={INERT_DOOR}
        label='apply splitted'
        reason='nothing in this split names a side of the silhouette — the pieces are details, and a detail has no slot to stand in'
      />
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
           другой, `expand ▸`, и два глагола на одном кадре читаются как один сломанный. */
        onSplit={
          canWrite && composite && !cut
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
                      <span className='flex flex-col gap-0.5 text-labelColor'>
                        <span>{label}</span>
                        <span className='text-textColor'>
                          <b>empty</b>
                        </span>
                      </span>
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
                    <Text size='nano' variant='label' component='span'>
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
            линией читалась бы как «полоса недорисована». */}
        {!loose.length && !sheets.length && (
          <Text
            size='micro'
            variant='inactive'
            component='span'
            className='self-center'
            data-threed-input-empty=''
          >
            {named
              ? `no render of ${named} is off the bench — generate one on FABRIC RENDER, or drop a file into an empty side.`
              : 'no render is off the bench — generate one on FABRIC RENDER, or drop a file into an empty side.'}
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
          отказы говорят то, чего по ячейкам не прочесть, и остаются со своими дверями. */}
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
              {lock.next === 'front-slot' && (
                <button
                  type='button'
                  onClick={() => onGoToKind('render')}
                  className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  <Text size='micro' variant='label' component='span'>
                    put a render into FRONT ▸
                  </Text>
                </button>
              )}
              {lock.next === 'refill' && (
                <button
                  type='button'
                  onClick={() => onGoToKind('render')}
                  className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  <Text size='micro' variant='label' component='span'>
                    re-fill the odd sides on FABRIC RENDER ▸
                  </Text>
                </button>
              )}
              {lock.next === 'flat' && (
                <button
                  type='button'
                  onClick={() => onGoToKind('flat')}
                  className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  <Text size='micro' variant='label' component='span'>
                    generate a flat ▸
                  </Text>
                </button>
              )}
              {(lock.next === 'flat' || !lock.next) && (
                <button
                  type='button'
                  onClick={() => onGoToKind('render')}
                  className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  <Text size='micro' variant='label' component='span'>
                    generate a render ▸
                  </Text>
                </button>
              )}
            </>
          ) : (
            <InertDoor
              label='generate a render ▸'
              reason='the way out is the strip of representations above — FLAT draws the missing side, FABRIC RENDER colours it and puts it into a slot, and 3D turns what stands there'
            />
          )}
        </LockBar>
      )}
    </Section>
  );
}
