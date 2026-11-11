import { useCallback, useState } from 'react';

const KEY = 'employees.notePins';

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // The pin holds for this page only.
  }
}

/**
 * THE NOTE PIN of a person (the Required Info title pin): a pinned person's tile shows their note.
 * Kept in this browser until the API has a field — the Models / Tasks pins do the same. A new
 * person's pin lives under `new` and moves to the id once they are created.
 */
export function useNotePins() {
  const [pins, setPins] = useState<string[]>(read);
  const toggle = useCallback((key: string) => {
    setPins((now) => {
      const next = now.includes(key) ? now.filter((k) => k !== key) : [...now, key];
      write(next);
      return next;
    });
  }, []);
  const move = useCallback((from: string, to: string) => {
    setPins((now) => {
      if (!now.includes(from)) return now;
      const next = [...now.filter((k) => k !== from && k !== to), to];
      write(next);
      return next;
    });
  }, []);
  const has = useCallback((key: string) => pins.includes(key), [pins]);
  return { has, toggle, move };
}
