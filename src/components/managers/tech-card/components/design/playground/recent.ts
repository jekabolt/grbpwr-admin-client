import { useCallback, useSyncExternalStore } from 'react';

/**
 * ═══ RECENTLY USED — THE LAST TEXTS OF ONE PROMPT FIELD (PLAYGROUND C-02, D5) ════════════════════
 *
 * Each playground prompt (pose, scene, garment, placement…) keeps its own short list of the texts it
 * was generated with, newest first. The list lives in `localStorage` under
 * `plm.playground.recent.v1:<workflow>.<field>` as a JSON array of strings.
 *
 * NO ACCOUNT ID IN THE KEY. D5 asked for workflow + field + admin account id, but the client holds
 * no clean source for the id: the only identity on the page is the raw JWT in
 * `localStorage['authToken']`, and decoding it here would make this list the one reader of the
 * token's claims. So the list is per browser profile, like the Pantone recent list
 * (`pantone-swatches.ts`, `plm.pantone.recent.v1`).
 *
 * STORAGE IS A CONVENIENCE, NOT A FOUNDATION. Every read and every write sits in try/catch: a private
 * window, a full quota or blocked site data (where even TOUCHING `localStorage` throws) costs the
 * field nothing. The first failure DETACHES the page from storage until reload and the lists live in
 * module memory; without that, a failing write beside a working read (quota) would bring the old list
 * back over the text just remembered.
 *
 * WHO REMEMBERS. The field cannot tell when a run was sent, so it only READS. The panel that sends
 * the run calls `rememberRecentText(recentTextKey(workflow, field), text)` once the door accepted it.
 * Every mounted field with that key updates at once (one module store, `useSyncExternalStore`), and
 * another tab catches up through the `storage` event.
 *
 * The parse does not trust the stored value (anyone can edit it): not an array → empty; not a string,
 * blank, or longer than `RECENT_TEXT_ENTRY_MAX` → skipped; a repeat that differs only in case or
 * spacing keeps its first, i.e. newest, spelling.
 */

export const RECENT_TEXT_PREFIX = 'plm.playground.recent.v1';
/** How many texts one field keeps. */
export const RECENT_TEXT_MAX = 8;
/** A remembered text longer than this is not kept: the list is for re-use, not for archives. */
export const RECENT_TEXT_ENTRY_MAX = 2000;

const EMPTY: readonly string[] = Object.freeze([]);

/** The storage key of one field of one workflow. */
export function recentTextKey(workflowKey: string, fieldKey: string): string {
  return `${RECENT_TEXT_PREFIX}:${workflowKey}.${fieldKey}`;
}

const norm = (text: string) => text.trim().replace(/\s+/g, ' ');

/** `first` ahead of `then`, repeats removed by normalised text, at most `max`. */
export function mergeRecentText(
  first: readonly unknown[],
  then: readonly unknown[] = [],
  max: number = RECENT_TEXT_MAX,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...first, ...then]) {
    if (out.length >= max) break;
    if (typeof item !== 'string') continue;
    const text = item.trim();
    const key = norm(text).toLowerCase();
    if (!text || text.length > RECENT_TEXT_ENTRY_MAX || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

/** A stored string → the list. Anything that is not a list of texts reads as empty. */
export function parseRecentText(raw: string | null | undefined, max = RECENT_TEXT_MAX): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? mergeRecentText(parsed, [], max) : [];
  } catch {
    return [];
  }
}

/* ── the module store ──────────────────────────────────────────────────────────────────────────── */

/** The current list per key. A NEW array only when the list changed: it is the snapshot. */
const lists = new Map<string, readonly string[]>();
/** Storage failed at least once: until reload the lists live in `lists` only. */
let detached = false;
const listeners = new Map<string, Set<() => void>>();

function load(key: string): readonly string[] {
  if (!detached) {
    try {
      const fresh = parseRecentText(localStorage.getItem(key), RECENT_TEXT_MAX);
      const was = lists.get(key);
      if (!was || was.length !== fresh.length || was.some((t, i) => t !== fresh[i])) {
        lists.set(key, fresh);
      }
    } catch {
      detached = true;
    }
  }
  return lists.get(key) ?? EMPTY;
}

function emit(key: string) {
  listeners.get(key)?.forEach((notify) => notify());
}

/** The list of one key, newest first. Never throws. */
export function readRecentText(key: string): readonly string[] {
  return load(key);
}

/** Put a text at the head of the list, without repeats, at most `max`. Never throws. */
export function rememberRecentText(key: string, text: string, max = RECENT_TEXT_MAX): void {
  if (!text.trim()) return;
  // Over a FRESH read: another tab or another field may have written since this page last looked.
  const next = mergeRecentText([text], load(key), max);
  lists.set(key, next);
  if (!detached) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      detached = true;
    }
  }
  emit(key);
}

/** Take one text out of the list. Never throws. */
export function forgetRecentText(key: string, text: string): void {
  const drop = norm(text).toLowerCase();
  const next = load(key).filter((t) => norm(t).toLowerCase() !== drop);
  lists.set(key, next);
  if (!detached) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      detached = true;
    }
  }
  emit(key);
}

function subscribe(key: string, notify: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(notify);
  // Another tab wrote the same key: re-read it. `e.key === null` is a `clear()` of the whole store.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== key) return;
    const before = lists.get(key);
    if (load(key) !== before) notify();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    set?.delete(notify);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * The recent texts of one field, newest first, live across fields and tabs.
 * `key` comes from `recentTextKey(workflow, field)`; `max` trims what this caller shows.
 */
export function useRecentText(
  key: string,
  max: number = RECENT_TEXT_MAX,
): {
  items: readonly string[];
  remember: (text: string) => void;
  forget: (text: string) => void;
} {
  const sub = useCallback((notify: () => void) => subscribe(key, notify), [key]);
  const snap = useCallback(() => lists.get(key) ?? load(key), [key]);
  const all = useSyncExternalStore(sub, snap, snap);
  const remember = useCallback((text: string) => rememberRecentText(key, text), [key]);
  const forget = useCallback((text: string) => forgetRecentText(key, text), [key]);
  return { items: all.length > max ? all.slice(0, max) : all, remember, forget };
}
