import { create } from 'zustand';
import {
  NotifyAction,
  NotifyEntry,
  NotifyInput,
  NotifyOptions,
  NotifyPatch,
  NotifySev,
  SnackBarStore,
  Toast,
} from './store-types';

/** Module counters, not the clock: a burst inside one millisecond must not share an id. */
let nextToastId = 0;
let nextSeq = 0;
let nextKey = 0;

/** Four still reads as a list at a glance; past it the column becomes a page. */
const TOAST_CAP = 4;
const HISTORY_CAP = 50;
/** A read entry re-reported sooner than this stays read: a poll must not re-light the badge. */
const RENOTIFY_MS = 60_000;

/**
 * The row under the operator's pointer, set by `SnackBar` on real pointer moves only. Eviction
 * spares it, so a burst of new reports cannot destroy the row being read or selected. A module
 * variable, not state: it changes on every move and must re-render nothing.
 */
let readingToastId: number | null = null;

export function markToastBeingRead(id: number | null) {
  readingToastId = id;
}

const isBad = (sev: NotifySev) => sev === 'error' || sev === 'warn';
/** Receipts never enter the inbox. */
const isLogged = (sev: NotifySev) => sev !== 'ok';

const flat = (n: NotifyInput) => [n.subject, n.text, n.bad, n.detail].filter(Boolean).join(' · ');

const sameNews = (a: NotifyInput, b: NotifyInput) =>
  a.sev === b.sev &&
  a.subject === b.subject &&
  a.text === b.text &&
  (a.bad ?? '') === (b.bad ?? '') &&
  (a.detail ?? '') === (b.detail ?? '');

/** The caller's fields only, so a merge never drags ids and counters along. */
function inputOf(n: NotifyInput): NotifyInput {
  const { sev, subject, text, bad, detail, action, progress } = n;
  return { sev, subject, text, bad, detail, action, progress };
}

/** Receipts go first, errors last; within a rank the least recently reported. */
const EVICT_RANK: Record<NotifySev, number> = { ok: 0, job: 1, warn: 2, error: 3 };

function evictOne(toasts: Toast[]): Toast[] {
  const spared = toasts.filter((t) => t.id !== readingToastId);
  const pool = spared.length > 0 ? spared : toasts;
  const victim = pool.reduce((v, t) => {
    const d = EVICT_RANK[t.sev] - EVICT_RANK[v.sev];
    return d < 0 || (d === 0 && t.seq < v.seq) ? t : v;
  });
  return toasts.filter((t) => t !== victim);
}

type State = Pick<SnackBarStore, 'toasts' | 'history' | 'unread' | 'unreadError'>;

function withHistory(history: NotifyEntry[]): Pick<State, 'history' | 'unread' | 'unreadError'> {
  const unread = history.filter((h) => h.unread);
  return { history, unread: unread.length, unreadError: unread.some((h) => isBad(h.sev)) };
}

const stale = (h: NotifyEntry) => Date.now() - h.at >= RENOTIFY_MS;

/** Writes `next` under `key`. `prev` is what the key held before; undefined = new. */
function put(
  state: State,
  key: string,
  next: NotifyInput,
  prev: NotifyInput | undefined,
  toast: boolean,
): Partial<State> {
  const message = flat(next);
  const out: Partial<State> = {};

  /* A live toast updates in place. A dismissed one comes back with any change of state, never
     for a progress tick of a running job. */
  const live = state.toasts.findIndex((t) => t.key === key);
  if (live !== -1) {
    const toasts = state.toasts.slice();
    const held = toasts[live];
    toasts[live] = { ...held, ...next, key, message, nonce: held.nonce + 1, seq: (nextSeq += 1) };
    out.toasts = toasts;
  } else if (toast && !(prev?.sev === 'job' && next.sev === 'job')) {
    const fresh: Toast = {
      ...next,
      key,
      message,
      id: (nextToastId += 1),
      count: 1,
      nonce: 0,
      seq: (nextSeq += 1),
    };
    const kept = state.toasts.length < TOAST_CAP ? state.toasts : evictOne(state.toasts);
    out.toasts = [...kept, fresh];
  }

  /* The inbox keeps errors, partial failures and jobs; a job's final state replaces its own
     entry, `ok` included. */
  const at = state.history.findIndex((h) => h.key === key);
  if (at === -1 && !isLogged(next.sev)) return out;
  const was = at === -1 ? undefined : state.history[at];
  const unread =
    isBad(next.sev) &&
    (!was || !isBad(was.sev) || !sameNews(was, next) || was.unread || stale(was));
  const entry: NotifyEntry = {
    ...next,
    key,
    message,
    unread,
    at: Date.now(),
    count: was?.count ?? 1,
  };
  /* A state change moves to the top; a progress tick keeps its place. */
  const history =
    was && was.sev === next.sev
      ? state.history.map((h, i) => (i === at ? entry : h))
      : [entry, ...state.history.filter((_, i) => i !== at)].slice(0, HISTORY_CAP);
  return { ...out, ...withHistory(history) };
}

/** An identical report while the first is still up: ×N in place, timer NOT restarted. */
function repeat(state: State, twin: Toast, action: NotifyAction | undefined): Partial<State> {
  const toasts = state.toasts.map((t) =>
    t === twin
      ? {
          ...t,
          count: t.count + 1,
          seq: (nextSeq += 1),
          action: t.action ?? action,
        }
      : t,
  );
  const at = state.history.findIndex((h) => h.key === twin.key);
  if (at === -1) return { toasts };
  const was = state.history[at];
  const entry: NotifyEntry = {
    ...was,
    count: was.count + 1,
    at: Date.now(),
    unread: was.unread || (isBad(was.sev) && stale(was)),
  };
  return { toasts, ...withHistory([entry, ...state.history.filter((_, i) => i !== at)]) };
}

export const useSnackBarStore = create<SnackBarStore>((set, get) => ({
  toasts: [],
  history: [],
  unread: 0,
  unreadError: false,

  notify: (input, opts) => {
    const toast = opts?.toast !== false;
    const next = inputOf(input);
    const state = get();
    const twin =
      next.sev === 'job'
        ? undefined
        : state.toasts.find(
            (t) => (input.key === undefined ? toast : t.key === input.key) && sameNews(t, next),
          );
    if (twin) {
      set(repeat(state, twin, next.action));
      return twin.key;
    }
    const key = input.key ?? `n${(nextKey += 1)}`;
    const prev =
      state.toasts.find((t) => t.key === key) ?? state.history.find((h) => h.key === key);
    set(put(state, key, next, prev, toast));
    return key;
  },

  updateNotify: (key, patch, opts) => {
    const state = get();
    const prev =
      state.toasts.find((t) => t.key === key) ?? state.history.find((h) => h.key === key);
    if (!prev) return;
    set(put(state, key, { ...inputOf(prev), ...patch }, prev, opts?.toast !== false));
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  dismissAllToasts: () => set({ toasts: [] }),
  removeNotify: (key) =>
    set((s) => ({
      toasts: s.toasts.filter((t) => t.key !== key),
      ...withHistory(s.history.filter((h) => h.key !== key)),
    })),
  markAllRead: () =>
    set((s) => withHistory(s.history.map((h) => (h.unread ? { ...h, unread: false } : h)))),
  clearHistory: () => set(withHistory([])),

  /* 553 call sites; none is edited. No subject words are invented for them. */
  showMessage: (message, severity, action) => {
    const said = message ?? '';
    get().notify(
      severity === 'success'
        ? { sev: 'ok', subject: '', text: said, action }
        : { sev: 'error', subject: '', text: '', bad: said, action },
    );
  },
}));

/** `notify` outside React: upload queue, query callbacks. */
export const notify = (input: NotifyInput, opts?: NotifyOptions) =>
  useSnackBarStore.getState().notify(input, opts);

export const updateNotify = (key: string, patch: NotifyPatch, opts?: NotifyOptions) =>
  useSnackBarStore.getState().updateNotify(key, patch, opts);

export const removeNotify = (key: string) => useSnackBarStore.getState().removeNotify(key);
