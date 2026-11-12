// ONE SEAM GESTURE ON THE WIRE (C7). Every seam write of the page — accept, remove, a pose, MIRROR, a
// DXF's dropped rows — goes through `runSeamChange`:
//
//   optimistic rows at once → (queued per card) flush the form → hold its autosave → the request,
//   claiming the version the form stands on → the form adopts the committed links and version →
//   the store takes the server's list at that version → the hold is released.
//
// A refusal reverts the optimistic rows and leaves the server's words under their keys. A
// lock_version_moved reads the card once and tries once more; the second refusal is said as it is.
// Kept apart from React: the hook (use-seam-decisions.ts) hands in the RPC and the card query.

import type {
  ChangeTechCardSeamsRequest,
  ChangeTechCardSeamsResponse,
  common_TechCard,
} from 'api/proto-http/admin';
import type { TechCardSeamWire } from 'lib/seams';
import {
  changeRequest,
  isLockMoved,
  keyMapOf,
  pendingOf,
  type SeamChange,
} from './seam-change-plan';
import { seamFormBridge, serializeSeamWrite, type SeamFormBridge } from './seam-form-bridge';
import { hydrateSeams, posesOf, readWire, rowsOf, takesList, useSeamsStore } from './seams-store';

export type SeamChangeResult =
  | {
      ok: true;
      /** Sent key → the key the row was stored under. */
      keyMap: ReadonlyMap<string, string>;
      deletedKeys: readonly string[];
      lockVersion: number;
    }
  | { ok: false; why: string };

export type SeamChangeOpts = {
  /** What the inbox says was not saved: `${verb} not saved`. */
  verb: string;
  /** One more key the refusal is written under (the row the gesture started from). */
  errorAt?: string;
  /** Keys this change is expected to delete without naming them (a detach of the last link). */
  gone?: readonly string[];
  /** The caller says the refusal itself: no inbox entry. */
  quiet?: boolean;
};

export type SeamChangeDeps = {
  call: (req: ChangeTechCardSeamsRequest) => Promise<ChangeTechCardSeamsResponse>;
  /** The card's form bridge; the page's registry by default. */
  bridge?: (cardId: number) => SeamFormBridge | undefined;
  /** The card query is stale now (a read follows; the store already holds the answer). */
  settled?: (cardId: number) => void;
  /** The inbox line of a refused write. */
  refused?: (verb: string, why: string) => void;
};

export const NOT_SAVED = 'not saved';

/**
 * A gesture's change, or how to build it: a function is built again after the form's flush and after
 * a lock_version_moved read, so a change that depends on a step's links (MIRROR's detaches) is made
 * from the links as they are when it goes out. The optimistic rows come from the first build.
 */
export type SeamChangeInput = SeamChange | (() => SeamChange);

const message = (e: unknown) =>
  e instanceof Error ? e.message.replace(/^Error:\s*/, '') : 'the server did not answer';

/**
 * Lift the optimistic rows of `keys` and, with `echo`, take the server's list read at `version` —
 * unless the store already holds a newer one (C7, invariant 3). Another card in the store meanwhile:
 * nothing here is its business.
 */
export function settleSeamWrite(
  cardId: number,
  keys: readonly string[],
  echo: readonly TechCardSeamWire[] | undefined,
  error?: string,
  errorAt?: string,
  version?: number,
): void {
  const s = useSeamsStore.getState();
  if (s.cardId !== cardId) return;
  const pending = { ...s.pending };
  const posePending = { ...s.posePending };
  const errors = { ...s.errors };
  for (const k of [...keys, ...(errorAt ? [errorAt] : [])]) {
    delete pending[k];
    delete posePending[k];
    if (error) errors[k] = error;
    else delete errors[k];
  }
  const read = echo ? readWire(echo) : null;
  // An echo older than the list in the store (a later read answered first) lifts its own pending
  // and nothing else.
  const take = read && takesList(s, version, read.rows, read.poses);
  useSeamsStore.setState({
    pending,
    posePending,
    errors,
    ...(read && take
      ? {
          server: read.rows,
          poses: read.poses,
          serverAt: Date.now(),
          ...(version !== undefined ? { serverVersion: Math.max(version, s.serverVersion) } : {}),
        }
      : {}),
  });
}

/** Write one gesture; resolves with the committed keys, or why nothing was written. */
export function runSeamChange(
  cardId: number,
  input: SeamChangeInput,
  opts: SeamChangeOpts,
  deps: SeamChangeDeps,
): Promise<SeamChangeResult> {
  const build = typeof input === 'function' ? input : () => input;
  const change = build();
  const s = useSeamsStore.getState();
  // The store holds another card (its list was never read here): the write goes out without
  // optimistic rows, and its answer is the next read's business.
  const mine = s.cardId === cardId;
  const { pending, posePending } = mine
    ? pendingOf(change, { rows: rowsOf(s), poses: posesOf(s) }, opts.gone)
    : { pending: {}, posePending: {} };
  const keys = [...Object.keys(pending), ...Object.keys(posePending)];
  // One write per row at a time: a second intent on a row in flight is dropped, never raced.
  if (keys.some((k) => s.pending[k] || s.posePending[k]))
    return Promise.resolve({ ok: false, why: 'still saving' });
  if (mine) {
    const errors = { ...s.errors };
    for (const k of [...keys, ...(opts.errorAt ? [opts.errorAt] : [])]) delete errors[k];
    useSeamsStore.setState({
      pending: { ...s.pending, ...pending },
      posePending: { ...s.posePending, ...posePending },
      errors,
    });
  }

  const fail = (why: string): SeamChangeResult => {
    settleSeamWrite(cardId, keys, undefined, why, opts.errorAt);
    if (!opts.quiet) deps.refused?.(opts.verb, why);
    return { ok: false, why };
  };
  const bridgeOf = deps.bridge ?? seamFormBridge;

  return serializeSeamWrite(cardId, async (): Promise<SeamChangeResult> => {
    const bridge = bridgeOf(cardId);
    if (!bridge) return fail(NOT_SAVED);
    const flushed = await bridge.flush('seam');
    if (!flushed.ok) return fail(flushed.why);
    const held = await bridge.hold();
    try {
      if (held.refused) return fail(held.refused);
      for (let attempt = 0; ; attempt += 1) {
        // The card left this page while the write waited its turn.
        if (bridgeOf(cardId) !== bridge) return fail(NOT_SAVED);
        const req = changeRequest(cardId, bridge.version(), build(), bridge.operationNumber);
        if (!req) return fail(NOT_SAVED);
        let res: ChangeTechCardSeamsResponse;
        try {
          res = await deps.call(req);
        } catch (e) {
          if (attempt === 0 && isLockMoved(e)) {
            const fresh = await bridge.reread();
            if (!fresh.ok) return fail(fresh.why);
            takeRead(cardId, fresh.card);
            continue;
          }
          return fail(message(e));
        }
        const lockVersion = res.lockVersion ?? req.expectedLockVersion ?? 0;
        // The form first: the store's «row gone» subscriber then finds the steps already right.
        if (bridgeOf(cardId) === bridge)
          bridge.adopt({
            expected: req.expectedLockVersion ?? 0,
            lockVersion,
            links: res.links ?? [],
            seams: res.seams ?? [],
          });
        settleSeamWrite(
          cardId,
          keys,
          (res.seams ?? []) as TechCardSeamWire[],
          undefined,
          opts.errorAt,
          lockVersion,
        );
        deps.settled?.(cardId);
        return {
          ok: true,
          keyMap: keyMapOf(res),
          deletedKeys: res.deletedKeys ?? [],
          lockVersion,
        };
      }
    } finally {
      held.release();
    }
  });
}

/** The card read after lock_version_moved: its rows into the store at its version. */
function takeRead(cardId: number, card: common_TechCard) {
  if (useSeamsStore.getState().cardId !== cardId) return;
  if (hydrateSeams(cardId, (card.seams ?? []) as TechCardSeamWire[], card.lockVersion))
    useSeamsStore.setState({ serverAt: Date.now() });
}
