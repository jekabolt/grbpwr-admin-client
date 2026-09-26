import { useSyncExternalStore } from 'react';

import type { FlushResult } from './autosave-contract';
import type { RunRefusal } from './generation/refusal';

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
};

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
