import { common_DesignPicture, common_MediaFull } from 'api/proto-http/admin';
import { MediaRecropDialog } from 'components/managers/media/components/media-recrop-dialog';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import type { CropFrame } from 'lib/features/getCropped';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useController, useFormContext, useWatch } from 'react-hook-form';
import { AiEnhance } from 'ui/components/ai-enhance';
import { noteArrowsOf } from 'ui/components/annotation/surface';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { FocusedAnnotator, type FocusedView } from 'ui/components/focused-annotator';
import { Section, SectionStack } from 'ui/components/section';
import { HeaderNote } from 'ui/components/section-header';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { FoldCaret } from 'ui/components/fold-caret';
import { FIELD_REVEAL_EVENT, type FieldRevealDetail } from 'utils/field-errors';
import { create } from 'zustand';

import type { TechCardFormData } from '../schema';
import { CalloutRail, type CalloutRailRow } from './callout-rail';
import { serverSpeaksDesign } from './capability';
import { GROUP_SEAM } from './core';
import { cardFactsContext } from './core/card-facts';
import { flushAllowsRun, flushRefusalSentence, useTechCardAutosave } from './autosave-contract';
import { carryReferenceRole } from './carry-reference';
import { DraftedField } from './core/drafted-field';
import { useGenerationWrites } from './generation/use-generation';
import { isBoardRow, isInputRow, REFERENCE_KIND } from './core/mood-gate';
import { draftedKey, useDrafted } from './drafted-contract';
import { useCardFacts } from './head/card-facts-form';
import { ConstructionDraft } from './head/construction-draft';
import { useAcceptOnEdit } from './head/drafted-provider';
import { holdFlatInput, readFlatInput, rowsWritable } from './flat-input';
import { DraftedPill } from './head/mood-organs';
import { VectorModal } from './modals';
import { useMoodCallouts, type MoodCallout } from './mood-callouts';
import { MoodQuiz } from './mood-quiz';
import { TILE_CORNER, TILE_QUIET } from 'ui/components/tile-skin';
import { CornerMenu } from './picture-tile';
import { CalloutsPanel, useCalloutsPanel } from './callouts-panel';
import {
  cardOnScreen,
  newClientRequestId,
  useDesignBand,
  useDesignWrites,
} from './use-design-band';

/**
 * МУДБОРД — первый пункт процесса и единственная доска, которую человек наполняет руками.
 *
 * ЧТО ЗДЕСЬ ЛЕЖИТ И ГДЕ ОНО ЖИВЁТ. Плитки — это `moodboardMedia` ДОКУМЕНТА (карточка знает свои
 * картинки и без полосы DESIGN); указания на плитках — `callouts` того же документа, отфильтрованные
 * по мудбордным `media_id` (см. `./mood-callouts`); записка доски — `concept` (V-16: «CONCEPT &
 * CONSTRUCTION DESCRIPTION это и есть SHARED NOTE», редактор ровно один и стоит здесь), легаси
 * `moodNote` показывается read-only до слияния или сноса. Полоса DESIGN сюда не приходит вовсе, и
 * подпись органа это утверждает: доска не зависит от того, отвечает ли сервер новые маршруты.
 *
 * ПОЧЕМУ ЭТО НЕ ПРОМПТ. Мудборд читает человек и черновик идеи; в генерацию не уходит ничего
 * (`B2`). Оговорка стоит прямо в подписи блока, потому что «картинки, которые я собрал» и «картинки,
 * которые увидит модель» — два разных предмета, и второй живёт в блоке референсов ниже.
 *
 * ДОСКА И ВХОД — ДВА СПИСКА, А НЕ ОДИН СПИСОК С ЯРЛЫКОМ (U-5). Один массив `moodboardMedia` держит
 * обе половины, но РАЗДЕЛЬНЫМИ СТРОКАМИ: строка со `kind = REFERENCE` принадлежит входу и на доске
 * не рисуется НИКОГДА, всё остальное — доска. Раньше это был один ярлык на одной строке, и смена
 * ярлыка уносила картинку с доски вместе с её указаниями: они адресуются по `media_id`, но рисуются
 * только на кадре, а кадра больше не было. Теперь плитку берут во вход ЖЕСТОМ (см. `takeIntoInput`),
 * который заводит ВТОРУЮ строку на тот же `media_id`: доска сохраняет и плитку, и указания, а вход
 * получает собственную запись со своей ролью и своей запиской.
 *
 * ✕ ПЛИТКИ — ЕДИНСТВЕННАЯ НЕВОЗВРАТНАЯ ДВЕРЬ ВО ВСЕЙ ПОЛОСЕ, поэтому она называет цену вслух
 * (Г1/R7): сколько указаний умрёт вместе с плиткой — они не живут больше нигде. Молчащий ✕ уже
 * стоил звонка «а куда делись мои пометки на мудборде».
 */

/**
 * Потолок поля `concept` — ЕДИНСТВЕННОЕ НАПИСАНИЕ ЭТОГО ЧИСЛА В ПОЛОСЕ, и живёт оно у редактора
 * поля: `maxLength` textarea ниже, проверка `takeLegacyNote` рядом с ней и черновик construction
 * (которому число передаётся пропом) читают ОДНУ константу. Два разных потолка на одно поле — это
 * способ молча потерять хвост описания на том из них, который меньше.
 *
 * Раньше число стояло в `head/mood-draft.tsx`, а редактор поля — здесь: файл, где поля нет, владел
 * его пределом. `MoodDraft` снесён вместе с прозаическим черновиком (фича 9), и предел вернулся к
 * своему полю.
 */
export const CONCEPT_MAX = 2000;

/**
 * ПИКЕРА mood/swatch НА ПЛИТКЕ БОЛЬШЕ НЕТ (слова владельца: «пикер mood & swatch не нужны в
 * мудборде») — вместе с ним умерли `BOARD_KINDS`/`KIND_ITEMS`/`kindOf`/`setKind`. Новые плитки
 * рождаются `MOODBOARD`; ярлык ничего не делил и ничего не гейтил, он только просил выбора.
 * СТАРЫЕ swatch-строки ПРИ ЭТОМ ЖИВЫ: `isBoardRow` (`core/mood-gate.ts`) определён отрицанием
 * входа, а не списком видов, поэтому строка с любым не-REFERENCE видом рисуется на доске как
 * рисовалась — снятие пикера не имеет права терять чужие данные с экрана.
 */

/**
 * Потолок доски (счёта в шапке нет с item 35). Дверь добавления существует ВСЕГДА и при
 * полной доске честно отказывает словами, а не исчезает (Д19): исчезнувшая дверь читается как
 * «добавлять сюда нельзя вообще», и человек идёт искать её в другом месте.
 */
export const MOOD_MAX = 12;

/**
 * Потолок ВХОДА — свой, а не общий с доской. Общий потолок означал, что двенадцатая картинка на
 * доске запрещала тринадцатую в промпте и наоборот: два разных предмета делили одно число, и
 * отказ говорил про доску там, где человек наполнял вход. Число то же, счёт раздельный.
 */
export const INPUT_MAX = 12;

/** Одна строка `moodboardMedia` как её видит форма. Мудборд и референсы правят ОДИН этот список. */
export type BoardItem = NonNullable<TechCardFormData['moodboardMedia']>[number];

/**
 * Строка ВХОДА и строка ДОСКИ — правило части (a) минимума, и живёт оно там же, где минимум
 * (`core/mood-gate.ts`, раунд 4): черновик, которого доска монтирует, читает его после `await`, и
 * импорт отсюда завёл бы цикл. Здесь — реэкспорт для прежних читателей, второго написания нет.
 */
export { isBoardRow, isInputRow, REFERENCE_KIND };

/**
 * ВЗВЕДЁННЫЙ ВЫБОР ПЛИТКИ — единственное состояние, которое делят два соседних блока: ссылку
 * «or from the moodboard» жмут в РЕФЕРЕНСАХ, а выбирают на ДОСКЕ. Ни один из блоков не может им
 * владеть — доска не знает про вход, вход не рисует плиток доски, — а общего родителя править
 * нельзя (`studio-tab.tsx` принадлежит другой задаче). Поэтому состояние живёт здесь, вне обоих
 * деревьев, ровно как соседний `pick-mode.tsx` для верстака.
 *
 * Не в форме и не в React Query: это не свойство карточки, и оно ОБЯЗАНО умирать на Esc и при
 * уходе со страницы. Взвод, переживший перезагрузку, — это карточка, которая выглядит сломанной
 * по причине, которую не объясняет ни одно поле.
 */
type InputPickState = { armed: boolean; arm: () => void; disarm: () => void };
export const useInputPick = create<InputPickState>((set) => ({
  armed: false,
  arm: () => set({ armed: true }),
  disarm: () => set({ armed: false }),
}));

/**
 * Приём картинок в ОДИН из двух ящиков карточки — общая функция на обе двери («+ picture» здесь и
 * «+ reference» в блоке референсов). Чистая: форму она не знает, вызывающий передаёт живой список
 * и получает новый.
 *
 * Заведена общей не для красоты: два отдельных приёма разошлись бы по трём правилам сразу — по
 * дедупликации против ВТОРОГО списка карточки (`technicalMedia`), по потолку и по словам отказа.
 * Разъехавшись, они дали бы дубль медиа, который стоит формуле дайджеста дороже, чем весь блок.
 *
 * ДЕДУПЛИКАЦИЯ СЧИТАЕТСЯ ПО ЯЩИКУ, А НЕ ПО ВСЕМУ СПИСКУ. Одна картинка ИМЕЕТ ПРАВО стоять и на
 * доске, и во входе — это ровно тот жест, ради которого вход отделили; чего она не имеет права —
 * стоять в своём ящике дважды.
 */
export function appendBoardPictures(input: {
  /** Весь `moodboardMedia`: он и возвращается, чтобы соседний ящик не пострадал. */
  live: BoardItem[];
  /** Какие строки принадлежат ящику, куда кладут. */
  inScope: (item: BoardItem) => boolean;
  /** id второго списка карточки (`technicalMedia`): медиа не имеет права стоять в обоих. */
  otherListIds: number[];
  added: common_MediaFull[];
  kind: string;
  max: number;
  /** Как ящик зовут в словах отказа — «board» или «input». */
  scopeLabel: string;
}): { next: BoardItem[]; accepted: common_MediaFull[]; refusal: string | null } {
  const scoped = input.live.filter(input.inScope);
  const taken = new Set<number>([...scoped.map((i) => i.mediaId), ...input.otherListIds]);
  const fresh = input.added.filter((it) => it.id != null && !taken.has(it.id));
  if (!fresh.length) return { next: input.live, accepted: [], refusal: null };

  const room = input.max - scoped.length;
  if (room <= 0) {
    return {
      next: input.live,
      accepted: [],
      refusal: `the ${input.scopeLabel} is full — ${input.max} of ${input.max}; remove a picture first`,
    };
  }
  const accepted = fresh.slice(0, room);
  return {
    next: [
      ...input.live,
      ...accepted.map((it) => ({ mediaId: it.id as number, kind: input.kind, caption: '' })),
    ],
    accepted,
    refusal:
      accepted.length < fresh.length
        ? `only ${accepted.length} of ${fresh.length} fit — the ${input.scopeLabel} holds ${input.max}`
        : null,
  };
}

/**
 * Плитка доски заводит СВОЮ запись во входе: строка новая, `media_id` тот же, плитка остаётся на
 * месте вместе со всеми своими указаниями. Второй записи на тот же `media_id` во входе не бывает —
 * роль хранится в полосе по `media_id`, и двум записям её было бы нечем различить.
 */
export function takeIntoInput(
  live: BoardItem[],
  mediaId: number,
): { next: BoardItem[]; refusal: string | null } {
  const input = live.filter(isInputRow);
  if (input.some((i) => i.mediaId === mediaId)) {
    return { next: live, refusal: 'this picture is already in the input' };
  }
  if (input.length >= INPUT_MAX) {
    return {
      next: live,
      refusal: `the input is full — ${INPUT_MAX} of ${INPUT_MAX}; remove a reference first`,
    };
  }
  return { next: [...live, { mediaId, kind: REFERENCE_KIND, caption: '' }], refusal: null };
}

/**
 * Кроп плитки (T01): кадрированная копия встаёт НА МЕСТО оригинала в ряду доски — та же позиция,
 * тот же вид строки и та же подпись; меняется только `media_id`. Оригинал не удаляется: он остаётся
 * в библиотеке. Запись входа — отдельная строка (U-5), её переносит `planBoardCrop`, не эта функция.
 * Если копия уже стоит на доске, строка оригинала просто уходит — дубля в ящике не бывает.
 */
export function swapBoardPicture(live: BoardItem[], fromId: number, toId: number): BoardItem[] {
  if (fromId === toId) return live;
  const already = live.some((i) => isBoardRow(i) && i.mediaId === toId);
  return already
    ? live.filter((i) => !(isBoardRow(i) && i.mediaId === fromId))
    : live.map((i) => (isBoardRow(i) && i.mediaId === fromId ? { ...i, mediaId: toId } : i));
}

/** A point of the SOURCE (fractions) as it stands in the source turned by `rotation` (clockwise). */
function turnPoint(x: number, y: number, rotation: number): { x: number; y: number } {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { x: 1 - y, y: x };
    case 180:
      return { x: 1 - x, y: 1 - y };
    case 270:
      return { x: y, y: 1 - x };
    default:
      return { x, y };
  }
}

const CROP_EDGE = 0.001;
const fraction = (v?: string, fallback = 0.5) => {
  const n = parseFloat(v ?? '');
  return Number.isNaN(n) ? fallback : n;
};

/**
 * The callouts of `fromId` carried into its crop `toId`: every point is mapped from the source into
 * the crop's frame; a callout with any point outside the crop is left out of `next` and counted in
 * `dropped` (it would point at something the crop no longer shows) — `planBoardCrop` then keeps the
 * original instead of losing the note; a label is kept inside the frame. Other rows untouched.
 */
export function remapCalloutsIntoCrop(
  callouts: readonly MoodCallout[],
  fromId: number,
  toId: number,
  frame: CropFrame,
): { next: MoodCallout[]; dropped: number } {
  const into = (x: number, y: number) => {
    const t = turnPoint(x, y, frame.rotation);
    return { x: (t.x - frame.x) / frame.w, y: (t.y - frame.y) / frame.h };
  };
  const inside = (p: { x: number; y: number }) =>
    p.x >= -CROP_EDGE && p.x <= 1 + CROP_EDGE && p.y >= -CROP_EDGE && p.y <= 1 + CROP_EDGE;
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  let dropped = 0;
  const next: MoodCallout[] = [];
  for (const c of callouts) {
    if ((c?.mediaId ?? 0) !== fromId || fromId <= 0) {
      next.push(c);
      continue;
    }
    const label = into(fraction(c.posX), fraction(c.posY));
    const points = (c.points ?? []).map((pt) => into(fraction(pt.x, 0), fraction(pt.y, 0)));
    const anchors = points.length ? points : [label];
    if (!anchors.every(inside)) {
      dropped++;
      continue;
    }
    next.push({
      ...c,
      mediaId: toId,
      posX: clamp01(label.x).toFixed(3),
      posY: clamp01(label.y).toFixed(3),
      points: points.map((p) => ({ x: clamp01(p.x).toFixed(4), y: clamp01(p.y).toFixed(4) })),
    });
  }
  return { next, dropped };
}

/**
 * ═══ КРОП ПЛИТКИ ДОСКИ — ЧТО ПРОИСХОДИТ СО ВСЕМ, ЧТО СТОИТ НА ОРИГИНАЛЕ (03.10, gate FX2) ═══════
 *
 * Owner item 1 + Q1 («заменю»): the crop REPLACES the original — on the board, AND in the input when
 * the original is there (the person crops in order to generate from the crop), so the `in the input`
 * pill and GENERATE both follow it. The server-side role moves separately (`carryReferenceRole`).
 *
 *   · `frame` known (the recrop dialog reports where the cut fell) and EVERY callout of the original
 *     maps fully into it: `replace`; the callouts move into the crop (`remapCalloutsIntoCrop`).
 *   · `frame` unknown, or ANY callout has a point outside the crop: the operator's notes cannot all
 *     follow, and a note is never dropped — the original stays with all its callouts untouched and
 *     the crop goes right after it (`next-to`). On a FULL board that has no room: `refused` —
 *     nothing changes and the caller says so; neither the crop nor a note is lost silently.
 *   · `frame` unknown, no callouts: `replace`.
 * `moveInput` false (the input is busy with a run or a clear) leaves the input row on the original.
 */
export function planBoardCrop(input: {
  live: BoardItem[];
  callouts: readonly MoodCallout[];
  fromId: number;
  toId: number;
  frame?: CropFrame;
  moveInput: boolean;
  boardMax: number;
}): {
  mode: 'replace' | 'next-to' | 'refused';
  items: BoardItem[];
  callouts: readonly MoodCallout[];
  inputMoved: boolean;
} {
  const { live, callouts, fromId, toId, frame } = input;
  const notes = callouts.filter((c) => (c?.mediaId ?? 0) === fromId && fromId > 0).length;
  const frameOk = !!frame && frame.w > 0 && frame.h > 0;
  // Замена — только если КАЖДОЕ указание целиком переносится в рамку; иначе оригинал остаётся.
  const remapped =
    notes > 0 && frameOk ? remapCalloutsIntoCrop(callouts, fromId, toId, frame) : null;
  const carried = remapped && remapped.dropped === 0 ? remapped.next : null;
  let items: BoardItem[];
  let nextCallouts = callouts;
  let mode: 'replace' | 'next-to' | 'refused' = 'replace';
  if (notes > 0 && !carried) {
    const board = live.filter(isBoardRow);
    if (board.some((i) => i.mediaId === toId)) {
      items = live;
    } else if (board.length >= input.boardMax) {
      return { mode: 'refused', items: live, callouts, inputMoved: false };
    } else {
      const at = live.findIndex((i) => isBoardRow(i) && i.mediaId === fromId);
      items = [...live];
      items.splice(at < 0 ? items.length : at + 1, 0, {
        mediaId: toId,
        kind: 'TECH_CARD_MEDIA_KIND_MOODBOARD',
        caption: '',
      });
    }
    mode = 'next-to';
  } else {
    items = swapBoardPicture(live, fromId, toId);
    if (carried) nextCallouts = carried;
  }
  let inputMoved = false;
  if (input.moveInput && fromId !== toId) {
    const inputAt = items.findIndex((i) => isInputRow(i) && i.mediaId === fromId);
    if (inputAt >= 0 && !items.some((i) => isInputRow(i) && i.mediaId === toId)) {
      items = items.map((i, n) => (n === inputAt ? { ...i, mediaId: toId } : i));
      inputMoved = true;
    }
  }
  return { mode, items, callouts: nextCallouts, inputMoved };
}

/**
 * ═══ БОКОВОЕ МЕНЮ УКАЗАНИЙ ДОСКИ — ТЕПЕРЬ ТОТ ЖЕ ОРГАН, ЧТО У ЛИСТА (B-9, круг 20) ═══════════════
 *
 * Владелец, дословно: «в мудборде все управление колаутами должно было переехать в панель слева
 * как в артифактах логика должна там быть такая-же и не должно быть этой брови над картинками "no
 * callout selected — click a note or a line on a frame · Backspace deletes it · Enter opens this
 * editor" все только в правом блоке».
 *
 * ЧТО СТОЯЛО ЗДЕСЬ ДО ЭТОГО КРУГА. Кругом 18 (D-27) доска получила СВОЁ меню — «временный орган из
 * общих примитивов», чья собственная подпись честно перечисляла, чего в нём нет: выбора по клику,
 * подсветки по наведению и правки. Причина была названа там же: у `FocusedAnnotator` не было
 * управляемых пропов, а меню ARTIFACTS переписывалось соседней волной, и копировать его тело
 * значило завести два расходящихся места. Обе причины кончились: пропы есть
 * (`selectedKey`/`onSelectedChange`, `hoveredKey`, `addingKey`), а тело меню ИЗВЛЕЧЕНО в
 * `./callout-rail` и монтируется обоими экранами. Долг, названный подписью D-27, закрыт.
 *
 * ЧТО ИЗ ЭТОГО СЛЕДУЕТ ДЛЯ ДОСКИ, ПО ПУНКТАМ ВЛАДЕЛЬЦА:
 *   · выбор — клик по строке меню выбирает указание НА КАДРЕ, и наоборот (один `selectedKey`);
 *   · Backspace — слушатель окна у самой поверхности (`annotation/surface.tsx`), он и был там;
 *   · Enter — тот же слушатель просит фокус, и просьба доезжает до меню через `opts.focus`,
 *     который панель превращает в `focusToken`;
 *   · «бровь» над картинками не рисуется вовсе: `renderEditor` доске больше не передаётся, а без
 *     него полосы редактора под кадрами нет — ни правки, ни её пустого состояния (см. довод в
 *     `ui/components/focused-annotator.tsx`);
 *   · увеличенного вида у доски нет (T01, 03.10: «на ховер плиток картинок не надо показывать
 *     кнопку зум»), поэтому и `renderZoomEditor` доска больше не задаёт — правка указаний живёт
 *     только в меню справа.
 *
 * ⚠ ПИКТОГРАММА ВИДА ТЕПЕРЬ ОБЩАЯ (`KindGlyph` реестра), И ЭТО ОБМЕН, СДЕЛАННЫЙ СОЗНАТЕЛЬНО.
 * Здесь стоял свой `CalloutGlyph` — САМА фигура, нарисованная общим `CalloutShape` в 22×14, со
 * своим цветом, пунктиром и наконечниками. Он был богаче, и его не жалко ровно по одной причине:
 * владелец потребовал «логика должна там быть такая-же», а две пиктограммы на один вопрос «что
 * это за указание» — это и есть два словаря видов, от которых уходил весь этот файл. Победил тот,
 * что уже стоит в ARTIFACTS.
 */
/*
 * ═══ ПРАВКА КАРТИНКИ ДОСКИ ПО НАВЕДЕНИЮ (C-3, круг 18) ═══════════════════════════════════════
 *
 * Владелец, дословно: «MOODBOARD — должна быть возможность редактировать на ховер картинки».
 *
 * ЗАМЕРЕНО ДО ПРАВКИ: по наведению на плитку доски не происходило ничего — в её углу всегда стояли
 * `zoom` и `✕` (органы кадра, не тихие), а двери «править картинку» у доски не было вовсе. Во всей
 * полосе DESIGN «edit» на картинке означает одно: открыть редактор (`VectorModal`) на этой
 * картинке — так у истории прогонов, у плит листа (K-7) и у верстака. Доска была единственной
 * поверхностью с картинками без этой двери; вторая сущность здесь не выдумывается.
 *
 * ДВЕРЬ ТИХАЯ — ПОЯВЛЯЕТСЯ ПО НАВЕДЕНИЮ ИЛИ ФОКУСУ ВНУТРИ ПЛИТКИ И ВСЕГДА НА УСТРОЙСТВЕ БЕЗ
 * НАВЕДЕНИЯ — `TILE_QUIET` и `TILE_CORNER`, как у каждой плитки админки (T17). Здесь стояла своя
 * формула через `:hover > &` и ручные `absolute bottom-2`: у плитки галереи не было `group`, а
 * нижнего ряда органов — у её API. Теперь оба есть (`tileCorners` у `FocusedAnnotator`).
 *
 * РЕЗУЛЬТАТ ПРАВКИ ВСТАЁТ НА ДОСКУ РЯДОМ С ОРИГИНАЛОМ, А НЕ ВМЕСТО НЕГО. Указания приколоты долями
 * кадра оригинала, и подмена картинки под ними увела бы каждое не туда; оригинал остаётся со своими
 * пометками, а снять его — отдельный ✕, который называет цену.
 */

/**
 * Основа редактора для картинки ДОСКИ. У доски нет картинки полосы — это медиа библиотеки, — и
 * редактору нужен ровно его файл: слой и склейка адресуются по `base_media_id`.
 * ⚠ НИ ОДНО ДРУГОЕ ПОЛЕ НЕ ВЫДУМЫВАЕТСЯ (тот же довод, что у `plateAsPicture` в
 * `artifacts-panel.tsx`): про файл известно только то, что он на доске.
 */
function pictureOfMedia(full: common_MediaFull): common_DesignPicture {
  return {
    id: undefined,
    techCardId: undefined,
    media: full,
    runId: undefined,
    batchId: undefined,
    ordinal: undefined,
    kind: undefined,
    ghostView: undefined,
    compositeViews: undefined,
    derivedFrom: undefined,
    derivation: undefined,
    sourceClass: undefined,
    mixedInput: undefined,
    layerRev: undefined,
    hiddenAt: undefined,
    hiddenBy: undefined,
    createdAt: undefined,
    selected: undefined,
    colorwayId: undefined,
    displayOnly: undefined,
    replacedBy: undefined,
    // T28 v2: undo/redo — this stand-in is in no edit chain.
    undoneAt: undefined,
    canUndo: undefined,
    canRedo: undefined,
    undoToId: undefined,
  };
}

/**
 * РОЛЬ КАРТИНКИ ДОСКИ (E3, 64-DEFERRED). Что эта картинка значит для модели: `target` — вещь,
 * которую шьём; `detail` — референс детали; `material` — ткань, цвет, фактура; `mood` — только
 * атмосфера. '' — не назначена (промпты читают как mood, на плитке ничего). Ставится из угла-меню
 * плитки, видна словом в ярлыке рядом с номером (`2 · target`) — тот же приём, что вид на эскизе.
 */
export const MOOD_ROLES = ['target', 'detail', 'material', 'mood'] as const;

/** Пишет роль в строку ДОСКИ этого медиа; строку входа с тем же id не трогает. */
export function setBoardRole(live: BoardItem[], mediaId: number, role: string): BoardItem[] {
  return live.map((i) => (isBoardRow(i) && i.mediaId === mediaId ? { ...i, role } : i));
}

export function MoodBoard({
  techCardId,
  disabled,
}: {
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();

  const all = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as BoardItem[];
  const items = useMemo(() => all.filter(isBoardRow), [all]);
  const inputIds = useMemo(() => new Set(all.filter(isInputRow).map((i) => i.mediaId)), [all]);
  const roleOf = useMemo(() => new Map(items.map((i) => [i.mediaId, i.role ?? ''])), [items]);
  // V-16 · ЗАПИСКА ДОСКИ — ЭТО `concept`, И НИКАКОЕ ДРУГОЕ ПОЛЕ. Владелец дословно: «CONCEPT &
  // CONSTRUCTION DESCRIPTION это и есть SHARED NOTE в MOODBOARD». По коду это были ДВА поля —
  // `moodNote` (не печатается, вне подписи DESIGN, читал только черновик) и `concept` (печатается
  // в тех-паке, входит в подпись) — и два органа над ними читались как два разных предмета.
  // Редактор теперь ровно один и пишет `concept`; `moodNote` больше не редактируется нигде.
  const concept = useController({ control, name: 'concept' });
  // Легаси-содержимое `moodNote`. Поле живёт по протоколу «отсутствует = сохрани хранимое»,
  // поэтому НЕ рисовать его — не значит стереть; но спрятать текст, который черновик всё ещё
  // читает, значило бы завести невидимый вход в промпт. Непустая легаси-записка показывается
  // ниже read-only, с двумя дверьми: забрать в описание или выбросить (обе пишут '' — команду
  // «очисти» — и орган исчезает навсегда).
  const legacyNote = (
    ((useWatch({ control, name: 'moodNote' }) as string | null) ?? '') ||
    ''
  ).trim();
  const noteId = useId();
  const bodyId = useId();

  // ЗАПИСЬ СОСТАВА ДОСКИ — ПО КОРНЮ МАССИВА, и по той же причине, что у указаний: блок референсов
  // тоже правит эти строки (он держит вторую половину того же списка), а мутаторы поля-массива
  // до соседнего читателя не доходят. Корневая запись событие эмитит.
  const writeItems = (next: BoardItem[]) =>
    setValue('moodboardMedia', next as TechCardFormData['moodboardMedia'], { shouldDirty: true });

  // Свежевыбранные медиа разрешаются локально: без этого только что добавленную картинку нельзя
  // разметить до сохранения и перезагрузки.
  const [picked, setPicked] = useState<common_MediaFull[]>([]);
  // БИБЛИОТЕКА, А НЕ `resolvedMoodboardMedia`. Подпись органа даёт только `techCardId`, карточки у
  // него нет, и это намеренно: доска не должна знать про полосу. Цена названа честно — картинка
  // старше последних пятисот файлов библиотеки не разрешится, и кадр останется в ряду пустым,
  // сохранив свои указания (`FocusedAnnotator` рисует неразрешённый кадр, а не выбрасывает его).
  const libraryMap = useMediaMap();
  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>(libraryMap);
    for (const p of picked) if (p.id != null) m.set(p.id, p);
    return m;
  }, [libraryMap, picked]);

  const moodMediaIds = useMemo(
    () => new Set(items.map((i) => i.mediaId).filter((id): id is number => !!id)),
    [items],
  );
  const callouts = useMoodCallouts(moodMediaIds);

  // ── правка картинки (C-3) ───────────────────────────────────────────────────────────────────
  //
  // Полоса читается ТОЛЬКО ради редактора: доска по-прежнему не зависит от того, отвечает ли
  // сервер её маршруты (шапка файла), и без полосы теряет одну дверь, а не себя. Ключ запроса тот
  // же, что у студии, — второго чтения полосы не возникает.
  const speaks = serverSpeaksDesign();
  const { band } = useDesignBand(techCardId);
  const [editing, setEditing] = useState<{ mediaId: number; full: common_MediaFull } | null>(null);

  const views: FocusedView[] = items.map((i) => ({
    // Ключ — сам id медиа: он уникален ПО ДОСКЕ (во входе на тот же id стоит отдельная строка,
    // но её рисует другой блок) и переживает удаление соседа, в отличие от позиции в ряду.
    key: String(i.mediaId),
    mediaId: i.mediaId,
    full: mediaById.get(i.mediaId),
  }));

  // ── как я смотрю на доску: лентой, и только ею (27.09, O-59) ──────────────────────────────────
  //
  // Владелец, дословно: «в мудборде также убери гридмод только пусть будет стрип мод». Переключателя
  // strip | grid и сетки больше нет: доска — одна лента, листается вбок. Режим жил в состоянии
  // органа и в хранилище не писался никогда — переносить и перечитывать нечего.
  //
  // ВЫСОТА КАДРА ФИКСИРОВАНА, ШИРИНА ГУЛЯЕТ (U-4). Это инверсия прежнего поведения: доска стояла
  // шириной в 300px на кадр, и высота считалась от пропорций снимка — портрет рядом с панорамой
  // давал ряд, в котором ничего не сравнивается. Кадр НЕ обрезается, поэтому пины по-прежнему
  // ложатся на снимок один в один.
  // 380 — «высоту картинок сделать чуть больше» (R-7). Раньше эти 40px были ЗАНЯТЫ у полосы
  // редактора (148 → 108), чтобы суммарная высота блока не выросла, и оба числа полагалось двигать
  // вместе. С B-9 полосы редактора под кадрами нет вовсе (правка уехала в меню справа), парного
  // числа не осталось, и все её 108px блок отдал обратно странице.
  const rowHeight = 380;

  // ── дверь добавления ────────────────────────────────────────────────────────────────────────
  function handleAddMedia(added: common_MediaFull[]): number[] {
    const result = appendBoardPictures({
      live: (getValues('moodboardMedia') ?? []) as BoardItem[],
      inScope: isBoardRow,
      otherListIds: ((getValues('technicalMedia') ?? []) as BoardItem[]).map((i) => i.mediaId),
      added,
      kind: 'TECH_CARD_MEDIA_KIND_MOODBOARD',
      max: MOOD_MAX,
      scopeLabel: 'board',
    });
    // ОТКАЗ ГОВОРИТСЯ ВСЛУХ. Дверь при полной доске остаётся на месте и объясняет себя (Д19):
    // исчезнувшая дверь читается как «сюда добавлять нельзя вообще».
    if (result.refusal) showMessage(result.refusal, 'error');
    if (!result.accepted.length) return [];
    setPicked((prev) => [...prev, ...result.accepted]);
    writeItems(result.next);
    return result.accepted.map((it) => it.id as number);
  }

  /**
   * Отредактированная картинка встаёт на доску СРАЗУ ЗА ОРИГИНАЛОМ (C-3). Приём — тот же
   * `appendBoardPictures`, что у двери «+ picture»: те же потолок, дедупликация и слова отказа;
   * меняется только место строки в ряду, потому что «рядом с тем, что правил» — единственное
   * место, где результат правки находят глазами.
   */
  function placeEditedNextTo(
    originalId: number,
    full: common_MediaFull,
    done = 'the edited picture is on the board, right after the original — the original keeps its notes',
  ) {
    const result = appendBoardPictures({
      live: (getValues('moodboardMedia') ?? []) as BoardItem[],
      inScope: isBoardRow,
      otherListIds: ((getValues('technicalMedia') ?? []) as BoardItem[]).map((i) => i.mediaId),
      added: [full],
      kind: 'TECH_CARD_MEDIA_KIND_MOODBOARD',
      max: MOOD_MAX,
      scopeLabel: 'board',
    });
    if (result.refusal) showMessage(result.refusal, 'error');
    if (!result.accepted.length) return;
    setPicked((prev) => [...prev, ...result.accepted]);
    const next = [...result.next];
    const fresh = next.pop() as BoardItem;
    const at = next.findIndex((i) => isBoardRow(i) && i.mediaId === originalId);
    next.splice(at < 0 ? next.length : at + 1, 0, fresh);
    writeItems(next);
    showMessage(done, 'success');
  }

  // ── кроп плитки (T01; 03.10, gate FX2) ──────────────────────────────────────────────────────
  //
  // Копия встаёт на место оригинала — на доске и во входе, роль на сервере переезжает за ней;
  // указания переносятся в рамку кропа, а если хоть одно не помещается — оригинал остаётся со
  // всеми указаниями, кроп встаёт за ним. Все ветви — `planBoardCrop`.
  const { setReferenceRole } = useDesignWrites(techCardId);
  const [cropping, setCropping] = useState<{ mediaId: number; full: common_MediaFull } | null>(
    null,
  );

  function placeCropped(originalId: number, full: common_MediaFull, frame?: CropFrame) {
    const toId = full.id;
    if (toId == null) return;
    const card = techCardId;
    const live = (getValues('moodboardMedia') ?? []) as BoardItem[];
    const liveCallouts = (getValues('callouts') ?? []) as MoodCallout[];
    const inInput = live.some((i) => isInputRow(i) && i.mediaId === originalId);
    // Посреди GENERATE или CLEAR вход не трогается: прогон уже снимает его (тот же замок, что у
    // кропа во входе).
    const inputFree = rowsWritable(readFlatInput(card));
    const plan = planBoardCrop({
      live,
      callouts: liveCallouts,
      fromId: originalId,
      toId,
      frame,
      moveInput: inInput && inputFree,
      boardMax: MOOD_MAX,
    });
    if (plan.mode === 'refused') {
      showMessage(
        'the board is full — the crop is in the library; the original keeps its place and notes',
        'error',
      );
      return;
    }
    setPicked((prev) => [...prev, full]);
    writeItems(plan.items);
    if (plan.callouts !== liveCallouts)
      setValue('callouts', plan.callouts as TechCardFormData['callouts'], { shouldDirty: true });

    if (plan.mode === 'next-to')
      showMessage(
        'the crop is on the board, right after the original — the original keeps its notes',
        'success',
      );
    if (inInput && !inputFree && cardOnScreen(card))
      showMessage(
        'the input is busy — a run is being saved or started; the input keeps the original',
        'error',
      );

    // РОЛЬ ВХОДА — ЗА СТРОКОЙ (J-8): сначала новому медиа, потом снять со старого.
    const carried = (band.references ?? []).find(
      (r) => r.mediaId === originalId && (r.role ?? '').trim(),
    );
    if (!plan.inputMoved || !carried) return;
    const ordinal = Math.max(
      1,
      live.filter(isInputRow).findIndex((i) => i.mediaId === originalId) + 1,
    );
    const release = holdFlatInput(card);
    void carryReferenceRole(
      setReferenceRole.mutateAsync,
      {
        role: (carried.role ?? '').trim(),
        note: carried.note ?? '',
        detailSlotId: carried.detailSlotId ?? 0,
      },
      originalId,
      toId,
      ordinal,
    )
      // Отказ сказан швом записи (`onError` мутации).
      .catch(() => {})
      .finally(release);
  }

  // ── взведённый выбор: плитка доски заводит запись во входе ──────────────────────────────────
  const pick = useInputPick();
  const readOnly = !!disabled;
  const picking = pick.armed && !readOnly;

  // Esc снимает взвод. Полоса обещает это словами, поэтому обещание должно исполняться и тогда,
  // когда фокус нигде в частности, — отсюда слушатель на документе, а не на баннере.
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        pick.disarm();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [picking, pick]);

  // Взвод не переживает уход с экрана: он не свойство карточки.
  useEffect(() => () => useInputPick.getState().disarm(), []);

  function pickIntoInput(mediaId: number) {
    const result = takeIntoInput((getValues('moodboardMedia') ?? []) as BoardItem[], mediaId);
    if (result.refusal) {
      showMessage(result.refusal, 'error');
      return;
    }
    writeItems(result.next);
    // Один жест — одна запись. Взвод снимается сразу: он назывался «pick a picture», в
    // единственном числе, и оставленный взведённым он читался бы как «жду ещё».
    pick.disarm();
    showMessage('the picture is in the input — give it a role there', 'success');
  }

  // ── ✕ плитки: цитата перед уничтожением ─────────────────────────────────────────────────────
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);
  const pendingCallouts = pendingRemove == null ? 0 : callouts.countOn(pendingRemove);
  const pendingAlsoInInput = pendingRemove != null && inputIds.has(pendingRemove);

  function confirmRemove() {
    const mediaId = pendingRemove;
    setPendingRemove(null);
    if (mediaId == null) return;
    // УКАЗАНИЯ УМИРАЮТ ВМЕСТЕ С ПЛИТКОЙ, а не открепляются. Доли кадра осмысленны только на СВОЁМ
    // снимке, номера у мудбордного указания нет, и открепившееся оно не показывается нигде — то
    // есть «сохранили» означало бы «оставили сиротой в payload». Поэтому ✕ и обязан назвать число.
    callouts.removeOn(mediaId);
    // Снимается ТОЛЬКО строка доски. Запись входа на тот же `media_id` — отдельная сущность со
    // своей ролью и своей запиской, и её сносит собственный ✕ в блоке референсов, который тоже
    // называет свою цену. Одна дверь, уносящая две вещи в разных блоках, — это дверь, о цене
    // которой человек узнаёт после.
    writeItems(
      ((getValues('moodboardMedia') ?? []) as BoardItem[]).filter(
        (i) => !(i.mediaId === mediaId && isBoardRow(i)),
      ),
    );
  }

  // ── легаси-записка → описание (V-16) ────────────────────────────────────────────────────────
  //
  // Перенос уважает потолок поля: молча обрезанное описание — это предложение, потерявшее хвост
  // без единого слова об этом. Отказ говорится вслух, текст остаётся на месте.
  function takeLegacyNote() {
    const current = ((getValues('concept') ?? '') as string).trim();
    const next = current ? `${current}\n${legacyNote}` : legacyNote;
    if (next.length > CONCEPT_MAX) {
      showMessage(
        `the note does not fit — the description holds ${CONCEPT_MAX} characters and it is already ${current.length}; shorten it first`,
        'error',
      );
      return;
    }
    setValue('concept', next, { shouldDirty: true, shouldValidate: true });
    // '' — КОМАНДА «очисти» по трёхсостоянийному протоколу поля; отсутствие значило бы «сохрани».
    setValue('moodNote', '', { shouldDirty: true });
  }

  function dropLegacyNote() {
    setValue('moodNote', '', { shouldDirty: true });
  }

  // ── колапс блока (U-3) ──────────────────────────────────────────────────────────────────────
  //
  // Стрелка стоит РОВНО ТАМ, где стоял счётчик «4 / 12», как и просил владелец, а сам счёт уехал в
  // серую оговорку рядом с именем блока: свёрнутый блок, который не говорит, сколько в нём лежит,
  // отвечает на вопрос «стоит ли разворачивать» молчанием.
  const [open, setOpen] = useState(true);
  /**
   * СВЁРНУТАЯ ДОСКА РАЗВОРАЧИВАЕТСЯ НА ПРОСЬБУ «ПОКАЖИ ПОЛЕ» (фиксап раунда 2, MIN-6). Дверь
   * рельса `description ›` и отказ по полю (`revealField`) шлют `FIELD_REVEAL_EVENT` НА ЯКОРЬ поля,
   * и он всплывает через свёрнутые обёртки — ровно этот контракт описан у `revealField`: «whichever
   * ancestor folds it listens and opens». Слушают обе свёрнутые обёртки, где стоят якоря полей:
   * DESCRIPTION (`concept`) и панель указаний (`callouts.N.description`). Без этого дверь молчала:
   * у спрятанного якоря нет коробки, и прокрутить к нему нечего.
   */
  const foldBody = useRef<HTMLDivElement>(null);
  const calloutsPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const hosts = [foldBody.current, calloutsPanel.current].filter(
      (el): el is HTMLDivElement => !!el,
    );
    const onAsk = () => setOpen(true);
    for (const el of hosts) el.addEventListener(FIELD_REVEAL_EVENT, onAsk);
    return () => {
      for (const el of hosts) el.removeEventListener(FIELD_REVEAL_EVENT, onAsk);
    };
  }, []);

  // ── боковое меню указаний (B-9) — выбор, наведение, правка ──────────────────────────────────
  //
  // ВЫБОР ЖИВЁТ ЗДЕСЬ, ОДИН НА КАДР И НА МЕНЮ. Кадр адресует указание КЛЮЧОМ поля-массива, меню —
  // ИНДЕКСОМ в форме (им идёт leaf-запись), и перевод между ними делает `useMoodCallouts`. Держать
  // по состоянию на каждую половину значило бы получить экран, где подсвечена одна строка, а горит
  // другое указание.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedRow = selectedKey ? callouts.at(selectedKey) : null;
  const selectedIndex = selectedRow?.index ?? null;
  /** Строка под курсором в меню — её же подсвечивает кадр (`hoveredKey`). Индекс, как и выбор. */
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  /** Счётчик просьб «поставь курсор в правку»: растёт РОВНО по жесту выбора, см. `CalloutRail`. */
  const [focusEditor, setFocusEditor] = useState(0);
  /** Взвод «+ point»: кнопка в меню, клик — на кадре, поэтому состояние общее и живёт здесь. */
  const [addingKey, setAddingKey] = useState<string | null>(null);

  // ЛУЧИ СЧИТАЮТСЯ ТОЙ ЖЕ ФУНКЦИЕЙ, ЧТО И У КАДРА (`noteArrowsOf`): ответ на вопрос «есть ли у
  // этого указания лучи и сколько их ещё можно» обязан совпадать на обеих половинах экрана.
  const arrows = noteArrowsOf(readOnly ? undefined : selectedRow?.value, {
    arming: addingKey !== null && addingKey === selectedKey,
    arm: () => setAddingKey(selectedKey),
    cancel: () => setAddingKey(null),
  });

  // Строки меню — в порядке доски, с номером картинки. Форма, а не вью-модель: меню правит поля.
  const railRows: CalloutRailRow[] = views.flatMap((v, i) =>
    callouts.rowsOn(v.mediaId).map((row) => ({
      index: row.index,
      c: row.value,
      where: `picture ${i + 1}`,
    })),
  );

  const canEdit = !readOnly && speaks;

  /* ═══ ПАНЕЛЬ CALLOUTS — ШИРИНА, СВЁРНУТОСТЬ, РАЗДЕЛИТЕЛЬ (волна 25.09, D-11/D-12, T12/T13) ═══════
     Весь механизм — полоска, шеврон, разделитель, жест ширины, перенос фокуса, удержание на сеанс —
     живёт в `./callouts-panel` (T14): тот же орган стоит справа от листа ARTIFACTS. */
  const calloutCount = railRows.length;
  const calloutsShell = useCalloutsPanel({
    count: calloutCount,
    holdKey: techCardId,
    panelRef: calloutsPanel,
  });
  const { collapsed, hold: holdCallouts } = calloutsShell;
  /* ОТКАЗ ПО УКАЗАНИЮ, ЧЬЯ СТРОКА ЗАКРЫТА, ТОЖЕ ДОХОДИТ ДО ПАНЕЛИ (ревью раунда 3, MIN-5). Якорь
     `callouts.N.description` стоит только у ВЫБРАННОЙ строки — правка раскрыта одна, — и отказ по
     любому другому указанию не находил ни якоря, ни свёртки, которая бы его услышала: `revealField`
     уходил в `document` и честно отвечал «нет поля». Теперь его слышит доска: строка этого указания
     выбирается, доска и панель раскрываются (на сеанс, как по Enter на кадре), и просьба
     ЗАКРЫВАЕТСЯ (`preventDefault`) — `revealField` дождётся якоря и подсветит его. Указание не с
     доски (картинка входа, лист) — не её, и просьба идёт дальше. */
  const railIndexes = useRef<ReadonlySet<number>>(new Set());
  railIndexes.current = new Set(railRows.map((r) => r.index));
  const keyOfRef = useRef(callouts.keyOf);
  keyOfRef.current = callouts.keyOf;
  useEffect(() => {
    const onAsk = (e: Event) => {
      const path = (e as CustomEvent<FieldRevealDetail>).detail?.path ?? '';
      const m = /^callouts\.(\d+)(?:\.|$)/.exec(path);
      if (!m || !railIndexes.current.has(Number(m[1]))) return;
      e.preventDefault();
      setOpen(true);
      holdCallouts();
      setSelectedKey(keyOfRef.current(Number(m[1])));
    };
    document.addEventListener(FIELD_REVEAL_EVENT, onAsk);
    return () => document.removeEventListener(FIELD_REVEAL_EVENT, onAsk);
  }, [holdCallouts]);

  // ОПИСАНИЕ — ТЕ ЖЕ ДВА ОРГАНА ВОЛНЫ, ЧТО У ПОЛЕЙ GENERAL INFORMATION: синяя рамка `drafted`,
  // пока в поле стоит текст черновика и его не приняли, и `ai ✦` в правом нижнем углу.
  const conceptValue = (concept.field.value as string | null | undefined) ?? '';
  const draftedApi = useDrafted();
  const conceptDrafted = draftedApi.isLive(draftedKey.concept, conceptValue);
  const conceptSettle = useAcceptOnEdit(draftedKey.concept, conceptValue);
  const facts = useCardFacts(isBoardRow);
  // ОТВЕТ `ai ✦` — ТОЛЬКО В ТУ КАРТОЧКУ, КОТОРАЯ ЕГО ПРОСИЛА (фиксап M5). В продукте другая карточка —
  // другой монтаж (`page.tsx` ключует её адресом, раунд 4), но ничто не мешает родителю подменить id у
  // живой доски — стенд так и делает, а запрос живёт секунды. Кнопка пересоздаётся на смене карточки
  // (`key`), а запись сверяет карточку на экране с той, чей рендер отдал колбэк.
  const shownCard = useRef(techCardId);
  shownCard.current = techCardId;
  // T39 (item 39): ПУСТОЕ ОПИСАНИЕ + КАРТИНКИ НА ДОСКЕ → `write from the board ✦`. Тот же текстовый
  // прогон `DraftDesignIdea` с `construction: false` (сервер отдаёт только описание). Сервер читает
  // СОХРАНЁННУЮ карточку — поэтому сперва `flush`. Ответ ложится в поле, ТОЛЬКО если оно всё ещё
  // пустое: набранное за время прогона не перетирается. Отказ говорит `onError` мутации (снэкбар).
  const { draftIdea: describeRun } = useGenerationWrites(techCardId);
  const autosave = useTechCardAutosave();
  const [describing, setDescribing] = useState(false);
  // T48: ссылка в плейсхолдере — только у пустого поля, при картинках на доске и не в чтении.
  const canDescribe = !readOnly && !conceptValue.trim() && items.length > 0;
  const describeFromBoard = async () => {
    const card = techCardId;
    if (readOnly || describing || !(card && card > 0)) return;
    setDescribing(true);
    try {
      let flushed: Awaited<ReturnType<typeof autosave.flush>>;
      try {
        flushed = await autosave.flush('describe');
      } catch {
        flushed = 'error';
      }
      if (!flushAllowsRun(flushed)) {
        showMessage(flushRefusalSentence(flushed, autosave.errorsCount, autosave.refusal), 'error');
        return;
      }
      const res = await describeRun.mutateAsync(newClientRequestId());
      const text = (res.run?.outputText ?? '').trim();
      if (!text || shownCard.current !== card) return;
      if (((getValues('concept') as string | null | undefined) ?? '').trim()) return;
      setValue('concept', text.slice(0, CONCEPT_MAX), { shouldDirty: true, shouldValidate: true });
    } catch {
      // Отказ уже сказан снэкбаром (`onError` в `useGenerationWrites`).
    } finally {
      setDescribing(false);
    }
  };

  /* ═══ ПОРЯДОК ЭКРАНА — МАКЕТА, БЛОК ЗА БЛОКОМ (`_step-mood.js`, RENDER['step-mood']) ═══════════
     Здесь был ОДИН блок доски, внутри которого лежали лента, описание и черновик, а справа —
     указания. Владелец, увидев бету: «не как в референсе». Макет держит ПЯТЬ отдельных блоков:

       [ MOODBOARD ……………………………………… ] [ CALLOUTS 340px ]   ← ряд: лента и панель к ней
       [ DESCRIPTION …………………………………………………………………… ]   ← слова человека, под ними
                                                            ряд прогона и ответ машины
                                                            (`head/construction-draft`)

     Между блоками грунт — сильнейший разделитель системы. Описание и черновик — ОДИН блок с T33
     (владелец 04.10: «CONSTRUCTION DRAFT объедини с DESCRIPTION на мудборде»): слова, под ними
     GENERATE, как слова и GENERATE во флэтовом INPUT — REFERENCES.

     СВОРАЧИВАНИЕ ДОСКИ уносит с собой CALLOUTS, DESCRIPTION и CONSTRUCTION DRAFT; GENERAL
     INFORMATION / CONSTRUCTION / MATERIAL SLOTS (соседи в стопке STUDIO) остаются. Описание и
     черновик ПРЯЧУТСЯ, а не размонтируются: черновик держит ответ оплаченного прогона в своём
     состоянии, и размонтировать его сворачиванием значило бы потерять ответ за один клик по
     стрелке. `hidden` на обёртке `display:contents` побеждает `contents` (preflight ставит
     `display:none !important`), а раскрытая обёртка не оставляет узла в потоке — оба блока
     остаются прямыми детьми стопки и держат её 24px грунта. */
  return (
    <>
      <SectionStack row>
        <Section
          id='mb-board'
          title='moodboard'
          /* ШОВ ОДИН НА ВЕСЬ ШАГ (r3b, M-1) — `GROUP_SEAM` из `./core`, 20px. До него блоки доски,
             указаний, описания, общих сведений и слотов держали штатные `space-y-stack` (10px), а
             соседние CONSTRUCTION DRAFT и CONSTRUCTION — 20px: один и тот же стык читался двумя
             разными весами через блок. Свой размер тут не заводится. */
          className={cn('min-w-0 flex-1', GROUP_SEAM)}
          action={
            <>
              {/* СЧЁТА В ШАПКЕ НЕТ (item 35, 04.10): «в мудборд не должно быть текста в хедере
                  3 OF 12 PICTURES и "— the mood, not the prompt"». Потолок `MOOD_MAX` по-прежнему
                  держит дверь добавления: тринадцатая картинка получает отказ словами. */}
              <button
                type='button'
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                aria-controls={bodyId}
                aria-label={open ? 'collapse the moodboard' : 'expand the moodboard'}
                className='group cursor-pointer px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
              >
                {/* THE SAME SIGN EVERY FOLD IN THE ADMIN WEARS — `FoldCaret` (T40), down while
                    folded, up while open. The board keeps its own toggle because FOUR blocks fold together
                    (this one, the callouts beside it, the description and the draft under it),
                    which one `Section` cannot do. */}
                <FoldCaret
                  open={open}
                  className='ml-0 text-labelColor group-hover:text-textColor'
                />
              </button>
            </>
          }
        >
          <div id={bodyId} className={open ? 'space-y-stack' : 'hidden'}>
            {/* ПОЛОСА ВЗВОДА. Стоит НАД доской, а не под ней: она объясняет, почему плитки вдруг
                обведены пунктиром, и объяснение обязано попасться на глаза раньше следствия. */}
            {picking && (
              <div className='flex flex-wrap items-center gap-2 border border-textColor px-2.5 py-1.5'>
                <Text size='micro' variant='label' component='span'>
                  pick a moodboard picture — it becomes a reference too, the tile stays here
                </Text>
                <Chip onClick={() => pick.disarm()} className='ml-auto'>
                  esc to cancel
                </Chip>
              </div>
            )}

            <FocusedAnnotator
              layout='grid'
              // U-4: ВЫСОТА ОДНА НА ВСЕ КАДРЫ — лента фиксированной высоты. Переноса по строкам нет
              // ни ценой разной высоты (`railWrap`, снят U-4), ни с общей (сетка, снята O-59).
              gridRowHeight={rowHeight}
              // U-3: виды указаний — слева в полосе над лентой.
              kindsFirst
              // O-62: слот «+ picture» — первым в ленте, картинки за ним; номера картинок прежние.
              addFirst
              // …а картинка, добавленная через него, встаёт в конец ленты, и лента её показывает.
              revealAdded
              // Стрелки ‹ › в стрипе сняты по слову владельца; прокрутка остаётся жестом и
              // скроллбаром. У эскиза рельса живёт со стрелками — потому это проп, а не правка рельсы.
              railArrows={false}
              // Кроп запрещён словами владельца: у медиа без записанных размеров кадр берёт пропорции
              // самой картинки после загрузки, а не фолбэка, — иначе `object-cover` резал бы снимок.
              preferNaturalAspect
              // T01: зума у доски нет (слова владельца); на его месте — `crop` в нижнем ряду кадра.
              zoomable={false}
              // Текст пина — по наведению или фокусу на маркер, не постоянной легендой (R-9).
              pinText='hover'
              /* ═══ ВЫБОР, НАВЕДЕНИЕ И ВЗВОД — СНАРУЖИ (B-9) ═════════════════════════════════════
                 Три пары пропов на три половинчатых жеста: выбрать можно и на кадре, и строкой меню;
                 подсветить — наведя мышь на кадр или на строку; взвести «+ point» — кнопкой в меню,
                 а клик, которого она ждёт, приходит на кадр. Каждое второе состояние здесь дало бы
                 экран, где меню и картинка говорят про разные указания. */
              selectedKey={selectedKey}
              onSelectedChange={(key, opts) => {
                setSelectedKey(key);
                setAddingKey(null);
                // ТРЕТИЙ ТАКТ ЖЕСТА «клик — клик — напиши, что это», и он же исполнение Enter: обе
                // просьбы приходят от поверхности одним флагом и обе кончаются курсором в поле меню.
                if (key != null && opts?.focus) {
                  // Текст указания пишется ТОЛЬКО в панели — свёрнутая, она раскрывается на эту
                  // просьбу (волна 25.09), иначе Enter уводил бы курсор в спрятанное поле. На сеанс:
                  // предпочтение человека не переписывается (`heldOpen`).
                  if (collapsed) holdCallouts();
                  setFocusEditor((n) => n + 1);
                }
              }}
              hoveredKey={hoverIndex == null ? null : callouts.keyOf(hoverIndex)}
              addingKey={addingKey}
              onAddingChange={setAddingKey}
              tilePick={{
                active: picking,
                onPick: (view) => pickIntoInput(view.mediaId),
                taken: (mediaId) => inputIds.has(mediaId),
                label: (view, i) => `take picture ${i + 1} into the input`,
                takenLabel: 'in the input',
              }}
              views={views}
              // ПОДЛОЖКА ПОД ЛИНИЯМИ УКАЗАНИЙ — ЭТО ФОТОГРАФИИ. Чернильная линия на пёстром снимке
              // тонет, и указание перестаёт быть видно ровно там, где его поставили.
              halo
              calloutsFor={callouts.calloutsFor}
              onAddCallout={callouts.add}
              // НАЗНАЧЕНИЯ — ТЕ ЖЕ ШЕСТЬ, ЧТО НА ЛИСТЕ ARTIFACTS (владелец, 04.10: «на мудборде тоже
              // должны быть эти колауты»).
              calloutPurposes
              onEditPoints={callouts.editPoints}
              onMoveCallout={callouts.moveLabel}
              onRemoveCallout={callouts.removeByKey}
              onPickMedia={handleAddMedia}
              onRemoveMedia={(view) => setPendingRemove(view.mediaId)}
              readOnly={readOnly}
              addLabel='+ picture'
              purpose='moodboard reference'
              carouselLabel='moodboard'
              emptyLabel='nothing on the board yet. drop a picture, paste one with ⌘V, or browse the library — then pin notes on it'
              mediaLabel={(view, i) => `moodboard picture ${i + 1}`}
              // АНАТОМИЯ ПЛИТКИ — ТА ЖЕ, ЧТО У ВСЕХ ПЛИТОК АДМИНКИ (T17, 20-TILE-SPEC §3): номер и
              // флаг `in the input` — факты, верх слева, видны всегда; ✕ — «с доски», верх справа;
              // `crop` — низ слева, `edit` — низ справа. Глаголы тихие (`TILE_QUIET`), места назначает
              // поверхность (`cornerSlotBottom`), `group` — сама плитка галереи.
              removeLabel={(view, i) => `take moodboard picture ${i + 1} off the board`}
              tileFlag={(view) =>
                inputIds.has(view.mediaId) ? { word: 'in the input', tone: 'ink' } : null
              }
              tileBadge={(view) => roleOf.get(view.mediaId) || null}
              tileCorners={(view, i) =>
                view.full
                  ? {
                      left: !readOnly && (
                        <button
                          type='button'
                          data-mood-crop={view.mediaId}
                          aria-label={`crop moodboard picture ${i + 1}`}
                          onClick={() =>
                            setCropping({
                              mediaId: view.mediaId,
                              full: view.full as common_MediaFull,
                            })
                          }
                          // Нажатие не доходит до кадра: иначе оно завело бы там жест панорамы или
                          // постановки — тот же довод, что у `FrameButton` поверхности.
                          onPointerDown={(e) => e.stopPropagation()}
                          className={cn(TILE_CORNER, TILE_QUIET, 'py-0.5 leading-none')}
                        >
                          crop
                        </button>
                      ),
                      right: (!readOnly || canEdit) && (
                        <>
                          {!readOnly && (
                            <span onPointerDown={(e) => e.stopPropagation()} className='flex'>
                              <CornerMenu
                                menu={{
                                  label: roleOf.get(view.mediaId) || 'role',
                                  ariaLabel: `role of moodboard picture ${i + 1}`,
                                  items: [
                                    ...MOOD_ROLES.map((r) => ({
                                      value: r,
                                      label: r,
                                      current: roleOf.get(view.mediaId) === r,
                                    })),
                                    ...(roleOf.get(view.mediaId)
                                      ? [{ value: '', label: 'none' }]
                                      : []),
                                  ],
                                  onPick: (role) =>
                                    writeItems(
                                      setBoardRole(
                                        (getValues('moodboardMedia') ?? []) as BoardItem[],
                                        view.mediaId,
                                        role,
                                      ),
                                    ),
                                  'data-menu': `role:${view.mediaId}`,
                                }}
                              />
                            </span>
                          )}
                          {canEdit && (
                            <button
                              type='button'
                              data-mood-edit={view.mediaId}
                              aria-label={`edit moodboard picture ${i + 1}`}
                              title='edit — open the picture editor on this picture; the result joins the board right after it'
                              onClick={() =>
                                setEditing({
                                  mediaId: view.mediaId,
                                  full: view.full as common_MediaFull,
                                })
                              }
                              onPointerDown={(e) => e.stopPropagation()}
                              className={cn(TILE_CORNER, TILE_QUIET, 'py-0.5 leading-none')}
                            >
                              edit
                            </button>
                          )}
                        </>
                      ),
                    }
                  : null
              }
              /* ⚠ `renderEditor` ДОСКЕ БОЛЬШЕ НЕ ПЕРЕДАЁТСЯ — И ЭТО B-9, А НЕ ПОТЕРЯ. Здесь стоял
                 `AnnotationEditor` в узком корпусе (R-2), полосой под кадрами; вместе с ним стояла
                 «бровь» — его пустое состояние («no callout selected — …»), которую владелец назвал
                 дословно и снял. Вся правка мудбордного указания — текст, цвет, пунктир, штриховка,
                 наконечник, «+ point» и удаление — уехала в боковое меню справа (`./callout-rail`),
                 и второй редактор на те же поля означал бы драку за фокус и правку, которую не видно.
                 Вместе с полосой ушли `editorHeight` и `zoomEditorReserve`: и то и другое резервировало
                 высоту ПОД РЕДАКТОР, а кадру, у которого редактора нет ни в одном состоянии, дёргаться
                 не от чего — 108px вертикали доска получила назад. */
            />
            {/* ASK ME (квиз доски, 04.10): ряд под лентой, складывается вместе с доской. */}
            <MoodQuiz
              techCardId={techCardId}
              readOnly={readOnly}
              pictures={items.length}
              concept={conceptValue}
              conceptMax={CONCEPT_MAX}
            />
          </div>

          <ConfirmationModal
            open={pendingRemove != null}
            onOpenChange={(open) => !open && setPendingRemove(null)}
            onConfirm={confirmRemove}
            onCancel={() => setPendingRemove(null)}
            title='off the board'
            confirmLabel='take it off'
            width='sm'
          >
            <div className='space-y-2'>
              {pendingCallouts > 0 && (
                <Text size='control'>
                  {pendingCallouts} note{pendingCallouts === 1 ? '' : 's'} pinned on this picture{' '}
                  {pendingCallouts === 1 ? 'dies' : 'die'} with it — they live nowhere else.
                </Text>
              )}
              {pendingAlsoInInput && (
                <Text size='control'>
                  The same picture also stands in the input — that reference is its own entry and
                  stays there, with its role and its note.
                </Text>
              )}
              {pendingCallouts === 0 && !pendingAlsoInInput && (
                <Text size='control'>
                  The picture comes off the board. The file itself stays in the library.
                </Text>
              )}
            </div>
          </ConfirmationModal>

          <MediaRecropDialog
            media={cropping?.full}
            open={cropping != null}
            onOpenChange={(v) => !v && setCropping(null)}
            onCropped={(full, frame) => cropping && placeCropped(cropping.mediaId, full, frame)}
          />

          {/* РЕДАКТОР КАРТИНКИ ДОСКИ (C-3) — тот же `VectorModal`, что открывает `edit` на плитке
              истории, на плите листа и на верстаке: один редактор, вызванный с четвёртого экрана.
              Монтируется только раскрытым: у модалки свои оконные слушатели клавиш. `slot` не
              передаётся — доске некуда «поставить» результат, он входит строкой доски через
              `placeEditedNextTo`. */}
          {editing && (
            <VectorModal
              open
              onOpenChange={(v) => !v && setEditing(null)}
              techCardId={techCardId}
              band={band}
              base={pictureOfMedia(editing.full)}
              slot={null}
              disabled={readOnly}
              onFlattened={(picture) => {
                // Медиа берётся ИЗ ОТВЕТА СЕРВЕРА, а не из того, что клиент только что загрузил:
                // строку доски заводит `appendBoardPictures` по `common_MediaFull`.
                const full = picture.media;
                if (full) placeEditedNextTo(editing.mediaId, full);
              }}
            />
          )}
        </Section>

        <CalloutsPanel
          panel={calloutsShell}
          hidden={!open}
          tag='mb'
          where='on the board'
          note={
            /* Счётчик — только когда считать есть что (фиксап N2, O-20 «не должно быть
               0 ON THE BOARD»). Ноль не рисуется ни красным, ни пунктиром: пустую панель и так
               видно, а свёрнутая полоска и без него говорит `callouts · 0`. */
            calloutCount > 0 && (
              <HeaderNote data-mb-callout-count=''>{calloutCount} on the board</HeaderNote>
            )
          }
          /* Тот же шов, что у доски слева: панель стоит с ней в одном ряду, и разойтись им нельзя. */
          className={GROUP_SEAM}
        >
          <CalloutRail
            rows={railRows}
            selected={selectedIndex}
            onSelect={(index) => {
              setSelectedKey(index == null ? null : callouts.keyOf(index));
              // Взвод принадлежит ОДНОЙ записке: перевыбор — уже другая строка.
              setAddingKey(null);
            }}
            hoverIndex={hoverIndex}
            onHover={setHoverIndex}
            disabled={readOnly}
            onRemove={
              readOnly
                ? undefined
                : (index) => {
                    const key = callouts.keyOf(index);
                    if (!key) return;
                    callouts.removeByKey(key);
                    // Выбор снимается ВМЕСТЕ со строкой: индекс под ним после удаления адресует
                    // уже соседнее указание, и оставленный выбор открыл бы правку чужого текста.
                    setSelectedKey(null);
                    setAddingKey(null);
                  }
            }
            arrows={arrows}
            focusToken={focusEditor}
            /* НОМЕРА У МУДБОРДНОГО УКАЗАНИЯ НЕТ, И ДЕТАЛИ КРОЯ ТОЖЕ (см. шапку `mood-callouts.tsx`):
               оно про настроение, его не адресует ни деталь, ни операция, ни дефект. */
            numbered={false}
            detailFields={false}
            caps
            purposes
            /* ПУСТОГО ТЕКСТА НЕТ (D-12): здесь стоял абзац «none yet. A note is put on the
               picture itself…». Пустая раскрытая панель — одна шапка со счётчиком; как ставится
               указание, объясняет сама доска (ряд видов над кадрами). */
          />
        </CalloutsPanel>
      </SectionStack>

      <div ref={foldBody} hidden={!open} className='contents' data-mb-fold-body=''>
        {/* ОДНА ЗАПИСКА НА ДОСКУ — И ЭТО `concept` (V-16), СВОИМ БЛОКОМ `DESCRIPTION`. Текст
            печатается в тех-паке и входит в подпись DESIGN. Это по-прежнему НЕ описание изделия для
            генерации: то — `garment description` блока референсов, уходит в каждый прогон; этот
            текст генерация не видит (W-15), его читают человек, бумага и черновик ниже. */}
        {/* ОДИН БЛОК С ЧЕРНОВИКОМ (T33): `Section` теперь рисует `ConstructionDraft`, поля описания
            идут в неё первыми детьми, ряд прогона и очередь разбора — следом. */}
        <ConstructionDraft
          techCardId={techCardId}
          disabled={readOnly}
          conceptMax={CONCEPT_MAX}
          boardPictures={items.length}
        >
          {/* `data-field` — ЯКОРЬ ДВЕРИ, А НЕ УКРАШЕНИЕ. `revealField` (`utils/field-errors.ts:226`)
              ищет поле по `[data-field="<путь>"]`, и этот штамп ставит `FormItem` из `ui/form`. Здесь
              стоит ГОЛАЯ `Textarea`, потому что поле переехало из формы на доску (V-16) — вместе с
              переездом якорь и пропал, а с ним онемели ОБЕ двери «what the model gets» (`edit the
              description ▸` и `edit the concept ▸`): они отвечали «it is not on this tab», стоя на той
              самой вкладке, где поле видно. Штамп возвращён руками ровно потому, что примитив формы
              больше не участвует. */}
          <div data-field='concept'>
            {/* Подпись поля — метрика подписи поля (10px, капслок, серый), не линейка группы:
                в блоке одно поле, и линейка делила бы его с пустотой. */}
            <label htmlFor={noteId} className='block'>
              <Text
                size='micro'
                variant='label'
                tracking='label'
                component='span'
                className='uppercase'
              >
                concept & construction description
              </Text>
            </label>
            {/* ВОЛНА 25.09: рамка `drafted` (описание пишет и черновик — с фиксапа M1 и поверх
                написанного, с `before` в журнале) и `ai ✦` в правом нижнем углу (T08/T16). Своя
                кромка поля снята, пока горит рамка, — текст не сдвигается, когда её снимают; `pb-7`
                держит последнюю строку над кнопкой. Пилюля `drafted` стоит на верхнем крае рамки,
                как легенда, и она же принимает поле (фиксап M3). */}
            <DraftedField
              live={conceptDrafted}
              pill={false}
              className='mt-1 focus-within:border-textColor'
            >
              <Textarea
                {...concept.field}
                id={noteId}
                disabled={readOnly}
                value={conceptValue}
                rows={4}
                maxLength={CONCEPT_MAX}
                placeholder={canDescribe ? undefined : 'describe the thing'}
                className={cn('resize-none pb-7', conceptDrafted && 'border-0 bg-transparent')}
                onFocus={conceptSettle.onFocus}
                onBlur={() => {
                  concept.field.onBlur();
                  conceptSettle.onBlur();
                }}
              />
              {/* Легенда рамки — и есть «принять» описания (фиксап M3). */}
              <DraftedPill
                live={conceptDrafted}
                disabled={readOnly}
                onAccept={() => draftedApi.acceptKey(draftedKey.concept)}
                data-mb-concept-drafted=''
                className='absolute -top-2 right-2 bg-bgColor'
              />
              {/* T48: ссылка живёт В ПЛЕЙСХОЛДЕРЕ пустого поля (вариант владельца). Родной
                  placeholder ссылку не держит, поэтому рисуем слой поверх: тот же бокс, что у
                  textarea (рамка 1px прозрачная, px-[7px] py-[3px], тот же кегль и интерлиньяж) —
                  строка ложится ровно туда, где стоял бы плейсхолдер. Слой прозрачен для мыши,
                  кроме самой ссылки: клик мимо неё фокусирует поле. */}
              {canDescribe && (
                <div
                  data-mb-describe-placeholder=''
                  className={cn(
                    'pointer-events-none absolute inset-0 select-none border border-transparent px-[7px] py-[3px] text-textBaseSize text-textInactiveColor',
                    conceptDrafted && 'border-0',
                  )}
                >
                  describe the thing — or{' '}
                  <button
                    type='button'
                    disabled={describing}
                    onClick={describeFromBoard}
                    data-mb-describe-from-board=''
                    className='pointer-events-auto underline decoration-1 underline-offset-2 hover:text-textColor focus-visible:text-textColor focus-visible:outline-none disabled:cursor-default disabled:hover:text-textInactiveColor'
                  >
                    {describing ? 'writing…' : 'write from the board ✦'}
                  </button>
                </div>
              )}
              <AiEnhance
                key={techCardId}
                field='description'
                value={conceptValue}
                onApply={(text) => {
                  if (shownCard.current !== techCardId) return;
                  setValue('concept', text, { shouldDirty: true, shouldValidate: true });
                }}
                context={cardFactsContext(facts)}
                maxRunes={CONCEPT_MAX}
                disabled={readOnly}
              />
            </DraftedField>
            {/* ⚠ ПОДПИСИ ПОД ПОЛЕМ БОЛЬШЕ НЕТ — СНЯТА ВЛАДЕЛЬЦЕМ (круг 20, B-3), дословно:
                «"printed for the factory ·
                part of the DESIGN signature · read by «draft the idea»
                below — the garment description for generation is a different field, in the input
                block" убрать текст».

                ЧТО ОНА ГОВОРИЛА И ЧТО ИЗ ЭТОГО УЦЕЛЕЛО. Три факта: текст печатается в тех-паке,
                входит в подпись DESIGN и читается черновиком ниже; плюс оговорка «это не описание
                изделия для генерации». Первые три — свойства поля, которые человек узнаёт по месту:
                `ConstructionDraft` стоит своим блоком ниже и называет своё чтение сам, а печать и
                подпись видны на бумаге и в блоке подписи. Четвёртый — различение двух документов —
                живёт там, где его и путают: в панели WHAT THE MODEL GETS, у которой обе двери
                (`edit the concept ▸` и `edit the description ▸`) названы поимённо, и в самом блоке
                референсов, где `garment description` подписана «goes into every run».
                Возвращать строку сюда — значит вернуть абзац прозы в блок, где владелец её снял. */}
          </div>

          {/* ЛЕГАСИ-ЗАПИСКА ДОСКИ. Существует только на карточках, писавших `moodNote` до слияния
              V-16; после любой из двух дверей поле уезжает '' (командой «очисти») и орган исчезает.
              Цитата стоит на экране целиком, поэтому «discard» не спрашивает второй раз. */}
          {legacyNote !== '' && (
            // CalloutBox, а не пунктирная рамка: пунктир в этой системе означает «добавить», а это —
            // сообщение, которое стоит, пока его не разрешили одной из двух дверей (DESIGN.md §5).
            <CalloutBox>
              <div className='flex items-baseline justify-between gap-2'>
                <Text size='micro' variant='label' component='span'>
                  the board’s old shared note — this field is retired; the description above is the
                  one note now
                </Text>
                {!readOnly && (
                  <ChipRow className='shrink-0'>
                    <Chip
                      nonForm
                      onClick={takeLegacyNote}
                      title='append it to the description above'
                    >
                      add to the description
                    </Chip>
                    <Chip nonForm onClick={dropLegacyNote} title='clear it — the text above is it'>
                      discard
                    </Chip>
                  </ChipRow>
                )}
              </div>
              <Text size='micro' component='p' className='mt-1 whitespace-pre-wrap'>
                {legacyNote}
              </Text>
            </CalloutBox>
          )}
        </ConstructionDraft>
      </div>
    </>
  );
}
