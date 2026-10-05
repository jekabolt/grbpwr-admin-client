import { useSyncExternalStore } from 'react';

import type { FlushResult } from './autosave-contract';
import { DEFAULT_FLAT_MODE, FLAT_MODE_WORD, type FlatMode, type StructurePick } from './flat-mode';
import type { RunRefusal } from './generation/refusal';
import { ACTIVE_VIEWS, viewLabel } from './views';

/**
 * ═══ ВХОД ФЛЭТА ЗАНЯТ — ЭТО СОСТОЯНИЕ КАРТОЧКИ, А НЕ РЯДА (ревью раунда 2, MAJOR B) ═══════════════
 *
 * Смена шага размонтирует ряд и секцию (`studio-tab.tsx` рисует их только на FLAT), а продолжение
 * GENERATE после `await flush` живёт дальше — прогон уходит, за него платят. Пока «занято» было
 * состоянием ряда, вернувшийся ряд рисовал живой GENERATE над ещё идущим запросом, и второй щелчок
 * был вторым платным прогоном. Поэтому занятость — модульная, по карточке, и её читают все, кто
 * рисует или переписывает вход: ряд (`starting…`, отказ щелчку, запертые виды), секция (WORDS, роли,
 * ✕, CLEAR, кроп, деталь), приёмник рекола (`history-recall.tsx`).
 *   · `run`           — `saving`: ждём сохранения карточки; `starting`: запрос прогона в полёте;
 *   · `refused`       — почему последний GENERATE остановился ДО прогона: исход flush, «карточку
 *                       утвердили, пока она сохранялась» или «сохранение остановилось» (m3);
 *   · `clearing`      — CLEAR снимает роли по одной и стирает слова: заперто всё, и спиннер CLEAR
 *                       читает ТОЛЬКО этот флаг;
 *   · `rewriting`     — СЧЁТЧИК удержаний строк и ролей (ревью раунда 4, MIN-1/MIN-2): рекол, кроп,
 *                       деталь, сплит во вход (от регистрации до закрытия окна), селект роли, ✕,
 *                       переименование детали. GENERATE ждёт, CLEAR и рекол отказываются; слова НЕ
 *                       запираются — набор посреди кропа не теряется (раунд 3 брал для этого флаг
 *                       CLEAR, и поле становилось readOnly на время двух записей роли);
 *   · `wordsHeld`     — СЧЁТЧИК удержаний слов: рекол, который пишет слова прогона (иначе набранное
 *                       посреди него было бы затёрто);
 *   · `serverRefusal` — отказ СЕРВЕРА последнему запуску, дословно, пока его не прочли или не нажали
 *                       GENERATE снова (ревью раунда 3, m2: в состоянии ряда он жил до смены шага и
 *                       дальше показывался только всплывашкой);
 *   · `ask`           — виды, детали и раскладка запроса в полёте (и отказанного, пока отказ стоит):
 *                       ряд, вернувшийся после смены шага, рисует ИХ, а не чипы по умолчанию рядом со
 *                       `starting…` (m2).
 *
 * Отдельный модуль, а не экспорт ряда: его читают и приёмник рекола, и секция, а ряд тянет за собой
 * модалки и органы — цикл импортов здесь не нужен никому.
 */
export type FlatLayout = 'one' | 'per_view';

export type FlatAsk = {
  views: Record<string, boolean>;
  detailTicks: Record<number, boolean>;
  layout: FlatLayout;
  /** The flat mode (`flat-mode.ts`); photos is the default. */
  mode: FlatMode;
  /** «from my flat»: which technical flat is the front, which the back. Empty on other modes. */
  structure: StructurePick[];
};

/**
 * ═══ ПРОГОН ФЛЭТА ПО УМОЛЧАНИЮ (T19, слово владельца 03.10) ═════════════════════════════════════
 *
 * Владелец, дословно: «теперь по дефолту мы генерируем one image и FRONT BACK SIDE LEFT SIDE RIGHT».
 * Один лист, четыре стороны (`ACTIVE_VIEWS`, ключи провода `front · back · side_l · side_r` — их же
 * принимает сервер, `entity.DesignSilhouetteViews`). Было `front, back`.
 *
 * Сохранённого выбора у ряда нет и не было: выбор живёт в состоянии ряда и, пока запрос в полёте
 * или отказ стоит, в `ask` этого модуля (память вкладки, не хранилище). Поэтому «старое умолчание»
 * не может пережить перезагрузку: поднятый `ask` — это выбор, за который человек уже нажал GENERATE,
 * и он остаётся его выбором.
 */
export const DEFAULT_FLAT_LAYOUT: FlatLayout = 'one';

/** Новая запись на каждый вызов: состояние ряда её правит, общий объект правился бы у всех. */
export function defaultFlatViews(): Record<string, boolean> {
  return Object.fromEntries(ACTIVE_VIEWS.map((v) => [v, true]));
}

/** Выбор — умолчание: четыре стороны, один лист, ни одной детали. Иначе дверь `custom` несёт точку. */
export function isDefaultFlatChoice(ask: FlatAsk): boolean {
  return (
    ask.layout === DEFAULT_FLAT_LAYOUT &&
    (ask.mode ?? DEFAULT_FLAT_MODE) === DEFAULT_FLAT_MODE &&
    ACTIVE_VIEWS.every((v) => !!ask.views[v]) &&
    !Object.values(ask.detailTicks).some(Boolean)
  );
}

/**
 * Черновик ряда ДЛЯ ЭТОЙ КАРТОЧКИ (гейт волны 3, W1): выбор из запроса в полёте, если он есть,
 * иначе умолчание. Ряд, не перемонтированный при смене карточки, обязан пересеять черновик отсюда —
 * иначе выбор одной карточки молча уезжает платным прогоном другой.
 */
export function flatDraftOf(card: number): FlatAsk {
  const ask = readFlatInput(card).ask;
  const ticks = exclusiveTicks(ask?.views ?? defaultFlatViews(), ask?.detailTicks ?? {});
  return {
    ...ticks,
    layout: ask?.layout ?? DEFAULT_FLAT_LAYOUT,
    mode: ask?.mode ?? DEFAULT_FLAT_MODE,
    structure: ask?.structure ?? [],
  };
}

/**
 * Точный выбор словами — `title` закрытой двери `custom •` (W1): раскладка, затем то, что уйдёт.
 * `detailNames` — имена отмеченных деталей в порядке скамьи.
 */
export function flatChoiceSummary(ask: FlatAsk, detailNames: string[]): string {
  const layout = ask.layout === 'one' ? 'one picture' : 'a picture per view';
  const views = ACTIVE_VIEWS.filter((v) => ask.views[v]).map((v) => viewLabel(v));
  const asked = [...views, ...detailNames.map((n) => `detail ${n}`)];
  const mode = ask.mode ?? DEFAULT_FLAT_MODE;
  const head = mode === DEFAULT_FLAT_MODE ? [] : [FLAT_MODE_WORD[mode]];
  return [...head, layout, asked.length ? asked.join(', ') : 'nothing ticked'].join(' · ');
}

/**
 * THE MODE ON SCREEN, PER CARD — the run row picks it, the JOINS group reads it (the `confirm joins`
 * door stands only while «straps & openings» is chosen). Tab memory, like the rest of this module.
 */
const modeDraft = new Map<number, FlatMode>();
const modeListeners = new Set<() => void>();

export function setFlatModeDraft(card: number, mode: FlatMode): void {
  if ((modeDraft.get(card) ?? DEFAULT_FLAT_MODE) === mode) return;
  if (mode === DEFAULT_FLAT_MODE) modeDraft.delete(card);
  else modeDraft.set(card, mode);
  modeListeners.forEach((l) => l());
}

export function useFlatModeDraft(card: number): FlatMode {
  const read = () => modeDraft.get(card) ?? DEFAULT_FLAT_MODE;
  return useSyncExternalStore(
    (l) => {
      modeListeners.add(l);
      return () => {
        modeListeners.delete(l);
      };
    },
    read,
    read,
  );
}

export type FlatInputState = {
  run: 'saving' | 'starting' | null;
  refused: FlushResult | 'released' | 'stopped' | null;
  clearing: boolean;
  rewriting: number;
  wordsHeld: number;
  serverRefusal: RunRefusal | null;
  ask: FlatAsk | null;
};

const FLAT_INPUT_IDLE: FlatInputState = {
  run: null,
  refused: null,
  clearing: false,
  rewriting: 0,
  wordsHeld: 0,
  serverRefusal: null,
  ask: null,
};
const flatInput = new Map<number, FlatInputState>();
const flatInputListeners = new Set<() => void>();

/** Занятость входа СЕЙЧАС — для щелчков: снимок отрисовки мог отстать на кадр. */
export function readFlatInput(card: number): FlatInputState {
  return flatInput.get(card) ?? FLAT_INPUT_IDLE;
}

/** Вход занят: идёт GENERATE, CLEAR или вход переписывается. GENERATE ждёт, CLEAR и рекол отказываются. */
export function flatInputBusy(state: FlatInputState): boolean {
  return state.run !== null || state.clearing || state.rewriting > 0;
}

/**
 * Строки и роли МОЖНО писать: не идёт ни GENERATE (сервер снимет вход в момент запуска), ни CLEAR.
 * Другое удержание строк — не помеха: две правки ролей подряд не спорят, спорят правка и прогон.
 */
export function rowsWritable(state: FlatInputState): boolean {
  return state.run === null && !state.clearing;
}

/** Слова заперты: прогон, CLEAR или рекол, который пишет слова (ревью раунда 4, MIN-1). */
export function wordsLocked(state: FlatInputState): boolean {
  return state.run !== null || state.clearing || state.wordsHeld > 0;
}

export function patchFlatInput(card: number, patch: Partial<FlatInputState>): void {
  const prev = readFlatInput(card);
  const next = { ...prev, ...patch };
  if (
    next.run === prev.run &&
    next.refused === prev.refused &&
    next.clearing === prev.clearing &&
    next.rewriting === prev.rewriting &&
    next.wordsHeld === prev.wordsHeld &&
    next.serverRefusal === prev.serverRefusal &&
    next.ask === prev.ask
  ) {
    return;
  }
  if (
    next.run === null &&
    next.refused === null &&
    !next.clearing &&
    next.rewriting === 0 &&
    next.wordsHeld === 0 &&
    next.serverRefusal === null &&
    next.ask === null
  ) {
    flatInput.delete(card);
  } else {
    flatInput.set(card, next);
  }
  flatInputListeners.forEach((listener) => listener());
}

function subscribeFlatInput(listener: () => void): () => void {
  flatInputListeners.add(listener);
  return () => {
    flatInputListeners.delete(listener);
  };
}

/** Занятость входа флэта этой карточки — живая, переживает смену шага. */
export function useFlatInput(card: number): FlatInputState {
  const read = () => readFlatInput(card);
  return useSyncExternalStore(subscribeFlatInput, read, read);
}

/** CLEAR снимает роли и стирает слова: заперто всё, GENERATE ждёт. */
export function setFlatInputClearing(card: number, clearing: boolean): void {
  patchFlatInput(card, { clearing });
}

/**
 * УДЕРЖАТЬ СТРОКИ И РОЛИ на время записей (а с `words` — ещё и слова). Возвращает отпускание —
 * одно на удержание, повторный вызов ничего не делает. Счётчик, а не флаг: удержания пересекаются
 * (две правки ролей подряд), и первое отпускание не должно снимать чужое.
 */
export function holdFlatInput(card: number, opts?: { words?: boolean }): () => void {
  const words = !!opts?.words;
  const at = readFlatInput(card);
  patchFlatInput(card, {
    rewriting: at.rewriting + 1,
    ...(words ? { wordsHeld: at.wordsHeld + 1 } : {}),
  });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const now = readFlatInput(card);
    patchFlatInput(card, {
      rewriting: Math.max(0, now.rewriting - 1),
      ...(words ? { wordsHeld: Math.max(0, now.wordsHeld - 1) } : {}),
    });
  };
}

/**
 * ═══ ВИДЫ ИЛИ ДЕТАЛИ — НЕ ВМЕСТЕ (T07, слово владельца: «при генерации детали вьюс должны
 * анпикаться и что бы мы делали только скетч детали») ═══════════════════════════════════════════
 *
 * Прогон флэта — либо виды целиком (front/back/side), либо детали, и сервер смешанный прогон
 * отклоняет. Галка детали снимает все виды, галка вида снимает все детали; снятие галки соседей не
 * трогает. Чипы не прячутся и не запираются — выбор переключается сам, без слов.
 */
export function tickView(
  views: Record<string, boolean>,
  details: Record<number, boolean>,
  view: string,
): { views: Record<string, boolean>; detailTicks: Record<number, boolean> } {
  const on = !views[view];
  return { views: { ...views, [view]: on }, detailTicks: on ? {} : details };
}

export function tickDetail(
  views: Record<string, boolean>,
  details: Record<number, boolean>,
  id: number,
): { views: Record<string, boolean>; detailTicks: Record<number, boolean> } {
  const on = !details[id];
  return { views: on ? {} : views, detailTicks: { ...details, [id]: on } };
}

/**
 * Выбор, поднятый из запроса в полёте, мог быть записан до T07 смешанным. Виды выигрывают: это
 * выбор по умолчанию, а детали ставят руками заново одним щелчком.
 */
export function exclusiveTicks(
  views: Record<string, boolean>,
  details: Record<number, boolean>,
): { views: Record<string, boolean>; detailTicks: Record<number, boolean> } {
  const anyView = Object.values(views).some(Boolean);
  const anyDetail = Object.values(details).some(Boolean);
  return { views, detailTicks: anyView && anyDetail ? {} : details };
}
