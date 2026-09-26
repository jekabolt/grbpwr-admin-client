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
 *   · `clearing`      — вход ПЕРЕПИСЫВАЕТСЯ: CLEAR снимает роли, рекол кладёт вход прогона, кроп
 *                       замещает строку, деталь получает роль (тот же довод: цикл переживает смену
 *                       шага; ревью раунда 3, m1). GENERATE ждёт; другой переписчик отказывается;
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
  serverRefusal: RunRefusal | null;
  ask: FlatAsk | null;
};

const FLAT_INPUT_IDLE: FlatInputState = {
  run: null,
  refused: null,
  clearing: false,
  serverRefusal: null,
  ask: null,
};
const flatInput = new Map<number, FlatInputState>();
const flatInputListeners = new Set<() => void>();

/** Занятость входа СЕЙЧАС — для щелчков: снимок отрисовки мог отстать на кадр. */
export function readFlatInput(card: number): FlatInputState {
  return flatInput.get(card) ?? FLAT_INPUT_IDLE;
}

/** Вход занят: идёт GENERATE или вход переписывается. */
export function flatInputBusy(state: FlatInputState): boolean {
  return state.run !== null || state.clearing;
}

export function patchFlatInput(card: number, patch: Partial<FlatInputState>): void {
  const prev = readFlatInput(card);
  const next = { ...prev, ...patch };
  if (
    next.run === prev.run &&
    next.refused === prev.refused &&
    next.clearing === prev.clearing &&
    next.serverRefusal === prev.serverRefusal &&
    next.ask === prev.ask
  ) {
    return;
  }
  if (
    next.run === null &&
    next.refused === null &&
    !next.clearing &&
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

/** Вход переписывается (CLEAR, рекол, кроп, деталь): GENERATE ждёт, пока это не закончится. */
export function setFlatInputClearing(card: number, clearing: boolean): void {
  patchFlatInput(card, { clearing });
}
