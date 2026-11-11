import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * ⚠ LOCAL UNTIL THE API HAS A FIELD. Which values of a model are pinned to its card lives in this
 * browser only (`localStorage['models.pins.<id>']`): the backend `Model` has no field for it yet.
 * When it gets one, this hook is the single place to swap for the server value.
 *
 * Keys are form paths: `name`, `gender`, `sizes.<category>`, `comment`, and measurement names
 * (`BODY_MEASUREMENT_NAME_CHEST`). A category pin is the set of its members, not a key of its own.
 */
export const SIZE_PIN_CATEGORIES = ['tops', 'bottoms', 'tailored', 'shoes'] as const;
export const REQUIRED_PIN_KEYS = [
  'name',
  'gender',
  ...SIZE_PIN_CATEGORIES.map((c) => `sizes.${c}`),
];
export const DEFAULT_PINS = [
  ...REQUIRED_PIN_KEYS,
  'BODY_MEASUREMENT_NAME_CHEST',
  'BODY_MEASUREMENT_NAME_HEIGHT',
];

const storageKey = (key: string) => `models.pins.${key}`;

export function readPins(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed.filter((k): k is string => typeof k === 'string');
  } catch {
    // Unreadable storage falls back to the defaults.
  }
  return DEFAULT_PINS;
}

export function writePins(key: string, pins: string[]) {
  try {
    window.localStorage.setItem(storageKey(key), JSON.stringify(pins));
  } catch {
    // Storage unavailable: the pins hold for this page only.
  }
}

export type ModelPins = {
  pinned: string[];
  isPinned: (key: string) => boolean;
  toggle: (key: string) => void;
  /** A category pin: all on when any member is off, else all off. */
  toggleAll: (keys: string[]) => void;
  allPinned: (keys: string[]) => boolean;
};

/** Pins of one model (`'new'` for the model being created; the caller moves them on create). */
export function useModelPins(key: string): ModelPins {
  const [state, setState] = useState(() => ({ key, pinned: readPins(key) }));
  const pinned = state.key === key ? state.pinned : readPins(key);

  useEffect(() => {
    if (state.key !== key) setState({ key, pinned: readPins(key) });
  }, [key, state.key]);

  const save = useCallback(
    (next: string[]) => {
      setState({ key, pinned: next });
      if (key !== 'new' && key !== 'null') writePins(key, next);
    },
    [key],
  );

  return useMemo(() => {
    const set = new Set(pinned);
    return {
      pinned,
      isPinned: (k) => set.has(k),
      toggle: (k) => save(set.has(k) ? pinned.filter((p) => p !== k) : [...pinned, k]),
      allPinned: (keys) => keys.every((k) => set.has(k)),
      toggleAll: (keys) => {
        const all = keys.every((k) => set.has(k));
        save(all ? pinned.filter((p) => !keys.includes(p)) : [...new Set([...pinned, ...keys])]);
      },
    };
  }, [pinned, save]);
}

const ModelPinsContext = createContext<ModelPins | null>(null);

export const ModelPinsProvider = ModelPinsContext.Provider;

/** Pins of the open form; `null` outside one (no pin is drawn then). */
export function useFormPins(): ModelPins | null {
  return useContext(ModelPinsContext);
}

/** `{ pinned, onToggle, label }` for a `LineField` / `BracketOptions` end, or undefined. */
export function usePinFor(key: string, label: string) {
  const pins = useFormPins();
  if (!pins) return undefined;
  return { pinned: pins.isPinned(key), onToggle: () => pins.toggle(key), label: `pin ${label}` };
}
