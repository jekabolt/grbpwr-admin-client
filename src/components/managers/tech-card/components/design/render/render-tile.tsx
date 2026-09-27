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
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import { Button } from 'ui/components/button';
import { mediaFullToViewerItem, mediaFullViewerSrc } from 'ui/components/media-viewer';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { InertDoor } from '../bench-slot';
import {
  COLORWAY_NONE,
  colorwayOf,
  refColorwayFor,
  slotHolding,
  type Representation,
} from '../bench-kinds';
import { serverSpeaksDesign } from '../capability';
/* Под другим именем: у экранов студии есть свои `colorwayLabel` (подпись цели). */
import { colorwayLabel as refLabel } from '../colorway-picker';
import { TwoStepPicker, type PickerBranch } from '../core';
import type { OutputPlan } from '../generation/run-gallery';
import type { PictureTileProps } from '../picture-tile';
import { useDesignWrites } from '../use-design-band';
import { isPictureHidden } from '../visibility';
import { isActiveView, normaliseViewKey, viewLabel, type ActiveView } from '../views';
import { ApplySplitDoor, type SplitPiece } from './apply-split';
import {
  outputsHorizon,
  pictureIsComposite,
  pictureOffersSplit,
  threedSides,
  type BenchSide,
} from './model';
import { SAMPLE_LABEL, colourwayColumns } from './side-row';
import { StripCell } from './strip-cell';

/**
 * ═══ ONE FABRIC RENDER, WITH THE DOORS THAT PUT IT INTO A SIDE (27.09, O-63 step 1, D-62) ═══════
 *
 * Moved out of `outputs.tsx` (RENDERS OF THIS CARD) without a change of behaviour, so the render
 * tile and its door rules exist ONCE and any host can draw them: the strip of that section today,
 * the latest-generation workbench and the history rows of FABRIC RENDER next (`RunTile`, by the
 * kind of its run). Owner, verbatim: «после генерации результат показывать как во флетах те с
 * LATEST GENERATION и GENERATION HISTORY свернут по дефолту и RENDERS OF THIS CARD получается не
 * нужен» — the section goes, its doors must not.
 *
 * WHAT LIVES HERE:
 *   · the door row's metric (`DOOR_ROW`, `DOOR`, `INERT_DOOR`, F-9) — the 3D shelf's row reads it too;
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
/** То же для `InertDoor`: класс приезжает на ЕЁ обёртку, а ширину надо отдать кнопке внутри —
 *  примитив её наружу не пускает, а мёртвая дверь обязана занимать ровно то место, которое заняла
 *  бы живая. Иначе отказ выглядит уже своей причины и читается как другой орган. */
export const INERT_DOOR = 'w-full [&>button]:h-5 [&>button]:w-full [&>button]:bg-bgColor';

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
  piecesOf: (rootId: number) => SplitPiece[];
  applyRefusalFor: (rootId: number) => string | null;
  /** Горизонт колорвея ОДНОЙ плитки — только у хозяина, который показывает список `outputs`. */
  horizonOf: (picture: common_DesignPicture) => { total: number; carried: number } | null;
  /** Записки над полосой — по одной на причину (O-57 r4). */
  notes: readonly { key: string; reason: string; note: string }[];
  noteBase: string;
  noteIdOf: (reason: string | null) => string | undefined;
};

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
  openDeck,
  horizon = false,
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
  /** The host's one open deck (H-10). */
  openDeck: number | null;
  /**
   * The host shows the card's whole outputs list (`band.outputs`), so each tile says how far that
   * list reaches for its colourway (the title of its caption). A run row is not that list.
   */
  horizon?: boolean;
}): RenderDoors {
  const speaks = serverSpeaksDesign();
  const { setBenchSlot } = useDesignWrites(techCardId);
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
  /** Префикс id записок об отказах (O-57 r4, `REFUSAL_NOTES`). Хук — выше раннего выхода. */
  const noteBase = useId();
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
   */
  const piecesOf = (rootId: number): SplitPiece[] => {
    const seen = new Set<string>();
    const out: SplitPiece[] = [];
    for (const member of membersOf.get(rootId) ?? []) {
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
    setBenchSlot.mutate(
      {
        /* ⚠ БЕЗ `slotId` — он в одном `oneof` с `viewKey`, как у всех писателей верстака. */
        slot: {
          viewKey: side.view,
          kind: 'render',
          colorwayId: refColorwayFor('render', colorwayId),
        },
        pictureId: 0,
        expectedSlotRev: side.slotRev,
      },
      { onSettled: () => setMarking(null) },
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
    const pictureId = picture.id ?? 0;
    if (pictureId <= 0) return null;
    const colorwayId = colorwayOf(picture);
    if (axis.some((c) => c.colorwayId === colorwayId)) return null;
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

  /** Горизонт колорвея ОДНОЙ плитки — «у него N, доехало M»; `null` — за горизонтом ничего. */
  const horizonOf = (picture: common_DesignPicture) =>
    horizon ? outputsHorizon(band, colorwayOf(picture)) : null;

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
  const notes = REFUSAL_NOTES.filter((n) => shownRefusals.has(n.reason));
  /** Id записки этой причины; `undefined` — записки у причины нет (общий отказ экрана). */
  const noteIdOf = (reason: string | null): string | undefined => {
    const note = reason === null ? undefined : notes.find((n) => n.reason === reason);
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
    piecesOf,
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
  runLine = true,
  onZoom,
  onDeck,
  onEdit,
  onSplit,
}: {
  doors: RenderDoors;
  picture: common_DesignPicture;
  /** The run the plate came out of; `id` 0 — a plate without a run (brought, «no run»). */
  run: common_DesignRun;
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
  /**
   * The caption names the run — `run N · …` / `no run · …` — where plates of many runs stand in one
   * strip. A run's own row (`RunRenderTile`) says the shape alone: the row IS the run, and the
   * history names no run on its tiles (r2 п.22).
   */
  runLine?: boolean;
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
  /**
   * ⚠ `run 0` — ЭТО НЕ ПРОГОН НОМЕР НОЛЬ. Со времён H-9 в списке стоят и плиты, за которыми
   * прогона нет вовсе: загруженная руками и «плоская» правка без основы обе приходят с
   * `run_id = 0`. Печатать им `run 0` значило бы назвать номер, которого нет.
   *
   * И слово тут именно «no run», а не «upload», хотя загрузка — частый случай: контракт
   * прямо предупреждает, что `run_id 0` НЕ влечёт «пришло из партии» (`batch_id` тоже
   * бывает нулём). Откуда плита взялась на самом деле, говорит вторая строка — она читает
   * `source_class` и печатает `uploaded` / `drawn` / `imported SVG`. Первая строка отвечает
   * только за прогон, и её честный ответ — что прогона нет.
   */
  const stamped = (run.id ?? 0) > 0;
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
  return (
    <StripCell
      onOpen={deckSheet ? onDeck : undefined}
      cellPictureId={picture.id}
      className={className}
      aspect={aspect}
      dim={dim}
      galleryGroup={galleryGroup}
      onZoom={onZoom}
      src={src}
      alt={`render ${picture.ordinal ?? ''}`}
      /* Рисовать нечем вообще — у строки нет адреса файла. Это называется словом: пустая рамка
         читается как несработавший сервер, а сервер тут ни при чём. */
      empty={
        <Text size='nano' variant='label' component='span'>
          no file address on this row
        </Text>
      }
      /* Кадр встаёт в ОБЩИЙ ряд просмотрщика студии — «листать по всем картинкам» (T-8) не
         обрывается на готовых рендерах. */
      gallery={
        picture.media && mediaFullViewerSrc(picture.media)
          ? mediaFullToViewerItem(picture.media)
          : undefined
      }
      /* ═══ РЕЗАТЬ ПРЕДЛАГАЕТСЯ ТОЛЬКО ТАМ, ГДЕ РЕЗАТЬ ЕСТЬ ЧТО (F-8, F-18) ═════════════════
         Владелец, дословно: «на уже заспличеных картинках на ховер сплит писать не нужно так же
         как и на не мультивью картинках» и «везде где картинка не мультивью флет или рендер там
         не должно на ховер показываться сплит».

         ЗДЕСЬ СТОЯЛО ОБРАТНОЕ ПРАВИЛО, И ОНО БЫЛО ВЫВЕДЕНО ИЗ ДРУГОЙ ПРОСЬБЫ. Круг 4: «сделай
         везде одинаково включая кнопку сплит» — про ОДИНАКОВУЮ РАСКЛАДКУ органа (низ слева,
         один примитив), и этот файл прочитал её как «рисовать его на каждом кадре». Отсюда
         `split` на одиночном рендере, где он означал уже не разрез листа на виды, а произвольный
         кроп — второй смысл у одного слова.

         ДВА ЧЛЕНА ПРЕДИКАТА, И КАЖДЫЙ — СВОЙ ВОПРОС ЧЕЛОВЕКА:
           · «есть ли в этом файле несколько видов». Нет — резать нечего, и угол обещал бы кроп,
             которого этот экран не делает;
           · «а не разрезан ли он уже». Разрезан — жест другой и слово другое (`expand` / `apply splitted`
             в ряду дверей), а второй разрез того же листа завёл бы вторую колоду тех же видов.

         ⚠ ОБА ВОПРОСА ЗАДАЁТ ТЕПЕРЬ `pictureOffersSplit` (`render/model.ts`), И ЭТО НЕ КОСМЕТИКА.
         Этот файл был ЭТАЛОНОМ правила, но эталон, стоящий литералом, копируется, а копия рано
         или поздно теряет член: плитка референса предъявляла угол по `!readOnly && url`, то есть
         не сверялась ни с одним из двух. Здесь остались только вопросы, которые знает ТОЛЬКО
         этот экран, — род и право писать; «мультивью и не резан» спрашивается у общего предиката.
         У 3D угла нет по-прежнему: резать модель нечем, а её постер поглощён парой. */
      /* ПРАВКА (E-3) — от растра, и результат правки никуда вставать не обязан: хозяин открывает
         редактор со `slot={null}`, сохранение рождает НОВУЮ картинку. */
      onEdit={
        !writesOff
          ? {
              onClick: onEdit,
              ariaLabel: `edit render ${picture.ordinal ?? ''} — draw over this picture`.trim(),
              title:
                'draw over this picture — saving makes a NEW picture; the original is never overwritten',
            }
          : undefined
      }
      onSplit={
        !writesOff && pictureOffersSplit(picture, !!deck)
          ? {
              onClick: onSplit,
              ariaLabel: `split render ${picture.ordinal ?? ''} into views`,
            }
          : undefined
      }
      /* ═══ ПИЛЮЛЯ КАДРА — ИМЯ КОЛОРВЕЯ (D5) ════════════════════════════════════════════════
         «Чей это рендер» обязано стоять НА САМОЙ ПЛИТКЕ: иначе шесть плит трёх цветов читаются
         как один ряд. `sample` — такое же имя, как `ROSSO`, и рисуется так же: ось 0 не «ничего не
         выбрано», а вечный верстак семпла. Лист говорит о себе дверью `expand ▸` / `split ▸` в
         ряду под кадром, а не числом видов на ярлыке — ярлык занят именем колорвея. */
      badge={ownName}
      /* ═══ ВТОРАЯ СТРОКА ПОДПИСИ СНЯТА — F-13, ДОСЛОВНО «убери текст "AI · run 26 · from mixed
         input"» ═══════════════════════════════════════════════════════════════════════════════
         Это `stripProvenance`, и снята она ЗДЕСЬ, а не в мире: тем же вызовом живут полоса входа
         рендера, полоса входа 3D и `what-model-gets` — там она отвечает на вопрос «а откуда
         взялось ТО, ЧТО СЕЙЧАС ПОЙДЁТ В ПРОГОН», и молчать об этом нельзя. Здесь же список —
         весь выход карточки, происхождение у всех строк одно и то же слово, и оно повторялось
         столько раз, сколько плиток на экране.
         Что при этом НЕ потеряно: номер прогона стоит первой строкой, и он же — единственный
         член провенанса, который на этом экране различает строки. */
      /* ⚠ ГОРИЗОНТ ЕДЕТ ПОДСКАЗКОЙ ЭТОЙ ЖЕ СТРОКИ, А НЕ ВТОРОЙ СТРОКОЙ ПОД НЕЙ. Он поколорвейный
         («у ROSSO 74 картинки, доехало 60»), а список теперь общий — в шапке одного такого числа
         нет вовсе. Вторая видимая строка вернула бы под каждую плитку прозу, которую владелец
         снял (J-19); подсказка отвечает тому, кто спросил «а где остальные». */
      lines={[
        <span
          key='shape'
          data-outputs-horizon={seen ? `${seen.carried}/${seen.total}` : undefined}
          title={
            seen
              ? `${ownName} has ${seen.total} generative pictures in all and the card shipped the newest ${seen.carried} of them, so the oldest are not on this list`
              : undefined
          }
        >
          {!runLine ? shape : stamped ? `run ${run.id} · ${shape}` : `no run · ${shape}`}
        </span>,
        /* ═══ O-57 r2 · ГДЕ ПЛИТА СТОИТ, КОГДА ЕЁ СТОЛБЦА НА ЭКРАНЕ НЕТ ═══════════════════════
           У плиты в видимом столбце это слово пилюли в ряду дверей («in front»), а ✕ стоит в
           таблице. Здесь ряд занят дверью снятия, а таблица этой стороны не показывает вовсе,
           поэтому место называется строкой подписи — тем же кеглем, что строка прогона. Это не
           проза под каждой плиткой (J-19), а факт одной плитки: строки нет, пока плита
           свободна или стоит в видимом столбце. */
        ...(away
          ? [
              <span key='held-away' data-held-away={`${away.colorwayId}:${away.side.view}`}>
                in {away.where}
              </span>,
            ]
          : []),
      ]}
      action={
        /* ⚠ `flex-wrap` СНЯТ ВМЕСТЕ С ПРИЧИНОЙ ПЕРЕНОСА. Переносить было что, пока ряд мог
           держать ДВА органа шириной 104px и 50px в колонке 132px; теперь живая дверь ровно
           одна на ячейку (`held` ИЛИ колода ИЛИ лист ИЛИ пометка), и единственный ряд из двух
           членов — раскрытая колода, где ширины заданы явно. Перенос при этом не «на всякий
           случай», а вредный: он МЕНЯЕТ ВЫСОТУ ячейки от её содержимого, то есть и есть то
           самое «кнопки скачут». Разбор метрики — у `DOOR_ROW` в шапке файла. */
        <div data-door-row='' className={DOOR_ROW}>
          {/* ═══ ДВЕРЬ В СЛОТ — ЗДЕСЬ, ГДЕ ЛЕЖИТ МАТЕРИАЛ (J-25) ═════════════════════════════
              Шесть состояний, и каждое отвечает на СВОЙ вопрос человека:
                · «в какой стороне это уже стоит» — читаемая плашка (Pill), не кнопка: сторону
                  освобождает ✕ на самой плите в FABRIC RENDER SLOTS, и второй глагол снятия
                  здесь был бы вторым реестром одного действия;
                · «а если её столбца в SIDES нет» (O-57 r2) — ✕ там нет вовсе, и снятие стоит
                  здесь: `unmark ▸`, а где плита стоит, говорит строка подписи;
                · «этот лист уже разрезан — где куски» — `expand ▸`, а раскрытым `apply splitted` + `▾`
                  (F-7, разбор у самой ветки);
                · «этот лист ещё не разрезан» — живой `split ▸`;
                · «почему дверь мертва» — карточка только читается либо сервер молчит;
                · и сама постановка одиночного кадра — двухшаговый пикер сторон.
              ⚠ АТРИБУТ ВИСИТ НА ОБЁРТКЕ, А НЕ НА САМОМ ПИКЕРЕ: и у Radix, и у `TwoStepPicker`
              список пропов ЗАКРЫТ, `data-*` до DOM не доезжает, и утверждение по нему было бы
              зелёным над отсутствующим узлом. Тот же приём, что у `ColorwaySelect`. */}
          {deck ? (
            /* ═══ РАЗРЕЗАННЫЙ ЛИСТ: `expand ▸` ЗАКРЫТЫМ, `apply splitted` + `▾` РАСКРЫТЫМ (F-7 → Ф4) ═══
               Владелец, дословно: «для уже сплитнутых … мы не должны показывать кнопку SPLIT ▸
               тк оно уже заслитано надо писать экспанд или что-то вроде того пока оно не
               открыто а когда заэкспанжено кнопка set которая будет чистить текущие FABRIC
               RENDER SLOTS и ставить те что в сплите».

               ЭТО ЖЕ МЕСТО ЗАБРАЛО ДВЕРЬ КОЛОДЫ. Под кадром стояла ВТОРАЯ строка — «▸ 3 CUT
               PIECES», собственная дверь `CropDeck`, — и владелец назвал её визуальным мусором
               (F-9). Мусором её делало соседство: два органа одного кадра на двух строках,
               причём верхний («split ▸») врал, а нижний нёс единственный работающий глагол.
               Теперь глагол один и стоит в ряду дверей, как у всех соседей; счёт кусков ушёл в
               `title`, а раскрытая колода называет его собой — куски стоят рядом.

               ⚠ СКЛАДЫВАЮЩАЯ ДВЕРЬ ОБЯЗАТЕЛЬНА, И ЭТО НЕ УКРАШЕНИЕ. `CropDeck` объявленно нем
               при `hostDoor` (веер `aria-hidden`, поверхность листа тоже), поэтому без `▾`
               раскрытую колоду нечем было бы закрыть ни с клавиатуры, ни читалкой — только
               раскрыв ЧУЖУЮ. */
            deck.open ? (
              <>
                {/* ⚠ ОТКАЗ НАЗЫВАЕТ СЕБЯ СЛОВОМ, А НЕ СЕРОЙ КНОПКОЙ. Тот же закон, что у
                    `split ▸` и `mark ▸` двумя ветками ниже: выключенная дверь без причины
                    отправляет человека искать, что он сделал не так.

                    ДВЕРЬ — ОТДЕЛЬНЫЙ ОРГАН (Ф4): `ApplySplitDoor` из `./apply-split`, и с
                    круга r2 (п.29/30) хозяин у неё ОДИН — вот эта раскрытая колода. Полосы
                    входа свои двери постановки потеряли целиком, поэтому «та же, что на
                    полосах входа» больше не про что: глагол, вопрос и отчёт живут в модуле
                    не ради второго экрана, а ради того, чтобы занятость и вопрос не были
                    третьим написанием `set` в этом файле.
                    Этот экран отдаёт ей АДРЕС ВЕРСТАКА ЦЕЛИ (`sidesOf(target)` — цель
                    выбирают пунктом селекта, а не секция) и свои отказы (`refusal`, разбор у
                    `applyRefusalFor`): при отказе дверь стоит погашенной — причина в её
                    `title`, а у отказа постановки ещё и одной запиской над полосой (O-57 r4),
                    — колода раскрыта, и исчезнувшая дверь читалась бы как пропажа.
                    Пустой план (куски без стороны силуэта) — тоже отказ, а не живая кнопка,
                    которая молчит; полосы входа на него дверь не рисуют вовсе, здесь она
                    обязана остаться на месте и сказать почему.

                    Ширина и метрика — ряда дверей (F-9): `flex-1` ячейке, `h-5 bg-bgColor`
                    кнопке, как у соседей.

                    ⚠ ЛИЦО ОТКАЗА — ОДНОЙ СТРОКОЙ И В СВОЕЙ КОРОБКЕ (O-57 r2). Рядом с `▾`
                    двери достаётся 110px, и «APPLY SPLITTED» в `InertDoor` ложилось на вторую
                    строку, вылезало из `h-5` и наезжало на строку причины (замерено снимком).
                    С r2 отказ стоит чаще (семпл-лист рядом с колорвеями без B7, все столбцы
                    архивные), поэтому погашенной кнопке отсюда отдаются `nowrap` и поля `px-0.5`:
                    с полями `xs` подпись одной строкой вылезала бы за рамку на 5px. Селектор
                    `[data-inert]` — обёртка `InertDoor`: живую дверь правило не трогает. */}
                {(() => {
                  const rootId = picture.id ?? 0;
                  const own = colorwayOf(picture);
                  /* ЦЕЛИ — ТЕ ЖЕ, ЧТО ВЕТКИ `mark ▸` (`destinationsOf`, разбор у
                     `applyRefusalFor`): одна — дверь остаётся кнопкой; несколько (семпл-лист
                     рядом с колорвеями при флаге) — селект; ни одной — отказ с причиной. */
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
                      className='min-w-0 flex-1 [&>button]:h-5 [&>button]:bg-bgColor [&[data-inert]>button]:whitespace-nowrap [&[data-inert]>button]:px-0.5'
                      doorClassName='h-5 bg-bgColor'
                    />
                  );
                })()}
                {/* ⚠ ЭТО БЫЛ СЫРОЙ `<button>` — ЕДИНСТВЕННЫЙ КОНТРОЛ РЯДА МИМО `buttonVariants`,
                    и он один держал СВОЮ рамку, СВОЙ ховер и СВОЙ фокус, переписанные тут же
                    строкой классов. Пока их четыре штуки совпадали с примитивом на глаз, он
                    читался ровно; расходятся такие копии не «иногда», а при первой же правке
                    кнопки — то есть ряд разъезжается там, где никто не смотрел.
                    Квадрат 20×20 остаётся квадратом: `size='xs'` даёт метрику текста, а
                    `h-5 w-5 p-0` — саму клетку, в которой стоит один глиф. */}
                <Button
                  variant='secondary'
                  size='xs'
                  className='h-5 w-5 shrink-0 bg-bgColor p-0'
                  aria-expanded
                  aria-label={`fold the pieces of render ${picture.ordinal ?? ''} back behind the sheet`.trim()}
                  data-deck-fold={picture.id || undefined}
                  title='fold these pieces back behind the sheet'
                  onClick={onDeck}
                >
                  ▾
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
                title={`${members.length}${members.length === 1 ? ' piece was' : ' pieces were'} cut from this sheet — open them as cards in this row`}
              >
                expand ▸
              </Button>
            )
          ) : away ? (
            /* ═══ O-57 r2 · ПЛИТА В СТОЛБЦЕ, КОТОРОГО SIDES НЕ РИСУЕТ ═════════════════════════
               Зеркало `mark ▸` на том же месте и той же меры (`DOOR`): там кладут, здесь
               снимают. Жест не удаляет ничего — картинка остаётся на карточке и в этом ряду,
               дальше её дверь снова `mark ▸`. Без права записи — погашенная дверь со словом,
               как у соседей (`INERT_DOOR`). */
            writesOff ? (
              <InertDoor
                className={INERT_DOOR}
                label='unmark ▸'
                reason={
                  disabled
                    ? 'this card is read-only for you — emptying a side is an edit of the card'
                    : 'this server does not answer the design routes'
                }
              />
            ) : (
              <span data-unmark-held={picture.id || undefined} className='flex w-full'>
                <Button
                  variant='secondary'
                  size='xs'
                  className={DOOR}
                  disabled={marking === (picture.id ?? 0)}
                  aria-label={`unmark render ${picture.ordinal ?? ''} from ${away.where}`}
                  title={`unmark — empty ${away.where}; the render stays on the card. ${
                    away.colorwayId === COLORWAY_NONE
                      ? 'SIDES draws no sample column while the card has colourways'
                      : `SIDES draws no column for ${colourwayName(away.colorwayId)}`
                  }`}
                  onClick={() => unmarkHeld(picture, away.colorwayId, away.side)}
                >
                  unmark ▸
                </Button>
              </span>
            )
          ) : held ? (
            <span
              data-mark-held={picture.id || undefined}
              title={
                `this render already stands in a slot of this card, and one plate stands in one slot: ` +
                `the server refuses a second placement outright. Empty that side first — the ✕ on its ` +
                `plate in FABRIC RENDER SLOTS.`
              }
              /* ⚠ САМЫЙ ЗАМЕТНЫЙ «СКАЧОК» РЯДА, И ОН БЫЛ У ЧИТАЕМОЙ ПЛАШКИ, А НЕ У КНОПКИ.
                 `Pill` — `inline-flex` по содержимому и 19px высотой (`py-px` без класса
                 высоты): в ряду, где каждый сосед занимает всю ширину ячейки и ровно 20px, она
                 сидела короткой и прижатой влево, и это читалось как «здесь что-то не
                 дорисовалось». Ширину даёт обёртка (`flex w-full` — сам `span` с `title` был
                 `inline`, то есть шириной по тексту), высоту и центровку — три класса на самой
                 плашке. Слово и тон не трогаются: это по-прежнему статус, а не дверь. */
              className='flex w-full'
            >
              <Pill className='h-5 w-full justify-center leading-4'>
                in {viewLabel((held.viewKey ?? '').trim()) || 'a slot'}
              </Pill>
            </span>
          ) : composite ? (
            /* ═══ У ЛИСТА ДВЕРЬ ЖИВАЯ, И ЭТО ПОЧИНКА, А НЕ УКРАШЕНИЕ ══════════════════════
               Здесь стояла ПОГАШЕННАЯ дверь «split first ▸», чья причина отправляла человека
               «к угловой кнопке этой плитки». Угол — ТИХИЙ орган: он появляется по наведению,
               то есть отказ называл орган, которого на экране не видно. Дверь, объясняющая,
               куда пойти, вместо того чтобы туда вести, — самый дорогой вид мёртвого контрола:
               она занимает то самое место, где нужный жест и ожидается.
               Теперь глагол один и он исполним отсюда. «Почему нельзя пометить лист» переехало
               в `title` — это ответ на вопрос, который человек задаёт ПОСЛЕ, а не вместо. */
            writesOff ? (
              <InertDoor
                className={INERT_DOOR}
                label='split ▸'
                reason={
                  disabled
                    ? 'this card is read-only for you — cutting a sheet writes new pictures onto the card'
                    : 'this server does not answer the design routes'
                }
              />
            ) : (
              <span data-split-for={picture.id || undefined} className='flex w-full'>
                <Button
                  variant='secondary'
                  size='xs'
                  className={DOOR}
                  onClick={onSplit}
                  title='one sheet with several views glued into it, and a side holds ONE view. Cut it into frames here, then put them into their sides below'
                >
                  split ▸
                </Button>
              </span>
            )
          ) : writesOff ? (
            <InertDoor
              className={INERT_DOOR}
              label='mark ▸'
              reason={
                disabled
                  ? 'this card is read-only for you — putting a render into a side is an edit of the card'
                  : 'this server does not answer the design routes'
              }
            />
          ) : (
            /* ═══ ОДИН ОРГАН — ДВА ВОПРОСА ПО ОДНОМУ: «ЧЕЙ СТОЛБЕЦ», ПОТОМ «КАКАЯ СТОРОНА» ══
               Владелец по бете: «надо спросить колорвей сначала, потом уже сторону — сейчас в
               пикере очень много всего и это не читается вообще».

               ⚠ ЭТО ПО-ПРЕЖНЕМУ ОДНА ДВЕРЬ, И ЭТО ГЛАВНОЕ. Здесь стояла записка «второго
               уровня кнопок нет намеренно: два органа на один жест — ровно то, чего владелец
               просил не делать», и она ОСТАЁТСЯ ВЕРНОЙ: в ряду плитки как была одна кнопка
               `mark ▸`, так и осталась, и открывает она одну панель. Разведены не ОРГАНЫ, а
               ВОПРОСЫ внутри одной панели — шаг 1 показывает столбцы, шаг 2 стороны выбранного,
               строкой-«назад» с его именем. Ветка одна (обычный случай без флага и всякая
               плита именованного колорвея) — шага 1 нет вовсе, и жест не удлинился ни на одно
               нажатие.

               Состав целей считает `markBranches` (ниже, в теле раздела) — те же три правила
               зеркала сервера, что и до правки. Орган — `TwoStepPicker` из `../core`. */
            <span data-mark-for={picture.id || undefined} className='flex w-full'>
              {(() => {
                /* ⚠ ЛИЦО У ВСЕХ ПЛИТОК ОДНО — `mark ▸`, И СУЖЕНИЯ ПОСЛЕ РОЖДЕНИЯ ЦВЕТА НЕТ
                   (r3-w2 №5; разбор на месте снятого `markScope` выше). Теперь оно ещё и НЕ
                   МОЖЕТ появиться: дверь не держит значения вовсе — она задаёт два вопроса и
                   забывает оба при закрытии.

                   ЧЕМ КОНЧАЕТСЯ ЖЕСТ РОЖДЕНИЯ. `+ colourway…` закрывает панель, открывает
                   модалку рождения и передаёт ей ПРОДОЛЖЕНИЕ: как только колорвей заведён
                   (`onCreated` резолвится после `invalidateQueries`, то есть список веток уже
                   пересобран), панель открывается снова и сразу на сторонах нового столбца.
                   Второго нажатия больше не нужно. */
                /* O-57 r4: ВСТАТЬ НЕКУДА И ЗАВЕСТИ НЕЧЕГО — дверь погашена общим органом
                   студии (`InertDoor`: вне порядка Tab, причина в `title`), а словами причина
                   стоит один раз над полосой — записка, на которую дверь ссылается
                   `describedBy` (разбор у `REFUSAL_NOTES`). */
                const refused = markRefusal(picture);
                if (refused)
                  return (
                    <InertDoor
                      className={INERT_DOOR}
                      label='mark ▸'
                      reason={refused}
                      describedBy={noteIdOf(refused)}
                    />
                  );
                const branches = markBranches(picture);
                /* O-57 r2: ПОЧЕМУ ВЕТОК НЕТ — у семпл-плиты рядом с колорвеями, когда все
                   столбцы архивные (`destinationsOf`). Дверь жива ради `+ colourway…`, и фраза
                   стоит на шаге 1 над строкой рождения. */
                const nowhere = destinationsOf(colorwayOf(picture)).refusal;
                const canCreate = createsColourwayFor(picture);
                /* ⚠ ПОДПИСЬ ДВЕРИ ЧИТАЕТ ТО ЖЕ ПРАВИЛО, ЧТО И САМА ПАНЕЛЬ: шаг 1 есть, когда
                   есть из чего выбирать, а `+ colourway…` — тоже выбор. Второе написание этого
                   условия обещало бы «сразу сторона» там, где панель спросит столбец. */
                const asksColourway = branches.length > 1 || canCreate;
                return (
                  <TwoStepPicker
                    face='mark ▸'
                    title='mark into'
                    branchNoun='colourways'
                    leafNoun='sides'
                    branches={branches}
                    emptyReason={nowhere ?? undefined}
                    disabled={marking === (picture.id ?? 0)}
                    triggerTitle={
                      nowhere
                        ? nowhere
                        : asksColourway
                          ? 'put this render into a side — the colourway first, then the side'
                          : `put this render into a side of ${branches[0]?.label ?? ''}`
                    }
                    /* ⚠ МЕТРИКА РЯДА ОТДАЁТСЯ СНАРУЖИ, КАК У ВСЕХ СОСЕДЕЙ (F-9): триггер
                       поповера — это САМА `<button>`, и `DOOR` садится на неё тем же классом,
                       что на `split ▸` и `expand ▸`. Прежний селект приходилось приводить к
                       этой мере тремя чужими правилами (`min-h-0`, `py-0`, свой кегль), потому
                       что под ним стояло поле ввода; кнопке приводить нечего. */
                    triggerClassName={DOOR}
                    create={
                      /* ЧЕТВЁРТАЯ ДВЕРЬ ОДНОЙ КОМНАТЫ — тем же окном, что заголовок
                         `+ colourway` в SIDES и цель `apply splitted`. */
                      canCreate && onCreateColorway
                        ? { face: '+ colourway…', open: (then) => onCreateColorway(then) }
                        : undefined
                    }
                    onPick={(target, view) => markInto(picture, target, view)}
                  />
                );
              })()}
            </span>
          )}
        </div>
      }
    />
  );
}

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
  return <RenderStepContext.Provider value={step}>{children}</RenderStepContext.Provider>;
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
 */
export function useRenderHost(rep: Representation | null): RenderHost | null {
  const host = useContext(RenderHostContext);
  return host && rep === 'render' ? host : null;
}

/**
 * …AND WHETHER THIS PLATE OF IT DOES. A plate with the old hidden stamp keeps the history's own tile
 * (its «hidden» word, pickers and slots skip it, T-14). ONE predicate for the tile (`RunTile`) and
 * for its deck (`RunOutputs`, `hostDoor`): the deck's own door goes exactly where `expand ▸` comes.
 */
export function renderHostOf(
  host: RenderHost | null,
  picture: common_DesignPicture,
): RenderHost | null {
  return host && !isPictureHidden(picture) ? host : null;
}

/**
 * WHAT A HOST SHOWS, FOR ITS DOORS — every plate its rows draw, pieces of folded decks too (the notes
 * read them all), and each sheet's pieces; the rows' own plans (`outputPlan`), so the doors and the
 * grid can never disagree about a deck. Hidden plates are not the doors' (`renderHostOf`).
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
 * A HOST OF RUN TILES WITH RENDER DOORS — the workbench under GENERATE. ONE `useRenderDoors` over
 * every plate it shows, as RENDERS OF THIS CARD had one over its strip, and the notes of its refused
 * doors printed ONCE above the tiles (D-56′). Off FABRIC RENDER (no `RenderStepScope` above) it is
 * a plain fragment, and the tiles below draw as they always did.
 */
export function RenderDoorsHost(props: RenderDoorsHostProps): JSX.Element {
  const step = useContext(RenderStepContext);
  if (!step) return <>{props.children}</>;
  return <RenderDoorsHostOn {...props} step={step} />;
}

type RenderDoorsHostProps = {
  band: GetDesignBandResponse;
  techCardId: number;
  /** The card is read-only for this person — NOT the server's silence, which the doors read themselves. */
  disabled?: boolean;
  /** `hostPlates` of the rows it draws. */
  pictures: readonly common_DesignPicture[];
  membersOf: ReadonlyMap<number, common_DesignPicture[]>;
  openDeck: number | null;
  onDeck: (rootId: number) => void;
  runOf: (picture: common_DesignPicture) => common_DesignRun;
  /** Spacing of the notes above the tiles — drawn only when there are any. */
  notesClassName?: string;
  children: ReactNode;
};

function RenderDoorsHostOn({
  step,
  band,
  techCardId,
  disabled,
  pictures,
  membersOf,
  openDeck,
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
    openDeck,
    /* A run's row is not the card's `outputs` list: no horizon on its tiles. */
    horizon: false,
  });
  const host: RenderHost = { doors, runOf, onDeck };
  return (
    <RenderHostContext.Provider value={host}>
      <RefusalNotes doors={doors} className={notesClassName} />
      {children}
    </RenderHostContext.Provider>
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
        runLine={false}
        onZoom={onZoom}
        onDeck={() => host.onDeck(pictureId)}
        onEdit={onEdit}
        onSplit={onSplit}
      />
      {children}
    </div>
  );
}
