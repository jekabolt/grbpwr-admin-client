import { newClientRequestId } from '../use-design-band';

/**
 * ═══ THE IDEMPOTENCY LEDGER THAT OUTLIVES THE FORM (G-01, Codex 1; r2 N1–N4) ══════════════════════
 *
 * `client_request_id` is the one thing that stops a second paid run for the same intent: the server
 * hands back the existing run for a key it already holds, and books a NEW run for a new key. The
 * server's memory of a key is PERMANENT — a UNIQUE column on the run row
 * (`internal/store/design/wave2.go`, `priorStart`), not a window that expires. So the rule here is:
 *
 *   ONE LOGICAL PRESS = ONE KEY, UNTIL THE SERVER HAS ANSWERED DEFINITIVELY.
 *
 *  · The ledger is keyed by WHAT the intent is, not by who shows it: `{operator, card, scope,
 *    fingerprint}`. `scope` is the form (`playground:change_color`, or '' for the screens that do not
 *    name one); the fingerprint is the canonical wire request (`requestFingerprint`).
 *  · ACCEPTED (the door booked or handed back a run) → the entry goes: the next press is a new run.
 *  · REFUSED DEFINITIVELY (a 4xx: nothing was booked) → the entry goes too, so the next press mints a
 *    fresh key instead of replaying one the server has already turned down. EXCEPT when an earlier
 *    send of that same key went unanswered (`unsure`): the server may hold a run under it from that
 *    send, and a refusal of the REPEAT (a gate that closed meanwhile) says nothing about the first.
 *    Such a key is kept — replaying it can only hand back that run, never buy a second one.
 *  · NO ANSWER (a dropped connection, a 5xx, our own deadline) → kept and marked `unsure`.
 *  · A key sent and never answered in this ledger's life (a reload while it was out) reads back as
 *    `pending`, and its next send marks it `unsure` for the same reason.
 *
 * NOTHING IS EVICTED BY AGE OR COUNT. An unresolved key can be outstanding on the server for as long
 * as the server remembers keys, which is forever; dropping it would mint a second key for the same
 * intent — the duplicate charge this file exists to prevent. What stays is small by construction:
 * only presses whose answer never arrived (or arrived as a refusal after such a silence), per tab,
 * in `sessionStorage` — it dies with the tab, and pressing GENERATE on that draft resolves it.
 *
 * THE OPERATOR IS PART OF THE KEY (r2 N4). Logout removes only the token; `sessionStorage` and this
 * module's memory outlive it. Without the operator, B logging into A's tab would replay A's key for
 * B's own press of the same draft. The operator is a hash of the JWT's `sub` (the token itself is
 * never stored); a token without `sub` falls back to a hash of the whole token — that is per login,
 * which errs toward a fresh key for a different person rather than a shared one.
 *
 * Storage that throws (private window, blocked site data) leaves the in-memory copy, which still
 * covers every unmount inside the tab.
 */
export type LedgerEntry = {
  /** The `client_request_id` of this intent. */
  id: string;
  /** Sent, and no answer recorded yet (it may still come, or may have been lost with a reload). */
  pending: boolean;
  /** A send of this key went unanswered: the server may already hold a run under it. */
  unsure: boolean;
};

/** How a send of a key ended, as far as the idempotency of that key is concerned. */
export type LedgerOutcome = 'accepted' | 'refused' | 'unknown';

type Book = Record<string, Record<string, LedgerEntry>>;

export const RUN_LEDGER_STORAGE_KEY = 'plm.design.run-ledger.v2';

let memory: Book | null = null;

function book(): Book {
  if (memory) return memory;
  const read: Book = {};
  try {
    const raw = window.sessionStorage.getItem(RUN_LEDGER_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') {
      for (const [scope, entries] of Object.entries(parsed as Record<string, unknown>)) {
        if (!entries || typeof entries !== 'object') continue;
        const kept: Record<string, LedgerEntry> = {};
        for (const [fp, e] of Object.entries(entries as Record<string, unknown>)) {
          const x = e as Partial<LedgerEntry> | null;
          if (!x || typeof x.id !== 'string' || !x.id) continue;
          kept[fp] = { id: x.id, pending: x.pending === true, unsure: x.unsure === true };
        }
        if (Object.keys(kept).length) read[scope] = kept;
      }
    }
  } catch {
    /* no storage, or a value someone else wrote: start empty */
  }
  memory = read;
  return memory;
}

function save(): void {
  try {
    window.sessionStorage.setItem(RUN_LEDGER_STORAGE_KEY, JSON.stringify(book()));
  } catch {
    /* the in-memory copy still holds it for this tab */
  }
}

/**
 * WHO IS SIGNED IN, as a short stable hash — never the token. Read on every call: logout and login
 * happen without a reload.
 */
export function operatorKey(): string {
  let token = '';
  try {
    token = window.localStorage.getItem('authToken') ?? '';
  } catch {
    /* no storage: one anonymous operator */
  }
  if (!token) return 'op:none';
  let sub = '';
  try {
    const payload = token.split('.')[1] ?? '';
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      sub?: unknown;
    };
    if (typeof claims.sub === 'string') sub = claims.sub;
  } catch {
    /* not a JWT we can read: fall back to the token's own hash */
  }
  return sub ? `op:${hash(`sub:${sub}`)}` : `op:${hash(`token:${token}`)}`;
}

/** cyrb53 — a 53-bit string hash; an identity bucket, not a secret. */
function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const scopeOf = (techCardId: number, scope: string) => `${operatorKey()}|${techCardId}|${scope}`;

/**
 * The key for this intent, marked as sent: the entry's own key while it is unresolved, a fresh one
 * otherwise. A key found still `pending` was sent and never answered here, so it becomes `unsure`.
 */
export function ledgerSend(techCardId: number, scope: string, fingerprint: string): string {
  const all = book();
  const at = scopeOf(techCardId, scope);
  const found = all[at]?.[fingerprint];
  const id = found ? found.id : newClientRequestId();
  const unsure = !!found && (found.unsure || found.pending);
  all[at] = { ...all[at], [fingerprint]: { id, pending: true, unsure } };
  save();
  return id;
}

/** What the send of this intent's key came to — see the file head for the three rules. */
export function ledgerSettle(
  techCardId: number,
  scope: string,
  fingerprint: string,
  outcome: LedgerOutcome,
): void {
  const all = book();
  const at = scopeOf(techCardId, scope);
  const found = all[at]?.[fingerprint];
  if (!found) return;
  if (outcome === 'unknown') {
    all[at] = { ...all[at], [fingerprint]: { ...found, pending: false, unsure: true } };
  } else if (outcome === 'refused' && found.unsure) {
    all[at] = { ...all[at], [fingerprint]: { ...found, pending: false } };
  } else {
    const rest = { ...all[at] };
    delete rest[fingerprint];
    if (Object.keys(rest).length) all[at] = rest;
    else delete all[at];
  }
  save();
}

/**
 * ═══ THE FINGERPRINT IS THE CANONICAL WIRE REQUEST (r2 N2) ═══════════════════════════════════════
 *
 * Exactly the object that goes on the wire minus the key itself, serialised so that two requests the
 * server cannot tell apart print the same string: object keys sorted at every depth (insertion order
 * is an accident of whoever built the object), array order kept (it is meaning — the order of the
 * pictures), `undefined`/`null`/functions dropped from objects as JSON and protojson drop them, and
 * strings trimmed (the door trims what it reads; «red » and «red» are one intent). A field that is not
 * on the wire cannot be in here, because the wire object is what is fingerprinted.
 */
export function requestFingerprint(wire: unknown): string {
  return JSON.stringify(canonical(wire));
}

function canonical(v: unknown): unknown {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map((x) => canonical(x));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x === undefined || x === null || typeof x === 'function') continue;
      out[k] = canonical(x);
    }
    return out;
  }
  return null;
}
