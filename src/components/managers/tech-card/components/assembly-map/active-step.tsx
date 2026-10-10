// АКТИВНЫЙ ШАГ — один на вкладку, общий для рельса и карты сборки (04-ASSEMBLY-MAP-DESIGN §4 «Doors»).
//
// Рельс (строки списка, боксы схемы) и карта (номера у кромок, строки THEN) светят друг друга в обе
// стороны. Наведение — `hover`; щелчок — ЛИПКИЙ выбор `sticky`, который переживает уход мыши и
// снимается Esc или щелчком мимо. Наведение бьёт выбор, пока мышь на строке.
//
// ВНЕШНИЙ СТОР, А НЕ СОСТОЯНИЕ ВКЛАДКИ. Рельс — сорок семь строк с подписками на форму; держи
// активный шаг в `useState` вкладки, и каждое движение мыши по рельсу перерисовывало бы вкладку,
// рельс целиком и редактор шага. Строка подписана на ОДИН бит («это я?») через
// `useSyncExternalStore`, карта — на весь снимок; остальные не просыпаются вовсе.
//
// БЕЗ ПРОВАЙДЕРА ВСЁ МОЛЧИТ. Рельс живёт и на других стендах (проба каркаса, фулскрин без вкладки):
// там хук отдаёт null, и строка ведёт себя ровно как вчера.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export type ActiveStepSnapshot = {
  hover: number | null;
  /** Несколько шагов разом — строка легенды швов на PIECES светит все шаги этого шва. */
  many: readonly number[] | null;
  sticky: number | null;
  /** Последний выбор, сделанный НА КАРТЕ: рельс открывает этот шаг (nonce различает повторы). */
  mapPick: { index: number; nonce: number } | null;
};

export type ActiveStepStore = {
  get: () => ActiveStepSnapshot;
  subscribe: (fn: () => void) => () => void;
  hover: (index: number | null) => void;
  hoverMany: (indexes: readonly number[] | null) => void;
  /** Липкий выбор; `from: 'map'` просит рельс открыть шаг. */
  select: (index: number | null, from?: 'rail' | 'map') => void;
};

export function createActiveStepStore(): ActiveStepStore {
  let snap: ActiveStepSnapshot = { hover: null, many: null, sticky: null, mapPick: null };
  let nonce = 0;
  const subs = new Set<() => void>();
  const set = (next: Partial<ActiveStepSnapshot>) => {
    const merged = { ...snap, ...next };
    if (
      merged.hover === snap.hover &&
      merged.many === snap.many &&
      merged.sticky === snap.sticky &&
      merged.mapPick === snap.mapPick
    )
      return;
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
    hoverMany: (indexes) => set({ many: indexes }),
    select: (index, from = 'rail') =>
      set({
        sticky: index,
        ...(from === 'map' && index != null ? { mapPick: { index, nonce: ++nonce } } : {}),
      }),
  };
}

/** Шаг, который сейчас показан: наведённый, иначе выбранный. */
export const activeOf = (s: ActiveStepSnapshot): number | null => s.hover ?? s.sticky;

const Ctx = createContext<ActiveStepStore | null>(null);

/**
 * Провайдер вкладки. Снимает липкий выбор по Esc и по щелчку мимо карты, рельса и редактора шага —
 * щелчок по строке рельса снимает и тут же ставит выбор заново (pointerdown раньше click).
 */
export function ActiveStepProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createActiveStepStore);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && store.get().sticky != null) store.select(null);
    };
    const onDown = (e: PointerEvent) => {
      if (store.get().sticky == null) return;
      const t = e.target as Element | null;
      if (t?.closest?.('[data-assembly-map], [data-step-editor], [data-rail-step]')) return;
      store.select(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [store]);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

/** Стор вкладки или null (стенд без карты). */
export function useActiveStepStore(): ActiveStepStore | null {
  return useContext(Ctx);
}

const NONE: ActiveStepSnapshot = { hover: null, many: null, sticky: null, mapPick: null };
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
    return activeOf(s) === index || !!s.many?.includes(index);
  });
}

/** Nonce выбора на карте для шага `index` (0 — не выбирался): строка рельса открывает себя по нему. */
export function useMapPickNonce(index: number): number {
  const store = useContext(Ctx);
  return useSyncExternalStore(store?.subscribe ?? noop, () => {
    const p = store?.get().mapPick;
    return p && p.index === index ? p.nonce : 0;
  });
}
