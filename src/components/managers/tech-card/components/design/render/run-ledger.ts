import { newClientRequestId } from '../use-design-band';

/**
 * ═══ THE IDEMPOTENCY LEDGER THAT OUTLIVES THE FORM (G-01, Codex 1) ════════════════════════════════
 *
 * `client_request_id` is the one thing that stops a second paid run for the same intent: the server
 * hands back the existing run for a key it already holds, and books a NEW run for a new key. So the
 * key must live as long as the intent can be pressed again — and on PLAYGROUND the form does not.
 * `WorkflowPanel` is unmounted by |→, by Back, by another workflow and by the rail, while the draft
 * it was showing survives in the studio. A ledger held in the form's own ref died with the form:
 * press GENERATE, leave while the answer is out, come back to the same draft, press again → a new
 * key → a second run for the same photographs.
 *
 * SO THE LEDGER IS KEYED BY WHAT THE INTENT IS, NOT BY WHO SHOWS IT: `{card, scope, fingerprint}`,
 * where `scope` is the form (`playground:change_color`) and the fingerprint is the whole request.
 *
 *  · An unchanged request reuses its key until the server CONFIRMS a run for it (`settle`); a
 *    changed request is a new intent and gets its own key. Going back to an earlier, still
 *    unconfirmed request reuses ITS key — that request may have been booked.
 *  · Entries are mirrored in `sessionStorage`, so a reload while the answer is out (or after it was
 *    lost) still replays the key for the same draft. Storage that throws (private window, blocked
 *    site data) leaves the in-memory copy, which still covers every unmount inside the tab.
 *  · A refusal leaves the entry in place, not pending: pressing again with nothing changed replays
 *    the same key, as the hook always did.
 */
export type LedgerEntry = {
  /** The `client_request_id` of this intent. */
  id: string;
  /** Sent, and no answer seen yet (the answer may still come, or may have been lost). */
  pending: boolean;
  /** When this intent was last sent, ms — the prune clock. */
  at: number;
};

type Book = Record<string, Record<string, LedgerEntry>>;

export const RUN_LEDGER_STORAGE_KEY = 'plm.design.run-ledger.v1';
/** A tab that stays open for a day holds nothing older: the server's own key window is shorter. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Per form: the newest intents only — a form is not pressed with thirty different drafts. */
const MAX_PER_SCOPE = 16;

let memory: Book | null = null;

function book(): Book {
  if (memory) return memory;
  let read: Book = {};
  try {
    const raw = window.sessionStorage.getItem(RUN_LEDGER_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') read = parsed as Book;
  } catch {
    /* no storage, or a value someone else wrote: start empty */
  }
  memory = prune(read);
  return memory;
}

function prune(all: Book): Book {
  const now = Date.now();
  const out: Book = {};
  for (const [scope, entries] of Object.entries(all)) {
    if (!entries || typeof entries !== 'object') continue;
    const kept = Object.entries(entries)
      .filter(
        ([, e]) =>
          e && typeof e.id === 'string' && typeof e.at === 'number' && now - e.at < MAX_AGE_MS,
      )
      .sort(([, a], [, b]) => b.at - a.at)
      .slice(0, MAX_PER_SCOPE);
    if (kept.length) out[scope] = Object.fromEntries(kept);
  }
  return out;
}

function save(): void {
  try {
    window.sessionStorage.setItem(RUN_LEDGER_STORAGE_KEY, JSON.stringify(book()));
  } catch {
    /* the in-memory copy still holds it for this tab */
  }
}

const scopeOf = (techCardId: number, scope: string) => `${techCardId}|${scope}`;

export function ledgerEntry(
  techCardId: number,
  scope: string,
  fingerprint: string,
): LedgerEntry | null {
  return book()[scopeOf(techCardId, scope)]?.[fingerprint] ?? null;
}

/**
 * The key for this intent, marked as sent: the entry's own key while it is unconfirmed, a fresh one
 * otherwise.
 */
export function ledgerSend(techCardId: number, scope: string, fingerprint: string): string {
  const all = book();
  const at = scopeOf(techCardId, scope);
  const found = all[at]?.[fingerprint];
  const id = found ? found.id : newClientRequestId();
  all[at] = { ...all[at], [fingerprint]: { id, pending: true, at: Date.now() } };
  memory = prune(all);
  save();
  return id;
}

/** The server refused (or the call failed): kept, so the same press replays the same key. */
export function ledgerRefused(techCardId: number, scope: string, fingerprint: string): void {
  const all = book();
  const found = all[scopeOf(techCardId, scope)]?.[fingerprint];
  if (!found) return;
  found.pending = false;
  save();
}

/** The server confirmed a run for this intent: the next press is a new run. */
export function ledgerSettle(techCardId: number, scope: string, fingerprint: string): void {
  const all = book();
  const at = scopeOf(techCardId, scope);
  if (!all[at]?.[fingerprint]) return;
  const rest = { ...all[at] };
  delete rest[fingerprint];
  if (Object.keys(rest).length) all[at] = rest;
  else delete all[at];
  save();
}
