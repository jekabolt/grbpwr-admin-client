import { useCallback, useSyncExternalStore } from 'react';

/**
 * PINS OF A TASK — what its tile on the board shows besides the title (the Models pins, same
 * grammar): `steps` = the checklist under the title, `info` = the description's first lines.
 *
 * LOCAL UNTIL THE API HAS A FIELD. Kept in localStorage per task id, so it is this browser's view
 * of the board, not a property of the task; one store for the panel and every tile, so pressing the
 * pin in the panel changes the tile behind it at once.
 */
export type TaskPinKey = 'steps' | 'info';

const KEY = 'grbpwr.tasks.pins';
type PinMap = Record<string, TaskPinKey[]>;

let cache: PinMap | null = null;
const listeners = new Set<() => void>();

function read(): PinMap {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as PinMap;
  } catch {
    cache = {};
  }
  return cache;
}

function write(next: PinMap) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: pins live for this tab only */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function taskPinned(id: number | string, key: TaskPinKey): boolean {
  return !!read()[String(id)]?.includes(key);
}

export function setTaskPin(id: number | string, key: TaskPinKey, on: boolean) {
  const all = read();
  const now = all[String(id)] ?? [];
  const next = on ? [...new Set([...now, key])] : now.filter((k) => k !== key);
  const copy = { ...all };
  if (next.length) copy[String(id)] = next;
  else delete copy[String(id)];
  write(copy);
}

/** Moves the pins chosen while a task was being created onto its new id. */
export function moveTaskPins(from: string, to: number) {
  const all = read();
  const pins = all[from];
  if (!pins) return;
  const copy = { ...all, [String(to)]: pins };
  delete copy[from];
  write(copy);
}

/** Every tile reads the whole map (one subscription each, one tiny object). */
export function useTaskPins(): PinMap {
  return useSyncExternalStore(subscribe, read, read);
}

export function useTaskPin(id: number | string | null, key: TaskPinKey) {
  const all = useTaskPins();
  const pinned = id != null && !!all[String(id)]?.includes(key);
  const toggle = useCallback(() => {
    if (id != null) setTaskPin(id, key, !taskPinned(id, key));
  }, [id, key]);
  return { pinned, toggle };
}
