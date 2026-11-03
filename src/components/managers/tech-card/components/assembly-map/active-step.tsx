// АКТИВНЫЙ ШАГ — один на вкладку, общий для рельса и карты сборки (04-ASSEMBLY-MAP-DESIGN §4 «Doors»).
//
// Рельс (строки списка, боксы схемы) и карта светят друг друга в обе стороны. Наведение — `hover`.
// `open` — шаг, открытый в редакторе: его публикует `OperationsField`, владелец выбора, какими бы
// путями шаг ни открылся. Своего выбора у стора нет: второй выбор рядом с редакторским и показывал
// на карте не тот шаг. Наведение бьёт открытый шаг, пока мышь на строке.
//
// ВНЕШНИЙ СТОР, А НЕ СОСТОЯНИЕ ВКЛАДКИ. Рельс — сорок семь строк с подписками на форму; держи
// активный шаг в `useState` вкладки, и каждое движение мыши по рельсу перерисовывало бы вкладку,
// рельс целиком и редактор шага. Строка подписана на ОДИН бит («это я?») через
// `useSyncExternalStore`, карта — на весь снимок; остальные не просыпаются вовсе.
//
// БЕЗ ПРОВАЙДЕРА ВСЁ МОЛЧИТ. Рельс живёт и на других стендах (проба каркаса, фулскрин без вкладки):
// там хук отдаёт null, и строка ведёт себя ровно как вчера.
import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';

export type ActiveStepSnapshot = {
  hover: number | null;
  open: number | null;
};

export type ActiveStepStore = {
  get: () => ActiveStepSnapshot;
  subscribe: (fn: () => void) => () => void;
  hover: (index: number | null) => void;
  /** Шаг, открытый в редакторе. Пишет только `OperationsField`. */
  setOpen: (index: number | null) => void;
  /** Выбор на карте: просит владельца открыть шаг. */
  pick: (index: number) => void;
  /** Владелец выбора регистрирует, чем открывать шаг. */
  setOpener: (fn: ((index: number) => void) | null) => void;
};

export function createActiveStepStore(): ActiveStepStore {
  let snap: ActiveStepSnapshot = { hover: null, open: null };
  let opener: ((index: number) => void) | null = null;
  const subs = new Set<() => void>();
  const set = (next: Partial<ActiveStepSnapshot>) => {
    const merged = { ...snap, ...next };
    if (merged.hover === snap.hover && merged.open === snap.open) return;
    snap = merged;
    subs.forEach((fn) => fn());
  };
  return {
    get: () => snap,
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    hover: (index) => set({ hover: index }),
    // Открылся другой шаг: наведение снято, иначе мышь, оставшаяся на строке, держала бы карту на
    // старом шаге при ходьбе стрелками. Следующее наведение покажет своё.
    setOpen: (index) => set({ open: index, hover: index === snap.open ? snap.hover : null }),
    pick: (index) => opener?.(index),
    setOpener: (fn) => {
      opener = fn;
    },
  };
}

/** Шаг, который сейчас показан: наведённый, иначе открытый. */
export const activeOf = (s: ActiveStepSnapshot): number | null => s.hover ?? s.open;

/**
 * Шаг на карте. Первый машинный шаг только когда ни один шаг не открыт. Наведение за концом списка
 * (строка уже снята) не считается. Открытый шаг за концом подрезается: `ops` карты и индекс
 * редактора приезжают разными подписками, и на такт подмены другим шагом быть не должно.
 */
export function shownStep(s: ActiveStepSnapshot, count: number, fallback: number | null) {
  if (s.hover != null && s.hover < count) return s.hover;
  if (s.open != null && count > 0) return Math.min(s.open, count - 1);
  return fallback;
}

/**
 * Куда уехала открытая строка, когда список сменился без жеста, выбирающего шаг (например, сервер
 * вставил шаг при записи). null: строки больше нет или её ключ перечеканен, индекс остаётся.
 */
export function followOpenStep(
  before: readonly string[],
  open: number,
  after: readonly string[],
): number | null {
  const key = before[open];
  if (!key) return null;
  const at = after.indexOf(key);
  return at >= 0 ? at : null;
}

const Ctx = createContext<ActiveStepStore | null>(null);

/** Провайдер вкладки. */
export function ActiveStepProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createActiveStepStore);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** Стор вкладки или null (стенд без карты). */
export function useActiveStepStore(): ActiveStepStore | null {
  return useContext(Ctx);
}

const NONE: ActiveStepSnapshot = { hover: null, open: null };
const noop = () => () => {};

/** Весь снимок — для карты. */
export function useActiveStep(): ActiveStepSnapshot {
  const store = useContext(Ctx);
  return useSyncExternalStore(store?.subscribe ?? noop, store?.get ?? (() => NONE));
}

/** Один бит для строки рельса: светит ли карта именно этот шаг. */
export function useIsActiveStep(index: number): boolean {
  const store = useContext(Ctx);
  return useSyncExternalStore(store?.subscribe ?? noop, () => {
    if (!store) return false;
    const s = store.get();
    return activeOf(s) === index;
  });
}
