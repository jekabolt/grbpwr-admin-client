import type {
  common_AdminColorwayRef,
  common_DesignPicture,
  common_DesignRun,
  GetDesignBandResponse,
} from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import { Button } from 'ui/components/button';
import { mediaFullToViewerItem, mediaFullViewerSrc } from 'ui/components/media-viewer';
import Text from 'ui/components/text';

import {
  COLORWAY_NONE,
  RUN_NOT_STATED,
  benchKindOf,
  colorwayOf,
  refColorwayFor,
  slotHolding,
  type Representation,
} from '../bench-kinds';
import { serverSpeaksDesign } from '../capability';
/* Под другим именем: у экранов студии есть свои `colorwayLabel` (подпись цели). */
import { colorwayLabel as refLabel } from '../colorway-picker';
import type { PickerBranch } from '../core';
import { cropFamilies, isCutOut, offersSplit } from '../generation/composite';
import type { OutputPlan } from '../generation/run-gallery';
import type {
  PictureTileAction,
  PictureTileFlag,
  PictureTileMenu,
  PictureTileMenuItem,
  PictureTileProps,
} from '../picture-tile';
import { useRemovalUndo } from '../bench-slot';
import { useDesignWrites } from '../use-design-band';
import { isPictureHidden } from '../visibility';
import { isActiveView, normaliseViewKey, viewLabel, type ActiveView } from '../views';
import { ApplySplitDoor, type SplitPiece } from './apply-split';
import {
  outputsHorizon,
  outputsOfKind,
  pictureIsComposite,
  threedSides,
  type BenchSide,
} from './model';
import { SAMPLE_LABEL, colourwayColumns, picturesOnSides } from './side-row';
import { StripCell } from './strip-cell';
import { FoldCaret } from 'ui/components/fold-caret';

/**
 * ═══ ONE FABRIC RENDER, WITH THE DOORS THAT PUT IT INTO A SIDE (27.09, O-63 step 1, D-62) ═══════
 *
 * Moved out of `outputs.tsx` (RENDERS OF THIS CARD) without a change of behaviour (step 1), so the
 * render tile and its door rules exist ONCE and any host can draw them: the latest-generation
 * workbench under GENERATE and the rows of GENERATION HISTORY on FABRIC RENDER, its «brought»
 * group among them (`RunTile`, by the kind of its run — steps 2 and 3). Owner, verbatim: «после
 * генерации результат показывать как во флетах те с LATEST GENERATION и GENERATION HISTORY
 * свернут по дефолту и RENDERS OF THIS CARD получается не нужен» — the section went (step 4), its
 * doors did not.
 *
 * WHAT LIVES HERE:
 *   · the door row's metric (`DOOR_ROW`, `DOOR`, F-9) — the 3D shelf's row reads it too;
 *   · the reasons a placement is refused and the notes that print each reason once (D-56′);
 *   · `useRenderDoors` — ONE HOST'S rules: where a plate may stand (`destinationsOf`, O-57 r2–r4),
 *     the two-step targets of `mark ▸`, the pieces and the refusal of `apply splitted`, `unmark ▸`
 *     for a plate in a column SIDES does not draw, the notes of the plates it shows;
 *   · `RenderTile` — the cell and its door row.
 *
 * WHAT STAYS WITH THE HOST: which deck is open (one per host, H-10) and what a zoom does to it
 * (E-4), the editor over a picture, the split window, the viewer row the frame joins. The host
 * hands them in; the tile only says WHEN each is offered.
 */

/**
 * ═══ ЗДЕСЬ СТОЯЛИ ДВА СЕНТИНЕЛА ПЛОСКОГО СПИСКА — `MARK_PROMPT` И `MARK_NEW_COLOURWAY` ═════════
 *
 * Оба были платой за то, что ОДИН селект отвечал на ДВА вопроса: «ничего не выбрано» приходилось
 * называть строкой (Radix запрещает пустое значение пункта), а «завести колорвей» — второй
 * строкой, которую нельзя спутать с парой «верстак:сторона». Вопросы разведены по шагам
 * (`TwoStepPicker`), и оба сентинела стали невыразимы: у двери нет «значения» вовсе, а рождение
 * колорвея — отдельный глагол шага 1, а не пункт того же списка.
 */

/**
 * ═══ ОДНА СЕТКА НА ВЕСЬ РЯД ДВЕРЕЙ — F-9, И ЭТО ЗАМЕР, А НЕ ВКУС ══════════════════════════════
 *
 * Владелец, дословно: «отполируй дизайн импакаблом тк сейчас там все кнопки скачут селекторы
 * болшего размера чем кнопки».
 *
 * ЗАМЕРЕНО ДО ПРАВКИ (`tmp/dsgprobe/k17w1-measure.mjs` над той же сборкой):
 *   · органы ряда стояли трёх разных высот — Pill 19px, Button xs 20px, Radix-триггер 24px
 *     (`min-h-[22px]` + две рамки), то есть селектор был на пятую часть выше соседней кнопки;
 *   · верхние кромки органов разъезжались на 18.5px (1243 против 1261.5), потому что ячейка
 *     листа колоды мерилась по содержимому, а соседние — по растянутому ряду;
 *   · ряд был `flex-wrap`, и селектор шириной 104px в колонке 132px переносил соседа на вторую
 *     строку, меняя высоту ячейки от её содержимого.
 *
 * ЛЕЧИТСЯ ТРЕМЯ ЧИСЛАМИ, А НЕ ПОДБОРОМ. Ряд — коробка ФИКСИРОВАННОЙ высоты в 20px (высота
 * `Button size='xs'`: 16px `leading-4` + 2px паддинга + 2px рамок), органы центрируются по ней, и
 * ровно ОДНА живая дверь на ячейку. Селектор приводится к той же высоте и к тому же кеглю
 * (`text-micro uppercase`), а не остаётся полем ввода: `min-h-0` обязателен — `min-height` и
 * `height` у twMerge разные группы, и без него 22px тихо победили бы 20px.
 *
 * ⚠ МЕТРИКА ЖИВЁТ ЗДЕСЬ, А НЕ В `StripCell`. Тот же примитив несёт ряды других экранов, и там в
 * `action` стоят КОЛОНКИ (кнопка + абзац последствия у `ApplySplitDoor`): фиксированные 20px
 * обрезали бы их молча.
 */
/* ⚠ `min-h-5`, А НЕ `h-5` — И ЭТО ПОЧИНКА БАГА, А НЕ ОСЛАБЛЕНИЕ ЗАМЕРА (r2 п.31). Владелец:
   «APPLY SPLITTED не помещается в кнопку, из-за этого вертикальный скролл в блоке». Механизм:
   полоса выходов объявлена `overflow-x-auto`, а по CSS ось, оставленная `visible` рядом с
   не-`visible`, ВЫЧИСЛЯЕТСЯ в `auto` — то есть любое содержимое выше жёстких 20px делало полосу
   вертикально прокручиваемой. Переносил текст двери (починен `whitespace-nowrap` у самой двери) и
   растил её редкий отчёт об отказе. Высота ряда по-прежнему ОДНА (20px) во всех здоровых
   состояниях — это и есть замер F-9, — но она больше не режет содержимое молча. */
/* ⚠ ЗАЗОР РЯДА — 2px, А НЕ 4px, И ЭТО ЗАМЕР (r2 п.31). В ячейке 132px раскрытая колода держит два
   органа: дверь `apply splitted` и складывающую `▾` (20px). При зазоре 4px коробка двери мерилась
   106px против 107px подписи — то есть подпись вылезала за кнопку ровно на пиксель, и владелец
   видел это как «не помещается». Двух пикселей хватает: 110px против 107px. Поля самой кнопки не
   трогаются — `px-1.5` метрики `size='xs'` едина для всех дверей ряда, и сузить её у одной значило
   бы завести вторую метрику там, где весь смысл ряда в одной. */
/* O-57 r4: СНОВА `items-center`. Круг r3 прижимал ряд к низу (`items-end`): причина погашенной
   двери печаталась в самом ряду, над дверью, и `▾` раскрытой колоды обязана была стоять рядом с
   `apply splitted`, а не посередине абзаца. Причины теперь печатаются один раз, над полосой
   (`REFUSAL_NOTES`), и все органы ряда снова ростом в 20px. */
export const DOOR_ROW = 'flex min-h-5 items-center gap-0.5';
/** ⚠ `bg-bgColor` ЯВНО, А НЕ ПО УМОЛЧАНИЮ. Вторичная кнопка системы — «white fill, 1px edge
 *  border», но БЕЛОГО В НЕЙ НЕТ: она полагается на белую страницу под собой. Над затемнённым
 *  грунтом группы (`Bay`) сквозь неё просвечивал #ededed, и `set` читался залитым — то есть
 *  нажатым или выключенным, — стоя рядом с белыми селекторами. Замерено снимком 2×. */
export const DOOR = 'h-5 w-full bg-bgColor';

/**
 * O-57 r2 · ПОЧЕМУ СЕМПЛ-ПЛИТЕ НЕКУДА ВСТАТЬ — два случая, две причины (`destinationsOf`). Одна
 * строка кода на `title` погашенной `mark ▸`, строку шага 1 её панели и отказ `apply splitted`.
 */
const SAMPLE_UNDRAWN_NO_ADOPTION =
  'the sample bench is not drawn while the card has colourways, and this server cannot adopt a sample render into a colourway';
const EVERY_COLOURWAY_ARCHIVED = 'every colourway on this card is archived — add or revive one';
/**
 * O-57 r3 · ПЛИТА КОЛОРВЕЯ, КОТОРОГО НА КАРТОЧКЕ БОЛЬШЕ НЕТ. Своя ось снесена (`foreign_colorway`),
 * а чужую сервер не даст: N → M он отвергает всегда, усыновляет только плиту семпла. Значит встать
 * ей некуда, и фраза говорит это прямо, а не советует жест, за которым отказ.
 */
const COLOURWAY_GONE =
  "this render's colourway is no longer on the card — a render goes only into its own colourway's sides, so it cannot be placed";
/** Отказ `apply splitted`: ни один кусок разреза не называет стороны силуэта (все — детали). */
const SPLIT_NAMES_NO_SIDE =
  'nothing in this split names a side of the silhouette — the pieces are details, and a detail has no slot to stand in. Cut the sheet again and name front, back or a side on the frames.';

/**
 * ═══ O-57 r4 · ПРИЧИНА ОТКАЗА ПЕЧАТАЕТСЯ ОДИН РАЗ НА ПОЛОСУ, А НЕ У КАЖДОЙ ДВЕРИ ═══════════════
 *
 * Ревью Codex r3 (Medium): r3 печатал причину у каждой погашенной двери и держал каждую в порядке
 * Tab — на полке из десятков рендеров снесённого колорвея это десятки остановок и десятки
 * одинаковых абзацев. Теперь двери — `InertDoor` (вне Tab, причина в `title`), а словами причина
 * стоит ОДИН раз, над полосой, запиской с `role='note'` — единственной остановкой Tab на причину;
 * каждая погашенная дверь ссылается на свою записку `aria-describedby`.
 *
 * `reason` — фраза двери (`title`), она про свою плиту; `note` — фраза записки, она про все плиты с
 * той же причиной, поэтому своя. Порядок записок — порядок этой таблицы, а не появления плит:
 * строки над полосой не переставляются, когда в ней что-то раскрыли или перечитали.
 *
 * В таблице — ТОЛЬКО отказы ПОСТАНОВКИ: почему эту плиту некуда положить. Отказы, общие для всех
 * дверей экрана (карточка только для чтения, сервер молчит), записок не заводят и стоят в `title`,
 * как у всякой погашенной двери студии.
 *
 * ONCE PER STEP, NOT PER HOST (27.09, O-63 r2, D-72 п.5). Since O-63 a step has two hosts of these
 * doors — the workbench under GENERATE and the open history — and each printed the reasons of its
 * own plates: a reason both showed stood twice, twice in the Tab order. The step keeps one board
 * (`RenderStepScope`) where every mounted host lists the reasons it shows; a reason is printed by
 * the FIRST host in the step's order that shows it (`order`: the workbench 0, the history 1) and
 * only there, and every door refused for it — in any host — points at that one note. A folded
 * history lists nothing: its rows draw no plates.
 */
const REFUSAL_NOTES: readonly { key: string; reason: string; note: string }[] = [
  {
    key: 'sample',
    reason: SAMPLE_UNDRAWN_NO_ADOPTION,
    note: 'sample renders beside colourways cannot be placed on this server: the sample bench is not drawn while the card has colourways, and this server cannot adopt a sample render into a colourway',
  },
  {
    key: 'archived',
    reason: EVERY_COLOURWAY_ARCHIVED,
    note: 'sample renders have no live colourway to go into: every colourway on this card is archived, add or revive one',
  },
  {
    key: 'gone',
    reason: COLOURWAY_GONE,
    note: "renders of a colourway no longer on the card cannot be placed: a render goes only into its own colourway's sides",
  },
  {
    key: 'details',
    reason: SPLIT_NAMES_NO_SIDE,
    note: 'nothing in the open split names a side of the silhouette: its pieces are details, and a detail has no slot to stand in. Cut the sheet again and name front, back or a side on the frames.',
  },
];

/** A stable «no colourways» for hosts that pass none (`colourwayColumns` takes a mutable list). */
const NO_COLOURWAYS: common_AdminColorwayRef[] = [];

/** One host's render doors — the rules and the writes every tile of the host draws from. */
export type RenderDoors = {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled: boolean;
  /** Карточка только читается или сервер молчит — ни одна дверь не пишет. */
  writesOff: boolean;
  adopts: boolean;
  onCreateColorway?: (then?: (colorwayId: number) => void) => void;
  /** Для какой плитки хозяина идёт запись слота (`null` — ни для какой). */
  marking: number | null;
  /** Колоды хозяина: лист → его куски (пусто — колоды нет). */
  membersOf: ReadonlyMap<number, common_DesignPicture[]>;
  /** Единственная открытая колода хозяина (H-10). */
  openDeck: number | null;
  colourwayName: (id: number) => string;
  destinationsOf: (own: number) => { ids: number[]; refusal: string | null };
  createsColourwayFor: (picture: common_DesignPicture) => boolean;
  markRefusal: (picture: common_DesignPicture) => string | null;
  markBranches: (picture: common_DesignPicture) => PickerBranch[];
  markInto: (picture: common_DesignPicture, target: number, view: string) => void;
  unmarkHeld: (picture: common_DesignPicture, colorwayId: number, side: BenchSide) => void;
  heldAway: (
    picture: common_DesignPicture,
  ) => { colorwayId: number; side: BenchSide; where: string } | null;
  /** T17: the side a plate stands in, whatever column it is — where its ✕ empties (`null` — free). */
  heldAt: (
    picture: common_DesignPicture,
  ) => { colorwayId: number; side: BenchSide; where: string } | null;
  piecesOf: (rootId: number) => SplitPiece[];
  /** How many pieces were cut from a sheet — its whole split, wherever each piece stands (O-63 r2). */
  piecesCut: (rootId: number) => number;
  applyRefusalFor: (rootId: number) => string | null;
  /** Горизонт колорвея ОДНОЙ плитки — только у принесённой, прочитанной из списка `outputs`. */
  horizonOf: (picture: common_DesignPicture) => { total: number; carried: number } | null;
  /**
   * The notes THIS host prints — one per reason (O-57 r4), and only the reasons no earlier host of
   * the step prints already (O-63 r2, D-72 п.5).
   */
  notes: readonly { key: string; reason: string; note: string }[];
  /** The prefix of every note's id — the step's, so a door of any host names the printed note. */
  noteBase: string;
  noteIdOf: (reason: string | null) => string | undefined;
};

/**
 * ═══ THE STEP'S BOARD OF REFUSAL NOTES (27.09, O-63 r2, D-72 п.5) ═══════════════════════════════
 *
 * Which reasons each mounted host shows, and its place in the step's order. A store outside React:
 * the hosts sit in different blocks of the step (the workbench in FABRIC RENDER, the history below
 * SIDES) and neither renders the other, so the question «is this reason printed already» has no
 * common parent state to live in. A host lists its reasons in a layout effect — the list settles
 * before the frame is painted, so a note never shows twice for one frame — and takes itself off
 * when it unmounts.
 */
type NoteBoard = {
  /** The prefix of every note id on the step. */
  base: string;
  subscribe: (listener: () => void) => () => void;
  list: (host: string, order: number, keys: string) => void;
  drop: (host: string) => void;
  /** The host that prints this reason: the first in the step's order among those showing it. */
  printer: (key: string) => string | null;
};

function noteBoard(base: string): NoteBoard {
  const hosts = new Map<string, { order: number; keys: readonly string[] }>();
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  return {
    base,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    list: (host, order, keys) => {
      const was = hosts.get(host);
      if (was && was.order === order && was.keys.join(',') === keys) return;
      hosts.set(host, { order, keys: keys ? keys.split(',') : [] });
      changed();
    },
    drop: (host) => {
      if (hosts.delete(host)) changed();
    },
    printer: (key) => {
      let first: { host: string; order: number } | null = null;
      for (const [host, { order, keys }] of hosts) {
        if (!keys.includes(key)) continue;
        // One order per host in practice; the id breaks a tie so the answer never depends on
        // the order the hosts happened to mount in.
        if (!first || order < first.order || (order === first.order && host < first.host))
          first = { host, order };
      }
      return first?.host ?? null;
    },
  };
}

const NoteBoardContext = createContext<NoteBoard | null>(null);

/**
 * ═══ THE RULES OF ONE HOST — HOOKS OF THE HOST, CALLED ONCE PER HOST ═════════════════════════════
 *
 * «Host» is whatever draws one strip of these tiles and holds its one open deck. Everything here
 * reads the WHOLE host — the axis of colourways, the notes over every plate it shows (pieces of a
 * folded deck included), the one write in flight — so it is a hook of the host, never of a tile.
 */
export function useRenderDoors({
  band,
  techCardId,
  disabled,
  colorways = NO_COLOURWAYS,
  cardColorways,
  adopts = false,
  onCreateColorway,
  pictures,
  membersOf,
  wholeDecks,
  openDeck,
  order = 0,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /**
   * Колорвеи карточки в её порядке (список хозяина, суженный) — из них строятся цели `mark ▸` и
   * `apply splitted`. Стоит ли при этом ось `sample`, решает не он, а сырой список (`cardColorways`,
   * D-56″): пустой суженный список при архивных колорвеях карточки — это не «колорвеев нет».
   */
  colorways?: common_AdminColorwayRef[];
  /**
   * O-57 r4 · КОЛОРВЕИ КАРТОЧКИ КАК ЕСТЬ — сырой `techCard.colorways` от хозяина
   * (`useColorwayChoice().cardColorways` через экран): архивные без плит тоже, в отличие от
   * `colorways`. Нужен одному вопросу — членству плиты (разбор у `onCard` ниже). `undefined` — «не
   * сказано» (карточка не прочитана, хозяин без оси), и по членству тогда не отказывают.
   */
  cardColorways?: readonly common_AdminColorwayRef[];
  /**
   * ФЛАГ СЕРВЕРА: усыновляет ли верстак семпл-плиту (B7) — вызывающий передаёт СРАВНЕНИЕ
   * (`band.benchAdoptsUnattributed === true`), а не само поле: молчание бинаря — «не сказано».
   */
  adopts?: boolean;
  /**
   * Открыть поповер рождения колорвея. `then` зовётся с id созданного — жест продолжается в новый
   * столбец, не начинаясь заново.
   */
  onCreateColorway?: (then?: (colorwayId: number) => void) => void;
  /** Every plate the host shows — pieces of folded decks too (the notes read them all). */
  pictures: readonly common_DesignPicture[];
  /** The host's decks: sheet id → the pieces cut out of it. */
  membersOf: ReadonlyMap<number, common_DesignPicture[]>;
  /**
   * THE WHOLE SPLIT of a sheet whose deck this host draws only in part (O-63 r2): the «brought»
   * group leaves out the pieces SIDES shows, and `apply splitted` still puts the WHOLE split into
   * the sides (`piecesOf`). Absent for a sheet — its deck here is its whole split. Keyed by the
   * group's CARDS (O-63 r3, `broughtGroup`): a card is not always its family's root — the root may
   * stand on SIDES — and its whole split is every descendant of it the band carries.
   */
  wholeDecks?: ReadonlyMap<number, common_DesignPicture[]>;
  /** The host's one open deck (H-10). */
  openDeck: number | null;
  /** The host's place in the step's order — of two hosts showing one reason, the earlier prints it. */
  order?: number;
}): RenderDoors {
  const speaks = serverSpeaksDesign();
  const { setBenchSlot } = useDesignWrites(techCardId);
  /* T49 · a render taken off a side keeps an `undo` on that SIDES cell until the page reloads. */
  const removals = useRemovalUndo(techCardId);
  /** Для какой плитки идёт запись слота. Общий `isPending` сказал бы «saving» на всех сразу. */
  const [marking, setMarking] = useState<number | null>(null);
  /**
   * ═══ ЗДЕСЬ СТОЯЛ `markScope`, И ОН СНЯТ ЦЕЛИКОМ (r3-w2 №5) ═══════════════════════════════════
   *
   * ЧТО ОН ДЕЛАЛ. Пункт `+ colourway…` отвечает на «в какой столбец», а не на «в какую сторону»:
   * столбца ещё нет. После успеха дверь ТОЙ ЖЕ плитки сужалась до нового колорвея — на лице его
   * имя, в списке только его стороны, — и второе нажатие доканчивало жест.
   *
   * ПОЧЕМУ СНЯТ. Сужение снималось ТОЛЬКО постановкой или сменой карточки — выхода назад к полному
   * списку не было вовсе. Передумал после рождения цвета — и дверь этой плитки заперта на нём;
   * снесли этот колорвей — и на лице остаётся `#id ▸` над шестью пустыми сторонами, потому что
   * имени по снесённому id уже не прочитать. Ради корректности оно не нужно: `onCreateColorway`
   * резолвится ПОСЛЕ `await invalidateQueries` (`colourway-create.tsx`), то есть к моменту
   * возврата новый столбец уже в `axis`, и полный список сам предлагает `NEW › front …`.
   *
   * ЧЕМ ЖЕСТ КОНЧАЕТСЯ ТЕПЕРЬ: НИЧЕМ ДОПОЛНИТЕЛЬНЫМ — он доигрывается сам (r3d). Прежняя редакция
   * стоила одного лишнего нажатия по чисто механической причине: доокрыть Radix-селект программно
   * нельзя, открытость держит `ui/components/select` внутри себя. Дверь стала поповером, чья
   * открытость — обычное состояние, и продолжение снова стало бесплатным: столбец родился, панель
   * открылась сама и сразу на его сторонах. Запертого состояния при этом НЕ вернулось, и это
   * главное отличие от `markScope`: лицо двери по-прежнему одно (`mark ▸`), а строка-«назад»
   * отдаёт полный список столбцов в любую секунду.
   */

  /**
   * ═══ ДВЕРЬ РАСКРЫТОЙ КОЛОДЫ БОЛЬШЕ НЕ ДЕРЖИТ СВОЕГО СОСТОЯНИЯ (F-7 → Ф4) ═════════════════════
   *
   * Здесь стояли `applyingRoot` / `askingRoot` / `applyFailed` — занятость, вопрос и отчёт
   * ТРЕТЬЕГО написания глагола `set`. Теперь дверь — `ApplySplitDoor` из `./apply-split` (её
   * единственный хозяин — эта колода: полосы входа свои двери постановки потеряли на круге r2,
   * п.29/30); занятость, вопрос и отчёт живут в нём. Отчёт при этом
   * по-прежнему «носит имя своей колоды»: дверь смонтирована ВНУТРИ раскрытой колоды и уходит
   * вместе с ней — то самое правило «строка отчёта, севшая на чужую строку, не путает её, а
   * СТИРАЕТ», только теперь оно держится монтированием, а не ключом `root`.
   */

  /**
   * ═══ ОСЬ КОЛОРВЕЕВ — ТА ЖЕ, ЧТО СТОЛБЦЫ SIDES, И ОДНИМ ОПРЕДЕЛЕНИЕМ ══════════════════════════
   *
   * Пункты `mark ▸` и цели `apply splitted` обязаны совпадать со столбцами таблицы над этим
   * разделом: человек кладёт плиту «в ROSSO», глядя на столбец ROSSO. Порядок и состав считает
   * `colourwayColumns` (`./side-row`) — второе написание правила «архивный только с плитами»
   * разошлось бы с первым в первый же день.
   *
   * «Цели прогона» этот раздел не знает и знать не должен — и ось её больше не спрашивает: по
   * O-57 (D-56″) столбец `sample` стоит РОВНО тогда, когда у карточки нет ни одного колорвея,
   * архивные тоже считаются (поэтому ось получает и сырой список, `cardColorways`), с плитами и
   * без. Как только колорвей у карточки есть, оси 0 нет и в этих дверях: «в sample» ни `mark ▸`,
   * ни `apply splitted` не предлагают — столбца на экране нет. Семпл-плиты при этом остаются в
   * данных и в ряду ниже; куда они встают рядом с колорвеями — у `destinationsOf`, а как снимается
   * стоящая в невидимом слоте — у `heldAway`.
   */
  const axis = useMemo(
    () => colourwayColumns(band, colorways, cardColorways),
    [band, colorways, cardColorways],
  );

  /**
   * ═══ O-57 r3 · ЧЛЕНСТВО В СЫРОМ СПИСКЕ КАРТОЧКИ — ОТДЕЛЬНО ОТ ОСИ ═══════════════════════════
   *
   * Ось рисует живые колорвеи и архивные С ПЛИТАМИ. Двух других она не различает, а у них
   * противоположные двери (ревью Codex r2, High): архивный колорвей БЕЗ плит стоит на карточке —
   * плиту в него класть законно, и его столбец от этого появится; колорвей, СНЕСЁННЫЙ с карточки,
   * сервер не примет (`foreign_colorway`), и запись либо откажет, либо запрёт плиту в невидимом
   * верстаке. Поэтому членство читается у сырого списка карточки (`cardColorways`), а не выводится
   * из оси и не из пропа `colorways`, который хозяин уже сузил. Список не сказан (карточка ещё не
   * прочитана) — дверь стоит как до r3: отказывать по незнанию хуже, чем подождать ответа.
   *
   * ⚠ СПИСОК ПРИХОДИТ ПРОПОМ, А НЕ ЧИТАЕТСЯ ЗДЕСЬ (O-57 r4, ревью Codex r3, Low). В r3 раздел звал
   * `useTechCard` сам — второй наблюдатель того же запроса, и на 3D, где членство не спрашивается
   * вовсе, и у раздела, который тут же возвращает `null`; смонтированный после пяти минут, он
   * перечитывал карточку фоном. Карточку в студии читает один хук (`useColorwayChoice`), и список
   * едет от него. Поиск — по карте id → колорвей, а не проходом по списку на каждую плитку.
   */
  const cardRefs = useMemo(
    () =>
      cardColorways === undefined
        ? null
        : new Map(cardColorways.map((c) => [c.colorwayId ?? 0, c] as const)),
    [cardColorways],
  );
  const onCard = (id: number): boolean => cardRefs === null || cardRefs.has(id);

  /** Имя столбца; у колорвея карточки без столбца (архивный пустой) — его имя с карточки, а не `#8`. */
  const colourwayName = (id: number): string => {
    if (id === COLORWAY_NONE) return SAMPLE_LABEL;
    const drawn = axis.find((c) => c.colorwayId === id);
    if (drawn) return drawn.label;
    const ref = cardRefs?.get(id);
    return ref ? refLabel(ref) : `#${id}`;
  };
  /**
   * THE HOST ON THE STEP'S BOARD OF NOTES (O-63 r2, D-72 п.5): its own key, and a re-render whenever
   * any host's list changes — the notes this host prints depend on what the others show.
   * ⚠ SUBSCRIBED IN A LAYOUT EFFECT, NOT THROUGH `useSyncExternalStore`: that hook subscribes after
   * the paint, and two hosts mounting in one commit would both print a shared reason for a frame.
   * Here the subscription stands before this host lists its own reasons (the effect below), and a
   * change heard in the layout phase re-renders before the frame is painted.
   */
  const board = useContext(NoteBoardContext);
  const hostKey = useId();
  const [, heard] = useState(0);
  useLayoutEffect(() => board?.subscribe(() => heard((n) => n + 1)), [board]);
  /** Лист по id — дверь `apply splitted` спрашивает его колорвей. */
  const pictureById = useMemo(() => {
    const m = new Map<number, common_DesignPicture>();
    for (const picture of pictures) if (picture.id != null) m.set(picture.id, picture);
    return m;
  }, [pictures]);

  /**
   * ═══ O-57 r2/r3 · КУДА ВСТАЁТ ПЛИТА — ОДИН ОТВЕТ НА ДВЕ ДВЕРИ (`mark ▸`, `apply splitted`) ════
   *
   * Плита колорвея N — только в N: N→M и N→0 сервер отвергает (`colorway_mismatch`) даже с флагом
   * B7. И в N — только пока N есть: его столбец нарисован ИЛИ он стоит в сыром списке карточки
   * (`onCard`, r3). Снесённый N — целей нет, и дверь стоит погашенной со своей причиной
   * (`COLOURWAY_GONE`). Семпл-плита (0) — по тому, рисует ли таблица столбец `sample`:
   *   · рисует (у карточки нет ни одного колорвея, D-56″) — как до O-57: её собственная ось;
   *   · не рисует, при `adopts` — ЖИВЫЕ столбцы колорвеев: сервер усыновит плиту (B7), а архивный
   *     столбец в усыновление не предлагается — этим цветом больше не работают. Живых нет (все
   *     столбцы архивные, с плитами, — или столбцов нет вовсе: одни архивные без плит, D-56″) —
   *     целей нет, и причина названа; `+ colourway…` у `mark ▸` остаётся, новый колорвей и есть
   *     выход;
   *   · не рисует, без `adopts` (старый бинарь; молчание о флаге — «не сказано», доктрина
   *     `has_fabric_render`) — ЦЕЛИ НЕТ. Своя ось на экране не видна, чужую сервер не примет, и
   *     дверь стоит погашенной со своей причиной. Молча писать «в sample» значило бы класть плиту
   *     в верстак, которого человек не видит и не может очистить (ревью Codex, Medium 1).
   */
  const sampleDrawn = axis.some((c) => c.colorwayId === COLORWAY_NONE);
  const destinationsOf = (own: number): { ids: number[]; refusal: string | null } => {
    if (own !== COLORWAY_NONE) {
      const standing = axis.some((c) => c.colorwayId === own) || onCard(own);
      return standing ? { ids: [own], refusal: null } : { ids: [], refusal: COLOURWAY_GONE };
    }
    if (sampleDrawn) return { ids: [COLORWAY_NONE], refusal: null };
    if (!adopts) return { ids: [], refusal: SAMPLE_UNDRAWN_NO_ADOPTION };
    const live = axis.filter((c) => !c.archived).map((c) => c.colorwayId);
    return live.length
      ? { ids: live, refusal: null }
      : { ids: [], refusal: EVERY_COLOURWAY_ARCHIVED };
  };

  /**
   * O-57 r4 · ПОГАШЕНА ЛИ ДВЕРЬ `mark ▸` СВОБОДНОЙ ПЛИТЫ — И ПОЧЕМУ. Погашена ровно тогда, когда
   * встать некуда (`destinationsOf`) и завести колорвей отсюда нельзя: `+ colourway…` — тоже выбор,
   * и с ним дверь жива, а причина стоит на шаге 1 её панели. Один ответ на три места: саму дверь,
   * записки над полосой и связь между ними.
   *
   * Рождение колорвея предлагается ровно там же, где усыновление: без флага семпл-плита в новый
   * столбец не встанет, и строка вела бы к колорвею, которым нечего наполнить отсюда.
   */
  const createsColourwayFor = (picture: common_DesignPicture): boolean =>
    !!onCreateColorway && colorwayOf(picture) === COLORWAY_NONE && adopts;
  const markRefusal = (picture: common_DesignPicture): string | null => {
    const { ids, refusal } = destinationsOf(colorwayOf(picture));
    if (ids.length || createsColourwayFor(picture)) return null;
    return refusal ?? 'this render has no side to go into';
  };

  /**
   * ═══ КУСКИ РАЗРЕЗА, ПРИВЯЗАННЫЕ К СТОРОНАМ, — ВХОД `applyPlan` (F-7) ══════════════════════
   *
   * Берутся из `membersOf` хозяина, то есть из ТОГО ЖЕ списка, который экран и показывает
   * раскрытым. Второй источник — общекарточный список листов этого рода — отвечал бы на соседний
   * вопрос («какие листы вообще есть») и разошёлся бы с тем, что человек видит, ровно в тех
   * случаях, ради которых дверь и нужна. Такой список в `apply-split.tsx` жил (`splitDecks`) и
   * снесён вместе с этим доводом: читателя у него так и не появилось.
   *
   * Первый кусок на сторону: разрез — один на лист, а кусок без стороны силуэта (`detail`, пустой
   * вид) в слот не встаёт и в план не входит.
   *
   * O-63 r2 (D-72 п.1) · …КРОМЕ КОЛОДЫ, КОТОРУЮ ХОЗЯИН ПОКАЗЫВАЕТ НЕ ЦЕЛИКОМ. Группа «brought»
   * решает членство по каждой картинке: кусок, который SIDES уже показывает, стоит там со своим ✕,
   * а не в колоде листа. Но `apply splitted` — «вход становится РОВНО этим разрезом»
   * (`./apply-split`), и разрез — это все его куски: читая одни показанные, дверь ОЧИЩАЛА бы
   * сторону, где стоит кусок того же разреза, и вопрос называл бы её «the split does not name that
   * side» — неправдой. Поэтому для такой колоды куски берутся из разреза целиком (`wholeDecks`), а
   * кусок, уже стоящий в своей стороне, план не трогает вовсе (`applyPlan`).
   *
   * Скрытый кусок (старый штамп `hidden`) в план не входит: в слот его сервер не поставит
   * (`hidden_plate`), и запись за ним была бы отказом.
   */
  const piecesOf = (rootId: number): SplitPiece[] => {
    const seen = new Set<string>();
    const out: SplitPiece[] = [];
    for (const member of wholeDecks?.get(rootId) ?? membersOf.get(rootId) ?? []) {
      if (isPictureHidden(member)) continue;
      const view = normaliseViewKey(member.ghostView);
      // A piece cut as a retired three-quarter (D-18) goes into no slot: the bench no longer has one.
      if (!isActiveView(view) || seen.has(view)) continue;
      seen.add(view);
      out.push({ view: view as ActiveView, picture: member });
    }
    return out;
  };

  const writesOff = !!disabled || !speaks;

  /**
   * ═══ ПОСТАВИТЬ РЕНДЕР В СТОРОНУ — ПРЯМО ОТСЮДА (J-25) ═══════════════════════════════════════
   *
   * Владелец: слоты фабрик-рендера «можно заполнять в разделе RENDERS OF THIS CARD».
   *
   * ⚠ АДРЕСУЕТСЯ ВЕРСТАК, НАЗВАННЫЙ В САМОМ ПУНКТЕ, И ЭТО НЕ ОСТОРОЖНОСТЬ. Колорвей входит в
   * ключ исключительности слота, а сервер сверяет колорвей ПЛИТЫ с колорвеем СЛОТА и отвергает
   * несовпадение (`colorway_mismatch`) — В ОБЕ СТОРОНЫ, кроме одного случая: семпл-плита (0) в
   * слот колорвея N, где сервер с флагом `bench_adopts_unattributed` УСЫНОВЛЯЕТ её, переписав
   * `colorway_id` 0 → N в той же транзакции (B7). Поэтому пункты чужих столбцов рисуются ровно
   * при `adopts` и ровно у семпл-плиты; у плиты цвета цель одна — её собственный столбец.
   *
   * ⚠ CAS-ТОКЕН БЕРЁТСЯ С ТОГО ЖЕ ВЕРСТАКА, ЧТО И АДРЕС. Полоса читается целиком
   * (`bench_colorway_id: 0`, довод в `use-design-band.ts`), поэтому строка чужого колорвея у
   * клиента на руках есть и второго круга запроса не нужно.
   */
  const markInto = (picture: common_DesignPicture, target: number, view: string) => {
    const pictureId = picture.id ?? 0;
    if (pictureId <= 0) return;
    const bench = refColorwayFor('render', target);
    const side = threedSides(band, bench).find((s) => s.view === view);
    if (!side) return;
    setMarking(pictureId);
    setBenchSlot.mutate(
      // `kind: 'render'` — КАКОЙ ВЕРСТАК, а не какой слот. Рендер-фронт и флэт-фронт — два разных
      // слота, ОБА адресуемые `view_key: 'front'`; пустое поле читается сервером как flat, и плита
      // уехала бы в чужой верстак, где её отвергли бы по роду кадра (`wrong_kind`).
      {
        /* ⚠ БЕЗ `slotId`: он в одном `oneof` с `viewKey`, и ноль там — заданное поле, от
           которого сервер отвергал запись целиком. */
        slot: { viewKey: view, kind: 'render', colorwayId: bench },
        pictureId,
        expectedSlotRev: side.slotRev,
      },
      { onSettled: () => setMarking(null) },
    );
  };

  /**
   * ═══ O-57 r2 · СНЯТЬ ПЛИТУ СО СТОРОНЫ, КОТОРОЙ SIDES НЕ РИСУЕТ ════════════════════════════════
   *
   * Плита, стоящая в слоте, снимается ✕ на ней же в таблице SIDES. У столбца, которого таблица не
   * рисует (`sample` рядом с колорвеями), ✕ нет, а сервер не поставит стоящую плиту никуда больше
   * (`ErrDesignPictureAlreadyInSlot`) — без этой двери она заперта в невидимом слоте (ревью Codex,
   * High 3). Запись ТА ЖЕ, что у ✕ (`unmark` в `./side-row`): `SetDesignBenchSlot`,
   * `picture_id = 0` — освободить, ничего не удаляя; род `render`; колорвей слота; CAS — ревизия
   * ЭТОЙ стороны.
   */
  const unmarkHeld = (picture: common_DesignPicture, colorwayId: number, side: BenchSide) => {
    const pictureId = picture.id ?? 0;
    if (pictureId <= 0) return;
    setMarking(pictureId);
    /* ⚠ БЕЗ `slotId` — он в одном `oneof` с `viewKey`, как у всех писателей верстака. */
    const slot = {
      viewKey: side.view,
      kind: 'render',
      colorwayId: refColorwayFor('render', colorwayId),
    };
    setBenchSlot.mutate(
      { slot, pictureId: 0, expectedSlotRev: side.slotRev },
      {
        onSettled: () => setMarking(null),
        onSuccess: () => removals.remember(slot, 'render', side.view, pictureId),
      },
    );
  };

  /**
   * ГДЕ СТОИТ ПЛИТА, ЕСЛИ ЕЁ СТОЛБЦА SIDES НЕ РИСУЕТ: колорвей слота и сторона с CAS-токеном.
   * `null` — плита свободна, её столбец на экране (тогда дверь — ✕ в таблице) или она стоит в
   * снятом виде 3/4 (у тех своя дверь — ряд «legacy views» под таблицей, для всех колорвеев).
   * Сторона ищется на верстаке колорвея САМОЙ плиты: сервер ставит плиту только в слот её
   * колорвея (и переписывает колорвей при усыновлении), так что это и есть слот, где она стоит.
   */
  const heldAway = (picture: common_DesignPicture) => {
    if (axis.some((c) => c.colorwayId === colorwayOf(picture))) return null;
    return heldAt(picture);
  };
  /**
   * T17 · ГДЕ СТОИТ ПЛИТА — В ЛЮБОМ СТОЛБЦЕ. ✕ на плитке снимает её отовсюду, как у FLAT; у
   * столбца, который SIDES рисует, ✕ на плите таблицы остаётся вторым входом в тот же жест.
   */
  const heldAt = (picture: common_DesignPicture) => {
    const pictureId = picture.id ?? 0;
    if (pictureId <= 0) return null;
    const colorwayId = colorwayOf(picture);
    const side = threedSides(band, refColorwayFor('render', colorwayId)).find(
      (s) => (s.picture?.id ?? 0) === pictureId,
    );
    if (!side) return null;
    return { colorwayId, side, where: `${colourwayName(colorwayId)} · ${viewLabel(side.view)}` };
  };

  /**
   * ═══ КУДА ЭТА ПЛИТА МОЖЕТ ВСТАТЬ — ВЕТКАМИ, А НЕ ОДНИМ ПЛОСКИМ СПИСКОМ ════════════════════════
   *
   * Владелец по бете, дословно: «надо спросить колорвей сначала, потом уже сторону — сейчас в
   * пикере очень много всего и это не читается вообще». Здесь считаются РОВНО ТЕ ЖЕ цели, что и
   * прежде; изменилась их ФОРМА: ветка на столбец, лист на сторону. Плоский список повторял имя
   * столбца шесть раз подряд и ставил сторону — то, ради чего список открыли, — третьим словом
   * строки; при двух колорвеях в нём стояло девятнадцать пунктов.
   *
   * ТРИ ПРАВИЛА СОСТАВА, И КАЖДОЕ — ЗЕРКАЛО СЕРВЕРА, А НЕ ВКУС (считает их `destinationsOf`):
   *   · плита колорвея N предлагает ТОЛЬКО стороны N. N→M и N→0 сервер отвергает
   *     (`colorway_mismatch`) даже с флагом B7 — предлагать их значило бы рисовать дверь, за
   *     которой отказ. Ветка при этом одна, и шага «выбери столбец» не существует вовсе: жест
   *     остаётся ровно таким, каким был до этой правки. Снесённого с карточки N нет и среди
   *     веток (r3): веток ноль, и дверь стоит погашенной с причиной;
   *   · семпл-плита (0) предлагает свою ось, пока таблица рисует столбец `sample` (у карточки нет
   *     колорвеев), — как до O-57. Рядом с колорвеями её оси на экране нет: при `adopts` ветки —
   *     живые столбцы колорвеев (усыновление, B7); все столбцы архивные — веток нет, остаётся
   *     `+ colourway…`, и шаг 1 говорит почему; без `adopts` веток нет ВОВСЕ, и дверь стоит
   *     погашенной с причиной (`emptyReason`) — ни одной записи в верстак, которого не видно;
   *   · архивный столбец в усыновление не предлагается: этим цветом больше не работают. Своя
   *     собственная ось плиты при этом остаётся всегда — иначе у плиты архивного колорвея не
   *     осталось бы НИ ОДНОЙ ветки, и дверь вела бы в пустоту.
   *
   * ⚠ ЗАНЯТАЯ СТОРОНА НАЗЫВАЕТ СЕБЯ ЗАНЯТОЙ. Лист без пометки писал бы «front» и молча ВЫТЕСНЯЛ
   * плиту, которая там стоит: запись идёт CAS-токеном ИМЕННО той строки, поэтому она проходит.
   * Замена законна и обратима — она просто перестаёт быть немой.
   *
   * `2/6` У ВЕТКИ — ЭТО ОТВЕТ НА ВОПРОС ШАГА 1, А НЕ УКРАШЕНИЕ: «в какой столбец» человек решает
   * по тому, чего в столбце не хватает. Число читается из ТОГО ЖЕ `threedSides`, из которого
   * собраны листья, — второго счёта занятости рядом не заводится.
   */
  const markBranches = (picture: common_DesignPicture): PickerBranch[] => {
    const { ids } = destinationsOf(colorwayOf(picture));
    return ids.map((id) => {
      const name = colourwayName(id);
      const sides = threedSides(band, refColorwayFor('render', id));
      const filled = sides.filter((s) => (s.picture?.id ?? 0) > 0).length;
      return {
        id,
        label: name,
        note: `${filled}/${sides.length}`,
        title: `${name} holds a render in ${filled} of its ${sides.length} sides`,
        leaves: sides.map((side) => {
          const heldId = side.picture?.id ?? 0;
          const face = viewLabel(side.view);
          return {
            value: side.view,
            label: face,
            note: heldId > 0 ? `replaces #${heldId}` : undefined,
            title:
              heldId > 0
                ? `#${heldId} stands in ${face} of ${name} — marking this render takes its place`
                : undefined,
          };
        }),
      };
    });
  };

  /**
   * ═══ «APPLY SPLITTED» — ВХОД РЕНДЕРА СТАНОВИТСЯ РОВНО ЭТИМ РАЗРЕЗОМ (F-7 → Ф4) ═════════════
   *
   * Владелец, дословно: «когда заэкспанжено кнопка set которая будет чистить текущие FABRIC
   * RENDER SLOTS и ставить те что в сплите». Глагол при этом был ТРЕТЬИМ написанием одного
   * жеста — `set` здесь против «apply splitted» на двух полосах входа, со своей модалкой и своим
   * отчётом. Контракт §F: «два слова `apply splitted`/`set` (остаётся одно)». Остался общий орган:
   * дверь, вопрос, запись и отчёт — `ApplySplitDoor` из `./apply-split`; здесь считаются только
   * АДРЕС верстака и ДВА ОТКАЗА, которых у полос входа нет по построению.
   *
   * Правила записи живут там же и не повторяются: три правила плана (названную сторону ЗАНЯТЬ,
   * неназванную занятую ОЧИСТИТЬ, неназванную пустую НЕ ТРОГАТЬ), `slot_rev` как CAS без «снять
   * потом положить», `viewKey` без `slotId` (члены одного `oneof`), `kind` всегда спеллится, отказ
   * одной стороны не останавливает остальные.
   *
   * ═══ АДРЕСУЕТСЯ ВЕРСТАК ЛИСТА, А ЕСЛИ ЦЕЛЕЙ НЕСКОЛЬКО — ТА, ЧТО ВЫБРАЛИ В САМОЙ ДВЕРИ (r3) ══
   *
   * Здесь стоял верстак СЕКЦИИ, потому что секция была сужена одним колорвеем. Сужения больше нет
   * (D5), и «верстак секции» перестал существовать как факт — вместе с ним ушёл отказ «this
   * section is not narrowed to a colourway»: он назывался ОТСУТСТВИЕМ выбора там, где выбор
   * теперь делается в самой двери.
   *
   * ПРАВИЛО ЦЕЛИ — ТО ЖЕ, ЧТО У ВЕТОК `mark ▸` (`destinationsOf`, O-57 r2):
   *   · лист колорвея N → в N, без вопроса. Он и не может встать никуда больше: сервер сверяет
   *     колорвей плиты с колорвеем слота, и N→M отвергается даже с флагом B7. Если N с карточки
   *     снесён (r3), встать некуда вовсе — это ОТКАЗ с причиной;
   *   · семпл-лист на карточке без колорвеев (столбец `sample` нарисован) → в `sample`, молча, с
   *     флагом и без — как до O-57;
   *   · семпл-лист рядом с колорвеями ПРИ флаге → дверь становится СЕЛЕКТОМ живых столбцов
   *     (`ROSSO | OLIVE | … | + colourway…`), и план считается по слотам ВЫБРАННОЙ цели. Второго
   *     органа рядом с дверью не появилось: селект — это и есть дверь, тот же глагол, тот же
   *     вопрос, тот же отчёт;
   *   · семпл-лист рядом с колорвеями БЕЗ флага — или при флаге, но все столбцы архивные, — цели
   *     нет, и это ОТКАЗ с причиной, а не запись в невидимый `sample`.
   *
   * ОТКАЗОВ ДВА СОДЕРЖАТЕЛЬНЫХ (плюс два общих): листу некуда встать (причины `destinationsOf`) и
   * в разрезе нет ни одной стороны силуэта. Оба уезжают в `ApplySplitDoor` пропом `refusal`: дверь
   * погашена, причина напечатана строкой, и на провод не уходит ни одной записи. Порядок — от
   * общего к частному: карточка только читается / сервер молчит → листу некуда встать → в разрезе
   * нет ни одной стороны силуэта (куски — детали, а у детали нет слота).
   */
  const applyRefusalFor = (rootId: number): string | null => {
    if (disabled)
      return 'this card is read-only for you — putting the split into the sides is an edit of the card';
    if (!speaks) return 'this server does not answer the design routes';
    const sheet = pictureById.get(rootId);
    if (!sheet) return null;
    const nowhere = destinationsOf(colorwayOf(sheet)).refusal;
    if (nowhere) return nowhere;
    if (!piecesOf(rootId).length) return SPLIT_NAMES_NO_SIDE;
    return null;
  };

  /**
   * Горизонт колорвея ОДНОЙ плитки — «у него N, доехало M»; `null` — за горизонтом ничего. Только у
   * ПРИНЕСЁННОЙ плиты (`run_id` 0): её читают из списка `outputs` карточки (группа «brought»
   * истории, `broughtGroup`), а этот список сервер режет поколорвейно. Плиты прогона приезжают со
   * своим прогоном целиком — горизонта у них нет (O-63; RENDERS OF THIS CARD и был этим списком, и
   * горизонт стоял на каждой его плитке).
   */
  const horizonOf = (picture: common_DesignPicture) =>
    (picture.runId ?? 0) <= 0 ? outputsHorizon(band, colorwayOf(picture)) : null;

  /**
   * ═══ O-57 r4 · ЗАПИСКИ НАД ПОЛОСОЙ — ПО ОДНОЙ НА ПРИЧИНУ, А НЕ НА ДВЕРЬ ══════════════════════
   *
   * Какие отказы ПОСТАНОВКИ стоят на полосе. Считаются по всем рендерам хозяина, а не по одним
   * видимым ячейкам: куски свёрнутой колоды — тоже рендеры карточки, и записка, появляющаяся
   * только на раскрытии, сдвигала бы всю полосу вниз ровно под пальцем, нажавшим `expand ▸`.
   * Ветки — те же, что у ряда дверей `RenderTile` (лист колоды — свои двери; стоит в слоте — плашка
   * или `unmark ▸`; склеенный лист — `split ▸`; запись выключена — общий отказ в `title`), и
   * спрашивается тот же `markRefusal`. Дверь `apply splitted` есть только у РАСКРЫТОЙ колоды, и её
   * отказ берётся, пока колода раскрыта.
   */
  const shownRefusals = new Set<string>();
  if (!writesOff) {
    for (const picture of pictures) {
      const id = picture.id ?? 0;
      if ((membersOf.get(id) ?? []).length) continue;
      if (slotHolding(band, id)) continue;
      if (pictureIsComposite(picture)) continue;
      const refusal = markRefusal(picture);
      if (refusal) shownRefusals.add(refusal);
    }
    const applyRefusal = openDeck === null ? null : applyRefusalFor(openDeck);
    if (applyRefusal) shownRefusals.add(applyRefusal);
  }
  /** The reasons this host's plates show — listed on the step's board (O-63 r2, D-72 п.5). */
  const shown = REFUSAL_NOTES.filter((n) => shownRefusals.has(n.reason));
  const shownKeys = shown.map((n) => n.key).join(',');
  useLayoutEffect(() => {
    board?.list(hostKey, order, shownKeys);
  }, [board, hostKey, order, shownKeys]);
  useLayoutEffect(() => () => board?.drop(hostKey), [board, hostKey]);
  /**
   * …AND THE ONES IT PRINTS: those no earlier host of the step prints. Before the board has heard of
   * anyone showing a reason (this host's first render), the host prints it — the layout effects above
   * settle that before the frame is painted. Off a step (no board) — every reason it shows, as before.
   */
  const notes = board
    ? shown.filter((n) => {
        const printer = board.printer(n.key);
        return printer === null || printer === hostKey;
      })
    : shown;
  const noteBase = board?.base ?? hostKey;
  /**
   * Id записки этой причины; `undefined` — записки у причины нет (общий отказ экрана). Записка
   * ищется среди ПОКАЗАННЫХ причин, а не напечатанных здесь: у общей причины записка стоит у
   * первого хозяина шага, и дверь любого хозяина ссылается на неё (O-63 r2).
   */
  const noteIdOf = (reason: string | null): string | undefined => {
    const note = reason === null ? undefined : shown.find((n) => n.reason === reason);
    return note ? `${noteBase}-${note.key}` : undefined;
  };

  return {
    band,
    techCardId,
    disabled: !!disabled,
    writesOff,
    adopts,
    onCreateColorway,
    marking,
    membersOf,
    openDeck,
    colourwayName,
    destinationsOf,
    createsColourwayFor,
    markRefusal,
    markBranches,
    markInto,
    unmarkHeld,
    heldAway,
    heldAt,
    piecesOf,
    piecesCut: (rootId: number) => (wholeDecks?.get(rootId) ?? membersOf.get(rootId) ?? []).length,
    applyRefusalFor,
    horizonOf,
    notes,
    noteBase,
    noteIdOf,
  };
}

/**
 * ═══ O-57 r4 · ПОЧЕМУ ДВЕРИ ПОГАШЕНЫ — ОДНОЙ СТРОКОЙ НА ПРИЧИНУ, НАД ПОЛОСОЙ ════════════════════
 *
 * Не коробка и не `CalloutBox`: у хозяина своя рамка, а вторая внутри неё — box-in-box
 * (DESIGN.md). Кегль и тон подписи (`micro`, `labelColor`), регистр предложения: это фраза, а не
 * ярлык; длина строки — предел прозы студии, `75ch`, иначе на широком экране фраза тянется во всю
 * полосу. Каждая строка — записка (`role='note'`) и остановка Tab, единственная на свою причину:
 * погашенные двери вне порядка Tab, и клавиатура находит причину здесь, а читалка — и здесь, и у
 * самой двери (`aria-describedby`). Фокус — чернильная обводка 2px с отступом 2px, как у всякого
 * контрола системы. Хозяин ставит её над своей полосой; нет ни одной причины — нет и узла.
 */
export function RefusalNotes({
  doors,
  className,
}: {
  doors: RenderDoors;
  /** The host's spacing around the notes — only when there are any (O-63: the workbench). */
  className?: string;
}): JSX.Element | null {
  if (!doors.notes.length) return null;
  return (
    <div data-refusal-notes='' className={cn('flex flex-col gap-1', className)}>
      {doors.notes.map((note) => (
        <Text
          key={note.key}
          id={`${doors.noteBase}-${note.key}`}
          role='note'
          tabIndex={0}
          size='micro'
          variant='label'
          component='p'
          data-refusal-note={note.key}
          className='min-w-0 max-w-[75ch] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
        >
          {note.note}
        </Text>
      ))}
    </div>
  );
}

/**
 * ═══ ONE RENDER TILE — THE CELL AND ITS DOOR ROW ═════════════════════════════════════════════════
 *
 * `deck` is read off the host (`doors.membersOf` / `doors.openDeck`): the tile stands as the SHEET of
 * a deck exactly when pieces were cut out of it. Folded, its surface opens the deck instead of the
 * viewer (J-2, `PictureTile.onOpen`) — the zoom stays the corner button, as in the history; open, the
 * surface zooms again and the door row folds the deck (F-7/F-9, the `deck` branch below).
 */
export function RenderTile({
  doors,
  picture,
  run,
  src,
  className,
  aspect,
  dim,
  galleryGroup,
  onZoom,
  onDeck,
  onEdit,
  onSplit,
  split,
  onDelete,
  deletePending,
}: {
  doors: RenderDoors;
  picture: common_DesignPicture;
  /** The run the plate came out of; `id` 0 — a plate without a run (brought, «no run»). */
  run: common_DesignRun;
  /**
   * WHAT THE SPLIT CORNER READS — the host's `readSplit` (`generation/composite.tsx`), the same
   * facts the FLAT tile of the same row reads (hotfix HX5). An edit of a sheet inherits its views
   * up the edit chain; reading `compositeViews` alone here hid the cut on every edited sheet.
   */
  split: { views: readonly string[]; splitInto: number };
  /**
   * T17: the host's «delete» as an ACT — the last, red row of the tile's menu (`delete…`), opening
   * the host's own confirmation. Nothing of this picture stands under the frame.
   */
  onDelete?: () => void;
  /**
   * TF3: the host's delete is in flight — the whole menu (a mark, a second delete) and the ✕ wait
   * for it, so nothing can race a picture that is leaving.
   */
  deletePending?: boolean;
  /** The raster in the frame. Empty — the frame says so in a word. */
  src: string;
  className?: string;
  /**
   * O-63: the frame, the dimming and the viewer row of a RUN ROW's tile (`RunRenderTile`) — its
   * track's 4/5 frame, the archive shelf's dim, the host's viewer group. Absent — the strip's cell.
   */
  aspect?: string;
  dim?: boolean;
  galleryGroup?: PictureTileProps['galleryGroup'];
  /** The viewer was opened from this tile (E-4 — the host decides what a zoom folds). */
  onZoom?: () => void;
  /** Open or fold THIS tile's deck — the host's one open deck toggles to it or away from it. */
  onDeck: () => void;
  /** Draw over this picture — the host's editor, which files a NEW picture. */
  onEdit: () => void;
  /** Cut this sheet into views — the host's split window. */
  onSplit: () => void;
}): JSX.Element {
  const {
    band,
    techCardId,
    disabled,
    writesOff,
    marking,
    adopts,
    onCreateColorway,
    colourwayName,
    destinationsOf,
    createsColourwayFor,
    markRefusal,
    markBranches,
    markInto,
    unmarkHeld,
    heldAway,
    piecesOf,
    applyRefusalFor,
    noteIdOf,
  } = doors;
  const pictureId = picture.id ?? 0;
  const members = doors.membersOf.get(pictureId) ?? [];
  const deck = members.length ? { open: doors.openDeck === pictureId } : undefined;
  const deckSheet = !!deck && !deck.open;
  /**
   * ═══ A PICTURE WITH THE OLD HIDDEN STAMP STAYS ON THIS TILE (27.09, O-63 r2, D-72 п.2) ═══════════
   *
   * It used to fall back to the history's own tile (`RunTile`'s «hidden» pill), which has no door
   * for a slot the SIDES table does not draw — and a hidden render held in such a slot (a sample
   * column beside colourways) had no way out of it at all. Now it is this tile: the frame dimmed,
   * «hidden» in the caption (the stamp's story in its title), and only the doors that make sense
   * for a picture nobody may place, cut or draw over:
   *   · kept — `unmark ▸` of a plate held away (the one door that empties that slot), the «in X»
   *     word of a plate standing in a drawn column, `expand ▸` / `▾` of its deck (a view, no write);
   *   · gone — `mark ▸` (the server refuses a hidden plate a slot: `hidden_plate`), `split ▸` and the
   *     corner split (`hidden_picture`), `apply splitted` of its open deck, and the edit corner
   *     (D-72 — the history's tile offered it, K-6; the render step does not).
   */
  const hidden = isPictureHidden(picture);
  /**
   * O-63 r2 (D-72 п.1) · A CUT SHEET WHOSE EVERY PIECE STANDS ON SIDES. The «brought» group draws a
   * sheet without the pieces SIDES shows, so such a sheet has no deck there — and it is not uncut:
   * `split ▸` would only hand back the same crops (the server's split is idempotent while they are
   * visible). Its row says where its pieces went instead, and no corner offers a cut.
   * O-63 r3 · THE ANSWER IS ABOUT THE WHOLE FAMILY, NOT THIS DECK: `piecesCut` counts every piece
   * of the sheet the band carries, wherever it stands (`wholeDecks`, `broughtGroup`), and the deck
   * holds the ones off SIDES — climbed through the whole family, a piece cut from a piece that
   * stands on a side included. So «no deck, pieces cut» says exactly «every piece the band carries
   * stands on SIDES», and a sheet with one piece still free keeps its deck and its doors.
   */
  const cutAway = !deck && doors.piecesCut(pictureId) > 0;
  /**
   * ═══ ТРИ ФАКТА, РЕШАЮЩИЕ СУДЬБУ ДВЕРИ `mark ▸` (J-25) ═════════════════════════════════════
   *
   * Все три — ЗЕРКАЛА СЕРВЕРНЫХ ОТКАЗОВ, а не вкус экрана, и потому дверь не рисуется живой там,
   * где сервер уже сказал бы «нет»:
   *   · `composite` — склеенный лист: `ErrDesignCompositePlate`, «сторона это ОДИН вид»;
   *   · `held` — плита уже занимает какой-то слот ЭТОЙ карточки: `ErrDesignPictureAlreadyInSlot`,
   *     и граница там карточка, а не верстак (довод у `slotHolding`);
   *   · род — дверь стоит только у рендеров: у 3D слот верстака рода `threed` не принимает
   *     вовсе (`IsDesignBenchKind` его знает, но выходов 3D в верстак никто не кладёт), и
   *     единственное избрание модели там — пометка `selected`, которую J-23 у рендеров снял.
   */
  /** Склеенный лист — факт о файле, объявленный тем, кто его завёл (разбор у ячейки полки 3D). */
  const composite = pictureIsComposite(picture);
  const held = slotHolding(band, pictureId);
  /** O-57 r2: стоит, но в столбце, которого SIDES не рисует, — дверь снятия у самой плитки. */
  const away = held ? heldAway(picture) : null;
  /* ПОДПИСЬ БОЛЬШЕ НЕ НАЗЫВАЕТ ПРОГОН (O-63). `run N · …` / `no run · …` стояли там, где плиты
     многих прогонов шли одной полосой (RENDERS OF THIS CARD, с разбором «`run 0` — не прогон номер
     ноль»). Плитка стоит теперь в строке своего прогона — строка и есть прогон, и история не
     называет прогона на своих плитках (r2 п.22); принесённые стоят группой «brought». */
  /**
   * ЧЕЙ ЭТОТ РЕНДЕР — читается у САМОЙ КАРТИНКИ (`picture.colorway_id`), а не у прогона: на
   * сервере они законно расходятся (загруженная плита несёт свой колорвей при `run_colorway_id`
   * 0), и `outputs_total_by_colorway` считает именно по картинке.
   */
  const ownColorway = colorwayOf(picture);
  const ownName = colourwayName(ownColorway);
  /** «У этого колорвея N картинок, доехало M» — на плитке, потому что горизонт поколорвейный. */
  const seen = doors.horizonOf(picture);
  const view = viewLabel((picture.ghostView ?? '').trim());
  const shape =
    [view, run.rrev ? `r${run.rrev}` : ''].filter(Boolean).join(' · ') ||
    `picture ${picture.ordinal ?? '—'}`;
  const ordinal = `${picture.ordinal ?? ''}`;
  const busy = (marking === pictureId && pictureId > 0) || !!deletePending;
  /**
   * ═══ T17 · ВСЁ, ЧТО ДЕЛАЕТСЯ С ЭТОЙ КАРТИНКОЙ, — В КАДРЕ (спека §3, лейн L) ═══════════════════
   *
   * Владелец: «кнопки unmark или селектор должны быть внутри плитки по принципу как это сделано в
   * flat slots» и «везде … похоже по одной логике». Под кадром стоял ряд дверей — `mark ▸`,
   * `unmark ▸`, плашка `in front`, `split ▸`, погашенные двери с причинами. Теперь:
   *   · `mark ▾` — угол-меню (низ справа, перед `edit`). Два вопроса прежнего пикера («чей столбец»,
   *     потом «какая сторона») сложены в ОДИН список: строки идут группами по колорвею, и имя
   *     колорвея стоит приглушённым началом строки, когда столбцов больше одного. При одном
   *     столбце строка — просто сторона, как и раньше шаг 1 не существовал;
   *   · ✕ — снять со стороны (тот же `SetDesignBenchSlot`, `picture_id 0`), у ЛЮБОЙ стоящей плиты,
   *     а не только у той, чьего столбца SIDES не рисует: так это сделано и у FLAT;
   *   · где плита стоит, `hidden`, «куски в сторонах» — флаг под ярлыком колорвея;
   *   · `split` — только угол, по правилу HX5 (`offersSplit(split)`); двери `split ▸` в ряду нет;
   *   · отказы (карточка только читается, сервер молчит, «встать некуда») — в `title`, записки над
   *     полосой (`RenderDoorsNotes`) остаются.
   * Ряд под кадром остаётся ОДИН — у колоды (`expand ▸`, раскрытой — `apply splitted` + `▾`): это
   * органы ГРУППЫ кусков, а не этой картинки.
   */
  const at = held ? doors.heldAt(picture) : null;
  const heldWord = at
    ? viewLabel(at.side.view)
    : held
      ? viewLabel((held.viewKey ?? '').trim()) || 'a slot'
      : '';
  const flag: PictureTileFlag | undefined = held
    ? {
        word: `in ${heldWord}`,
        tone: 'ink',
        title: [
          at ? `stands in ${at.where}` : 'stands in a slot of this card',
          away
            ? away.colorwayId === COLORWAY_NONE
              ? 'SIDES draws no sample column while the card has colourways'
              : `SIDES draws no column for ${colourwayName(away.colorwayId)}`
            : '',
          hidden ? 'hidden in an earlier session' : '',
        ]
          .filter(Boolean)
          .join(' — '),
      }
    : hidden
      ? {
          word: 'hidden',
          tone: 'mut',
          title:
            'hidden in an earlier session, before per-picture hiding was removed — pickers and slots still skip it. Runs are archived whole now.',
        }
      : cutAway
        ? {
            word: 'pieces in sides',
            tone: 'mut',
            title:
              'every piece cut from this sheet stands in a side — SIDES shows them, each with its ✕. The sheet holds several views and stands in no side itself.',
          }
        : undefined;
  const onRemove: PictureTileAction | undefined =
    at && !writesOff
      ? {
          onClick: () => unmarkHeld(picture, at.colorwayId, at.side),
          ariaLabel: `unmark render ${ordinal} from ${at.where}`,
          title: `unmark — empty ${at.where}; the render stays on the card`,
          disabled: busy,
          pending: busy,
        }
      : undefined;
  /** `mark` стоит там, где стояла дверь `mark ▸`: свободная одиночная плита, запись разрешена. */
  const markable = !writesOff && !deck && !held && !hidden && !composite;
  const deleteItem: PictureTileMenuItem[] = onDelete
    ? [
        {
          value: DELETE_ITEM,
          label: 'delete…',
          tone: 'danger',
          title: 'delete this picture for good',
        },
      ]
    : [];
  const menu = ((): PictureTileMenu | undefined => {
    if (!markable) {
      return deleteItem.length
        ? {
            label: 'delete',
            ariaLabel: `delete render ${ordinal}`.trim(),
            items: deleteItem,
            pending: busy,
            onPick: () => onDelete?.(),
            'data-menu': `delete:${pictureId}`,
          }
        : undefined;
    }
    const refused = markRefusal(picture);
    const branches = refused ? [] : markBranches(picture);
    /* O-57 r2: веток нет у семпл-плиты рядом с колорвеями, когда все столбцы архивные — меню живо
       ради `+ colourway…`, а причина в подсказке. */
    const nowhere = refused ?? destinationsOf(colorwayOf(picture)).refusal;
    const canCreate = !refused && createsColourwayFor(picture) && !!onCreateColorway;
    const grouped = branches.length > 1 || canCreate;
    const items: PictureTileMenuItem[] = [
      ...branches.flatMap((branch) =>
        branch.leaves.map((leaf) => ({
          value: `${branch.id}${MARK_SEP}${leaf.value}`,
          label: (
            <>
              {grouped && <span className='text-labelColor'>{branch.label} · </span>}
              {leaf.label}
              {leaf.note && <span className='text-labelColor'> · {leaf.note}</span>}
            </>
          ),
          title: leaf.title ?? (grouped ? branch.title : undefined),
        })),
      ),
      ...(canCreate ? [{ value: CREATE_ITEM, label: '+ colourway…' }] : []),
      ...deleteItem,
    ];
    return {
      label: 'mark',
      ariaLabel: `mark render ${ordinal} into a side`.replace(/\s+/g, ' '),
      title:
        nowhere ??
        (grouped
          ? 'put this render into a side — rows are grouped by colourway'
          : `put this render into a side of ${branches[0]?.label ?? ''}`),
      items,
      disabled: !items.length,
      pending: busy,
      'data-menu': `mark:${pictureId}`,
      onPick: (value) => {
        if (value === DELETE_ITEM) return onDelete?.();
        if (value === CREATE_ITEM) return onCreateColorway?.();
        const cut = value.indexOf(MARK_SEP);
        if (cut < 0) return;
        markInto(picture, Number(value.slice(0, cut)), value.slice(cut + MARK_SEP.length));
      },
    };
  })();
  /** Почему у плитки нет органа, который у соседей есть, — одной фразой в подсказке ячейки. */
  const why = writesOff
    ? disabled
      ? 'this card is read-only for you'
      : 'this server does not answer the design routes'
    : composite && !deck && !cutAway && !hidden
      ? 'one sheet with several views glued into it, and a side holds ONE view — split it into frames, then mark them'
      : '';
  const tileTitle = [
    shape,
    seen
      ? `${ownName} has ${seen.total} generative pictures in all and the card shipped the newest ${seen.carried} of them, so the oldest are not on this list`
      : '',
    why,
  ]
    .filter(Boolean)
    .join(' — ');
  return (
    <StripCell
      onOpen={deckSheet ? onDeck : undefined}
      cellPictureId={picture.id}
      className={className}
      aspect={aspect}
      dim={dim || hidden}
      galleryGroup={galleryGroup}
      onZoom={onZoom}
      src={src}
      alt={`render ${picture.ordinal ?? ''}`}
      title={tileTitle}
      /* Якоря прежних строк подписи и дверей — на ячейке (их читают пробы и инспектор). */
      anchors={{
        'data-outputs-horizon': seen ? `${seen.carried}/${seen.total}` : undefined,
        'data-held-away': away ? `${away.colorwayId}:${away.side.view}` : undefined,
        'data-mark-held': held && !away ? pictureId || undefined : undefined,
        'data-unmark-held': onRemove ? pictureId || undefined : undefined,
        'data-hidden-marker': hidden ? '' : undefined,
        'data-cut-away': cutAway ? pictureId || undefined : undefined,
        'data-mark-for': menu?.label === 'mark' ? pictureId || undefined : undefined,
      }}
      /* Рисовать нечем вообще — у строки нет адреса файла. Это называется словом: пустая рамка
         читается как несработавший сервер, а сервер тут ни при чём. */
      empty={
        <Text size='nano' variant='label' component='span'>
          no file address on this row
        </Text>
      }
      /* Кадр встаёт в ОБЩИЙ ряд просмотрщика студии — «листать по всем картинкам» (T-8). */
      gallery={
        picture.media && mediaFullViewerSrc(picture.media)
          ? mediaFullToViewerItem(picture.media)
          : undefined
      }
      /* ПРАВКА (E-3) — от растра; хозяин открывает редактор со `slot={null}`, сохранение рождает
         НОВУЮ картинку. */
      onEdit={
        !writesOff && !hidden
          ? {
              onClick: onEdit,
              ariaLabel: `edit render ${ordinal} — draw over this picture`.trim(),
              title:
                'draw over this picture — saving makes a NEW picture; the original is never overwritten',
            }
          : undefined
      }
      /* ═══ РЕЗАТЬ ПРЕДЛАГАЕТСЯ ТОЛЬКО ТАМ, ГДЕ РЕЗАТЬ ЕСТЬ ЧТО (F-8, F-18, HX5) ═════════════
         Владелец: «везде где картинка не мультивью флет или рендер там не должно на ховер
         показываться сплит». Виды листа читаются тем же `readSplit`, что и у плитки FLAT в том же
         ряду (проп `split`): у правки листа виды наследуются по цепочке правок. Разрезанный лист
         говорит о себе рядом колоды, а не вторым разрезом. Дверь `split ▸` под кадром снята (T17):
         глагол один, и он — угол. */
      onSplit={
        !writesOff && !hidden && !deck && !cutAway && offersSplit(split)
          ? {
              onClick: onSplit,
              ariaLabel: `split render ${ordinal} into views`,
            }
          : undefined
      }
      onRemove={onRemove}
      menu={menu}
      flag={flag}
      /* Владелец (п. 44): «In front in back и тд показывать в одной строчке с колорвеем». */
      flagInline
      /* ═══ ПИЛЮЛЯ КАДРА — ИМЯ КОЛОРВЕЯ (D5) ════════════════════════════════════════════════
         «Чей это рендер» обязано стоять НА САМОЙ ПЛИТКЕ: иначе шесть плит трёх цветов читаются
         как один ряд. `sample` — такое же имя, как `ROSSO`. */
      badge={ownName}
      action={
        deck ? (
          /* ═══ РЯД КОЛОДЫ — ЕДИНСТВЕННЫЙ РЯД ПОД КАДРОМ (T17) ══════════════════════════════
             Владелец (F-7): «для уже сплитнутых … надо писать экспанд … а когда заэкспанжено
             кнопка set которая будет чистить текущие FABRIC RENDER SLOTS и ставить те что в
             сплите». `expand ▸` / `apply splitted` + `▾` действуют на ГРУППУ кусков, а не на эту
             картинку, поэтому стоят рядом колоды, а не углом. Складывающая `▾` обязательна:
             `CropDeck` нем при `hostDoor`, и без неё раскрытую колоду нечем закрыть с клавиатуры. */
          <div data-door-row='' className={DOOR_ROW}>
            {deck &&
              (deck.open ? (
                <>
                  {/* O-63 r2: a hidden sheet puts nothing into the sides — its pieces stay a view. */}
                  {!hidden &&
                    (() => {
                      const rootId = picture.id ?? 0;
                      const own = colorwayOf(picture);
                      /* ЦЕЛИ — ТЕ ЖЕ, ЧТО У `mark` (`destinationsOf`, разбор у `applyRefusalFor`). */
                      const targets = destinationsOf(own).ids.map((id) => ({
                        colorwayId: id,
                        label: colourwayName(id),
                      }));
                      const refusal = applyRefusalFor(rootId);
                      return (
                        <ApplySplitDoor
                          techCardId={techCardId}
                          sidesOf={(target) => threedSides(band, refColorwayFor('render', target))}
                          targets={targets}
                          pieces={piecesOf(rootId)}
                          noun='render'
                          refusal={refusal}
                          refusalDescribedBy={noteIdOf(refusal)}
                          onCreateColorway={own === 0 && adopts ? onCreateColorway : undefined}
                          className='min-w-0 flex-1 [&>button]:h-5 [&>button]:bg-bgColor [&[data-inert]>button]:whitespace-nowrap'
                          doorClassName='h-5 bg-bgColor'
                        />
                      );
                    })()}
                  <Button
                    variant='secondary'
                    size='xs'
                    className='h-5 w-5 shrink-0 bg-bgColor p-0'
                    aria-expanded
                    aria-label={`fold the pieces of render ${ordinal} back behind the sheet`.trim()}
                    data-deck-fold={picture.id || undefined}
                    title='fold these pieces back behind the sheet'
                    onClick={onDeck}
                  >
                    <FoldCaret open className='ml-0' />
                  </Button>
                </>
              ) : (
                <Button
                  variant='secondary'
                  size='xs'
                  className={DOOR}
                  aria-expanded={false}
                  data-deck-expand={picture.id || undefined}
                  onClick={onDeck}
                  title={
                    doors.piecesCut(pictureId) > members.length
                      ? `${members.length} of the ${doors.piecesCut(pictureId)} pieces cut from this sheet ${members.length === 1 ? 'stands' : 'stand'} here, the rest in sides — open ${members.length === 1 ? 'it as a card' : 'them as cards'} in this row`
                      : `${members.length}${members.length === 1 ? ' piece was' : ' pieces were'} cut from this sheet — open them as cards in this row`
                  }
                >
                  expand
                  <FoldCaret open={false} />
                </Button>
              ))}
          </div>
        ) : undefined
      }
    />
  );
}

/** Значения строк угла-меню: `colourway␟side`, рождение колорвея и удаление. */
const MARK_SEP = '␟';
const CREATE_ITEM = '+colourway';
const DELETE_ITEM = 'delete';

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   O-63 step 2 · THE SAME TILE ON A RUN'S ROW — THE WORKBENCH UNDER GENERATE (D-62 п.1–2)
   ═══════════════════════════════════════════════════════════════════════════════════════════════

   FABRIC RENDER shows what came back the way FLAT does: the latest generation under GENERATE and
   the history below, both drawn by `RunOutputs` → `RunTile`. A render plate there is THIS tile with
   THESE doors, not a second copy: `RunTile` switches by the kind of its run (`RunRenderTile`), and
   the host of the row gives the tile its doors through `RenderHostContext`. */

/**
 * WHAT THE DOORS NEED FROM FABRIC RENDER ITSELF — the colourway axis of SIDES (the composer's list
 * and the card's raw one, O-57 r4), whether the server adopts a sample plate (B7), and the step's
 * one colourway birth window (`+ colourway…`). The studio provides it (`RenderStudio`); a host of run
 * tiles under it draws its render plates with the render doors, a host anywhere else finds nothing
 * and its tiles stay as they are.
 */
export type RenderStep = {
  colorways?: common_AdminColorwayRef[];
  cardColorways?: readonly common_AdminColorwayRef[];
  adopts?: boolean;
  onCreateColorway?: (then?: (colorwayId: number) => void) => void;
};

const RenderStepContext = createContext<RenderStep | null>(null);

export function RenderStepScope({
  step,
  children,
}: {
  step: RenderStep;
  children: ReactNode;
}): JSX.Element {
  /* The step's one board of refusal notes (O-63 r2, D-72 п.5) — for the life of the step, whatever
     its values do; the ids of its notes start with the step's own prefix. */
  const base = useId();
  const [board] = useState(() => noteBoard(base));
  return (
    <RenderStepContext.Provider value={step}>
      <NoteBoardContext.Provider value={board}>{children}</NoteBoardContext.Provider>
    </RenderStepContext.Provider>
  );
}

/** The step's values, or `null` off FABRIC RENDER (no `RenderStepScope` above). */
export function useRenderStep(): RenderStep | null {
  return useContext(RenderStepContext);
}

/** One host of run tiles: the doors every render tile of it draws from, and what a tile asks it. */
export type RenderHost = {
  doors: RenderDoors;
  /** The run a plate came out of — its tile says «run N · …». */
  runOf: (picture: common_DesignPicture) => common_DesignRun;
  /** Open or fold a deck of this host — one open deck per host (H-10). */
  onDeck: (rootId: number) => void;
};

const RenderHostContext = createContext<RenderHost | null>(null);

/**
 * THE HOST WHOSE RENDER DOORS THE TILES OF A RUN DRAW — `null` for a run of any other kind and off
 * FABRIC RENDER. `rep` is the RUN'S kind (E-12): a recolour's pictures say `render` on the wire, and
 * a photograph of a person never gets `mark ▸`.
 *
 * EVERY PLATE OF SUCH A RUN, THE HIDDEN ONES TOO (O-63 r2, D-72 п.2). A plate with the old hidden
 * stamp kept the history's own tile until round 2 (`renderHostOf`, gone), and that tile has no door
 * for a slot SIDES does not draw: a hidden render held there was stranded. The render tile draws it
 * now with the doors a hidden picture may have (`RenderTile`), and the deck's own door stays off
 * for every sheet of the host (`RunOutputs`, `hostDoor`) — `expand ▸` is the tile's.
 */
export function useRenderHost(rep: Representation | null): RenderHost | null {
  const host = useContext(RenderHostContext);
  return host && rep === 'render' ? host : null;
}

/**
 * WHAT A HOST SHOWS, FOR ITS DOORS — every plate its rows draw, pieces of folded decks too (the notes
 * read them all), and each sheet's pieces; the rows' own plans (`outputPlan`), so the doors and the
 * grid can never disagree about a deck. A hidden plate is left out of `pictures`: it offers no door
 * that could be refused (`RenderTile`), so it has no note to print.
 */
export function hostPlates(plans: readonly OutputPlan[]): {
  pictures: common_DesignPicture[];
  membersOf: Map<number, common_DesignPicture[]>;
} {
  const pictures: common_DesignPicture[] = [];
  const membersOf = new Map<number, common_DesignPicture[]>();
  for (const plan of plans) {
    for (const { picture, members } of plan.cards) {
      for (const one of [picture, ...members]) if (!isPictureHidden(one)) pictures.push(one);
      if (members.length) membersOf.set(picture.id ?? 0, members);
    }
  }
  return { pictures, membersOf };
}

/**
 * A HOST OF RUN TILES WITH RENDER DOORS — the workbench under GENERATE, the history below it. ONE
 * `useRenderDoors` over every plate it shows, as RENDERS OF THIS CARD had one over its strip, and
 * the notes of its refused doors printed ONCE (D-56′): above the tiles, or where the host puts
 * `RenderDoorsNotes` (`notes={false}` — the history, whose block begins below its own header).
 * Off FABRIC RENDER (no `RenderStepScope` above), or `off`, it is a plain fragment, and the tiles
 * below draw as they always did.
 */
export function RenderDoorsHost(props: RenderDoorsHostProps): JSX.Element {
  const step = useContext(RenderStepContext);
  if (!step || props.off) return <>{props.children}</>;
  return <RenderDoorsHostOn {...props} step={step} />;
}

/** The host's refusal notes, where its own layout wants them (`RenderDoorsHost notes={false}`). */
export function RenderDoorsNotes({ className }: { className?: string }): JSX.Element | null {
  const host = useContext(RenderHostContext);
  return host ? <RefusalNotes doors={host.doors} className={className} /> : null;
}

type RenderDoorsHostProps = {
  /** A host that draws no render plates here (another step's history): a plain fragment. */
  off?: boolean;
  /** Print the notes above the children (the default), or leave them to `RenderDoorsNotes`. */
  notes?: boolean;
  band: GetDesignBandResponse;
  techCardId: number;
  /** The card is read-only for this person — NOT the server's silence, which the doors read themselves. */
  disabled?: boolean;
  /** `hostPlates` of the rows it draws. */
  pictures: readonly common_DesignPicture[];
  membersOf: ReadonlyMap<number, common_DesignPicture[]>;
  /** The whole split of a sheet the host draws only in part — the «brought» group (`broughtGroup`). */
  wholeDecks?: ReadonlyMap<number, common_DesignPicture[]>;
  openDeck: number | null;
  /**
   * The host's place in the step's order (O-63 r2, D-72 п.5): of two hosts showing one refusal
   * reason, the earlier prints its note. The workbench under GENERATE is 0 (the default), the
   * history below SIDES 1.
   */
  order?: number;
  onDeck: (rootId: number) => void;
  runOf: (picture: common_DesignPicture) => common_DesignRun;
  /** Spacing of the notes above the tiles — drawn only when there are any. */
  notesClassName?: string;
  children: ReactNode;
};

function RenderDoorsHostOn({
  step,
  notes = true,
  band,
  techCardId,
  disabled,
  pictures,
  membersOf,
  wholeDecks,
  openDeck,
  order,
  onDeck,
  runOf,
  notesClassName,
  children,
}: RenderDoorsHostProps & { step: RenderStep }): JSX.Element {
  const doors = useRenderDoors({
    band,
    techCardId,
    disabled,
    colorways: step.colorways,
    cardColorways: step.cardColorways,
    adopts: step.adopts,
    onCreateColorway: step.onCreateColorway,
    pictures,
    membersOf,
    wholeDecks,
    openDeck,
    order,
  });
  const host: RenderHost = { doors, runOf, onDeck };
  return (
    <RenderHostContext.Provider value={host}>
      {notes && <RefusalNotes doors={doors} className={notesClassName} />}
      {children}
    </RenderHostContext.Provider>
  );
}

/**
 * ═══ PUT A CUT'S PIECES INTO THE SIDES — ONE QUIET LINE PER CUT ON THE BENCH (gate wave 3, W4) ════
 *
 * The bench draws a cut sheet's pieces in its place (`piecesInPlace`, owner items 20/21), so the
 * deck — and its `apply splitted` (owner E-6: «кнопка аплай сплитед и они уходят в инпут после
 * нажатия … предварительно очищая предыдущий импут») — has no tile to stand on. The verb stays, off
 * the deck: one line per cut under the run's tiles, the same `ApplySplitDoor` with the host's
 * `piecesOf` (the whole split, `wholeDecks` for a brought sheet), its targets from `destinationsOf`
 * and its refusal from `applyRefusalFor`. The sheet itself is never drawn again.
 */
export function PutPiecesIntoSides({ sheet }: { sheet: common_DesignPicture }): JSX.Element | null {
  const host = useContext(RenderHostContext);
  if (!host || isPictureHidden(sheet)) return null;
  const {
    techCardId,
    band,
    adopts,
    onCreateColorway,
    piecesOf,
    piecesCut,
    destinationsOf,
    colourwayName,
    applyRefusalFor,
    noteIdOf,
  } = host.doors;
  const rootId = sheet.id ?? 0;
  const pieces = piecesOf(rootId);
  const own = colorwayOf(sheet);
  const targets = destinationsOf(own).ids.map((id) => ({
    colorwayId: id,
    label: colourwayName(id),
  }));
  const refusal = applyRefusalFor(rootId);
  const n = pieces.length || piecesCut(rootId);
  return (
    <div data-put-pieces={rootId} className='flex'>
      <ApplySplitDoor
        techCardId={techCardId}
        sidesOf={(target) => threedSides(band, refColorwayFor('render', target))}
        targets={targets}
        pieces={pieces}
        noun='render'
        refusal={refusal}
        refusalDescribedBy={noteIdOf(refusal)}
        onCreateColorway={own === 0 && adopts ? onCreateColorway : undefined}
        label={`put the ${n} ${n === 1 ? 'piece' : 'pieces'} into sides ▸`}
        quiet
      />
    </div>
  );
}

/**
 * THE FRAME OF A RUN ROW — `PictureTile`'s own 4/5, the frame `RunTile` draws and `RunOutputs` hands
 * its decks (`frameAspect='4/5'`): the fan behind a sheet lines up with the sheet only on one frame.
 */
const RUN_FRAME_ASPECT = '4/5';

/**
 * ═══ A RENDER PLATE IN A RUN ROW — `RunTile`'s render branch (O-63, D-62 п.2) ═════════════════════
 *
 * The tile is `RenderTile` as RENDERS OF THIS CARD drew it — its badge, its caption, its six door
 * states and two corners — on the row's grid track and frame, zooming through the host's viewer row.
 * The row's anchors stay the history's (`data-picture`, `data-deck-member`). What the run row owns is
 * handed in: the zoom (E-4 lives with the host), the split window, and the editor, which files a NEW
 * picture here as everywhere on this step — «overwrite or save as new» is the flat workbench's
 * question (07-FLAT-WORKBENCH §3c), asked of a flat that a sheet and its callouts cite.
 */
export function RunRenderTile({
  host,
  picture,
  src,
  dim,
  deckMemberOf,
  galleryGroup,
  onZoom,
  onSplit,
  onEdit,
  split,
  onDelete,
  deletePending,
  children,
}: {
  host: RenderHost;
  picture: common_DesignPicture;
  src: string;
  dim?: boolean;
  /** The sheet this piece was cut out of, when the tile stands in an OPEN deck (H-10). */
  deckMemberOf?: number;
  galleryGroup?: PictureTileProps['galleryGroup'];
  onZoom?: () => void;
  onSplit: () => void;
  onEdit: () => void;
  /** The row's `readSplit` facts for this picture — see `RenderTile`'s `split`. */
  split: { views: readonly string[]; splitInto: number };
  /** T17: the row's «delete» as the tile menu's last item — see `RenderTile`'s `onDelete`. */
  onDelete?: () => void;
  /** TF3: that delete is in flight — see `RenderTile`'s `deletePending`. */
  deletePending?: boolean;
  /** The editor the run row mounts over this tile while it is open. */
  children?: ReactNode;
}): JSX.Element {
  const pictureId = picture.id ?? 0;
  return (
    <div
      className='flex h-full w-full min-w-0 flex-col'
      data-picture={pictureId || undefined}
      data-deck-member={deckMemberOf || undefined}
    >
      <RenderTile
        doors={host.doors}
        picture={picture}
        run={host.runOf(picture)}
        src={src}
        /* The grid's track, not the strip's 132px; the full height, so the door rows of one line of
           the grid stand on one line (`mt-auto` on the doors). */
        className='w-full flex-1'
        aspect={RUN_FRAME_ASPECT}
        dim={dim}
        galleryGroup={galleryGroup}
        onZoom={onZoom}
        onDeck={() => host.onDeck(pictureId)}
        onEdit={onEdit}
        onSplit={onSplit}
        split={split}
        onDelete={onDelete}
        deletePending={deletePending}
      />
      {children}
    </div>
  );
}

/**
 * ═══ THE BROUGHT PLATES — ONE FOLDED GROUP AT THE END OF THE HISTORY (27.09, O-63, D-62 п.4) ═════
 *
 * RENDERS OF THIS CARD was the one place a plate brought by hand («no run»: an upload, a flatten
 * with no parent) stood among the card's renders. A run has its row in the history; these have
 * none. SIDES shows the ones standing in a column it draws, with their ✕; every OTHER brought plate
 * would vanish with the section — so they stand as one pseudo-row of the history («N brought ▸»,
 * `GenerationHistory`), drawn by the same `RunOutputs` → `RunTile` → render tile, with the same
 * doors: those standing in no slot, and those standing in a slot of a column SIDES does not draw
 * (held away — `unmark ▸` on the tile is the only door that empties it, O-57 r2).
 *
 * ═══ PICTURE BY PICTURE, THEN DECKS (27.09, O-63 r2, D-72 п.1) ════════════════════════════════════
 * Whether a plate stands on SIDES is asked of THAT plate (`picturesOnSides` — a side of a drawn
 * column, or the legacy shelf, which is drawn for every colourway), and only the plates that do not
 * are grouped into decks, so a piece whose sheet stands on SIDES is a card of its own here, and a
 * sheet whose piece stands there keeps the rest behind it. The first edition asked the family's
 * root and let the answer ride down the family: a free piece of a placed sheet was nowhere, and a
 * placed piece of a free sheet was drawn twice.
 *
 * ═══ THE FAMILY IS CLIMBED THROUGH EVERY BROUGHT PLATE THE BAND CARRIES (28.09, O-63 r3) ══════════
 * Round 2 left the decks to `outputPlan` over the group's own list — an ancestry climbed INSIDE
 * that list. A family cut twice over (sheet → piece A → piece B, the shape of beta's run 7) broke
 * there the moment A stood on a side: B's parent was not in the list, so B stood as a card of its
 * own, the sheet had no deck, and «pieces in sides» was said of a sheet whose piece B stood right
 * beside it, its `expand ▸` and `apply splitted` gone (REVIEW-T64-codex-2, Moderate). Now the
 * ancestry is climbed through the POOL — every brought plate the band carries anywhere: the card's
 * list, and the bench rows holding one (a plate on SIDES, a plate held away, a hidden plate the
 * list dropped) — while whether a plate is IN the group stays decided plate by plate. A plate of
 * the group hangs behind the TOPMOST plate of the group in its ancestry (one deck per family, as
 * `cropFamilies` keys by the root: a deck inside a deck would fold with its sheet, H-10), and
 * stands as a card when no ancestor of it is in the group. A card's WHOLE split — what
 * `apply splitted` puts into the sides, what «pieces in sides» counts — is every descendant of it
 * the pool carries, wherever each of them stands.
 *
 * Every plate of the pool is either on SIDES or in the group (the list drops hidden plates, and a
 * bench row's plate is on a drawn side, held away, or on the legacy shelf), so a card whose deck is
 * empty while its whole split is not has EVERY piece the band carries on SIDES — that, and nothing
 * else, is `cutAway` (`RenderTile`). A piece the band does not carry at all (hidden and held
 * nowhere, or beyond the list's horizon) cannot be climbed through: its children stand as cards of
 * their own, the truthful answer for a screen that cannot see the link.
 *
 * `null` — nothing brought stands off SIDES, or this server lists no outputs and no such plate is
 * held away (the page walk of an older binary reaches runs only). The run is the stamp of the first
 * brought row, id 0: «no run».
 */
export type BroughtGroup = {
  /** The group's pseudo-run — id 0, «no run»; its `pictures` are the plates the group draws. */
  run: common_DesignRun;
  /** The cards and their decks, as the group draws them (`RunOutputs plan`). */
  plan: OutputPlan;
  /** Each card's whole split — every piece of it the band carries, wherever it stands. */
  wholeDecks: Map<number, common_DesignPicture[]>;
};

export function broughtGroup(band: GetDesignBandResponse, step: RenderStep): BroughtGroup | null {
  const axis = colourwayColumns(band, step.colorways ?? NO_COLOURWAYS, step.cardColorways);
  const onSides = picturesOnSides(band, axis);
  const rows = outputsOfKind(band, 'render').filter(({ run }) => (run.id ?? 0) <= 0);
  /* THE POOL — every brought plate the band carries: the card's list, then the bench's. */
  const pool: common_DesignPicture[] = [];
  const pooled = new Map<number, common_DesignPicture>();
  const pour = (picture: common_DesignPicture) => {
    const id = picture.id ?? 0;
    if (id <= 0 || pooled.has(id)) return;
    pooled.set(id, picture);
    pool.push(picture);
  };
  for (const { picture } of rows) pour(picture);
  for (const row of band.bench ?? []) {
    if (benchKindOf(row) !== 'render') continue;
    const plate = row.picture;
    if (plate && (plate.runId ?? 0) <= 0) pour(plate);
  }
  /* WHO IS IN THE GROUP — plate by plate (r2). */
  const pictures: common_DesignPicture[] = [];
  const taken = new Set<number>();
  const take = (picture: common_DesignPicture) => {
    const id = picture.id ?? 0;
    if (id <= 0 || taken.has(id) || onSides.has(id)) return;
    taken.add(id);
    pictures.push(picture);
  };
  for (const { picture } of rows) take(picture);
  /* Held away: an active side of a render column the table does not draw. */
  for (const row of band.bench ?? []) {
    if (benchKindOf(row) !== 'render') continue;
    if (!isActiveView(normaliseViewKey(row.viewKey))) continue;
    const colorwayId = colorwayOf(row);
    if (axis.some((c) => c.colorwayId === colorwayId)) continue;
    const plate = row.picture;
    if (!plate || (plate.runId ?? 0) > 0) continue;
    take(plate);
  }
  if (!pictures.length) return null;
  /* THE ANCESTRY OF EACH POOL PLATE — its cut ancestors, nearest first, climbed through the pool
     (the walk of `cropFamilies`: a cut climbs to its parent, an edit ends the line, `isCutOut`). */
  const ancestorsOf = (picture: common_DesignPicture): number[] => {
    const line: number[] = [];
    const seen = new Set<number>([picture.id ?? 0]);
    let node = picture;
    while (isCutOut(node)) {
      const parentId = node.derivedFrom ?? 0;
      if (parentId <= 0 || seen.has(parentId)) break;
      const parent = pooled.get(parentId);
      if (!parent) break;
      seen.add(parentId);
      line.push(parentId);
      node = parent;
    }
    return line;
  };
  const ancestry = new Map<number, number[]>();
  for (const plate of pool) ancestry.set(plate.id ?? 0, ancestorsOf(plate));
  /* THE CARD A PLATE OF THE GROUP STANDS ON — the topmost plate of the group in its ancestry, or
     itself. */
  const cardOf = (id: number): number => {
    let card = id;
    for (const ancestorId of ancestry.get(id) ?? []) if (taken.has(ancestorId)) card = ancestorId;
    return card;
  };
  const membersOf = new Map<number, common_DesignPicture[]>();
  const deckOf = new Map<number, number>();
  for (const picture of pictures) {
    const id = picture.id ?? 0;
    const card = cardOf(id);
    if (card === id) continue;
    deckOf.set(id, card);
    const members = membersOf.get(card);
    if (members) members.push(picture);
    else membersOf.set(card, [picture]);
  }
  const cards = pictures
    .filter((picture) => !deckOf.has(picture.id ?? 0))
    .map((picture) => ({ picture, members: membersOf.get(picture.id ?? 0) ?? [] }));
  /* THE WHOLE SPLIT OF EACH CARD — every pool plate with the card in its ancestry, in pool order. */
  const wholeDecks = new Map<number, common_DesignPicture[]>();
  for (const { picture } of cards) {
    const cardId = picture.id ?? 0;
    const whole = pool.filter((plate) => (ancestry.get(plate.id ?? 0) ?? []).includes(cardId));
    if (whole.length) wholeDecks.set(cardId, whole);
  }
  return {
    run: { ...(rows[0]?.run ?? RUN_NOT_STATED), id: 0, kind: 'render', pictures },
    plan: { cards, deckOf },
    wholeDecks,
  };
}
