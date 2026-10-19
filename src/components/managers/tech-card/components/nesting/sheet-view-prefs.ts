// Настройки вида листа деталей (сетка, силуэт, длины сторон, имена, долевая, вершины).
// Одни на пользователя и на все листы сразу: модуль держит значение, localStorage его помнит.
import { useCallback, useSyncExternalStore } from 'react';

export type SheetViewPrefs = {
  grid: boolean;
  silhouette: boolean;
  sizes: boolean;
  names: boolean;
  grain: boolean;
  vertices: boolean;
};

export const SHEET_VIEW_DEFAULTS: SheetViewPrefs = {
  grid: true,
  silhouette: false,
  sizes: false,
  names: true,
  grain: true,
  vertices: true,
};

const KEY = 'pieceSheet.view.v1';

function read(): SheetViewPrefs {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(KEY);
    if (!raw) return SHEET_VIEW_DEFAULTS;
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out = { ...SHEET_VIEW_DEFAULTS };
    for (const k of Object.keys(out) as (keyof SheetViewPrefs)[]) {
      if (typeof o?.[k] === 'boolean') out[k] = o[k] as boolean;
    }
    return out;
  } catch {
    return SHEET_VIEW_DEFAULTS;
  }
}

let current: SheetViewPrefs | null = null;
const subs = new Set<() => void>();
const snapshot = () => (current ??= read());
const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
};

export function useSheetViewPrefs(): [
  SheetViewPrefs,
  (key: keyof SheetViewPrefs, value: boolean) => void,
] {
  const prefs = useSyncExternalStore(subscribe, snapshot, () => SHEET_VIEW_DEFAULTS);
  const set = useCallback((key: keyof SheetViewPrefs, value: boolean) => {
    current = { ...snapshot(), [key]: value };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      // приватный режим / квота — настройка живёт до перезагрузки
    }
    subs.forEach((fn) => fn());
  }, []);
  return [prefs, set];
}
