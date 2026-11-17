// READ AND WRITE THE SEAM DECISIONS (03-SEAMS-DESIGN §3.3, §5.3).
//
// Reads: the graph the provider read (held through its 400 ms settle, as the map holds it), the
// rows (server + optimistic) and the resolver's verdict → one `Review`.
//
// Writes: one gesture, one ChangeTechCardSeams (C7, seam-change.ts) — the rows are laid over the
// server's list at once, the request carries ONLY what the gesture changes (rows and step links,
// under the version the form stands on), the server's answer replaces the list and the form adopts
// its links, and the card query is invalidated so the next read agrees. A refused write puts the
// server's words on the row and reverts it. A released card writes nothing.

import { adminService } from 'api/api';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from 'lib/stores/store';
import { refuseGesture } from '../refuse-gesture';
import type { PieceGeom, SeamGraph } from 'lib/assembly-skeleton/types';
import type { StoredPose, StoredRow, StoredSeam, TechCardSeamWire } from 'lib/seams';
import { useCallback, useMemo, useRef } from 'react';
import { useCardSeamGraph } from '../card-unit-pictures';
import { FROZEN_REFUSAL } from '../assembly-fullscreen';
import { useUndoHistory } from '../undo-history';
import { buildReview, type Review } from './review-model';
import { poseChange, type StepRef } from './seam-change-plan';
import {
  NOT_SAVED,
  runSeamChange,
  type SeamChangeInput,
  type SeamChangeOpts,
  type SeamChangeResult,
} from './seam-change';
import {
  hydrateSeams,
  readWire,
  reuseKeys,
  reuseExactKeys,
  rowExactAnchorSig,
  rowsOf,
  useSeamsStore,
} from './seams-store';
import { seamRefresher } from './seam-refresh';

export type SeamReviewRead = {
  graph: SeamGraph | null;
  geoms: ReadonlyMap<string, PieceGeom>;
  review: Review | null;
  settling: boolean;
};

/** The graph, held through a settle (a decision re-reads it; the review must not blink empty). */
export function useHeldSeamGraph(): { graph: SeamGraph | null; settling: boolean } {
  const { graph, settling } = useCardSeamGraph();
  const last = useRef<SeamGraph | null>(null);
  if (graph) last.current = graph;
  else if (!settling) last.current = null;
  return { graph: graph ?? last.current, settling };
}

export function useSeamReview(): SeamReviewRead {
  const { graph, settling } = useHeldSeamGraph();
  const server = useSeamsStore((s) => s.server);
  const pending = useSeamsStore((s) => s.pending);
  const errors = useSeamsStore((s) => s.errors);
  const resolved = useSeamsStore((s) => s.resolved);
  const geoms = useMemo(() => new Map((graph?.pieces ?? []).map((p) => [p.pieceKey, p])), [graph]);
  const review = useMemo(
    () =>
      graph ? buildReview(graph, rowsOf({ server, pending }), resolved, pending, errors) : null,
    [graph, server, pending, errors, resolved],
  );
  return { graph, geoms, review, settling };
}

/** A server list older than this is read again before a new row is written. */
const FRESH_MS = 10_000;
const refreshSeams = seamRefresher(async (cardId) => {
  const res = await adminService.GetTechCard({ id: cardId, vatCountryCode: undefined });
  if (useSeamsStore.getState().cardId !== cardId) return;
  // An older read than the list in the store (a write landed meanwhile) changes nothing.
  if (
    hydrateSeams(
      cardId,
      (res.techCard?.seams ?? []) as TechCardSeamWire[],
      res.techCard?.lockVersion,
    )
  )
    useSeamsStore.setState({ serverAt: Date.now() });
});

type Refused = { ok: false; why: string };
const NOT_WRITTEN: Refused = { ok: false, why: NOT_SAVED };

export type StrictSeamUpsertFailureCode =
  | 'frozen'
  | 'card-unsaved'
  | 'write-in-flight'
  | 'write-failed'
  | 'card-changed'
  | 'echo-missing'
  | 'receipt-missing'
  | 'receipt-ambiguous';

export type StrictSeamUpsertResult =
  | Readonly<{
      ok: true;
      rows: readonly StoredRow[];
      seamKeys: readonly string[];
      lockVersion: number;
      outcome: 'verified-echo';
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      rows: readonly [];
      seamKeys: readonly [];
      outcome: 'not-attempted' | 'unknown' | 'acknowledged-unverified';
      blocker: Readonly<{ code: StrictSeamUpsertFailureCode; detail: string }>;
    }>;

export type StrictSeamAcceptResult =
  | Readonly<{
      ok: true;
      /** Exact persisted row echoed by the atomic seam + operation-link write. */
      row: StoredSeam;
      seamKey: string;
      lockVersion: number;
      outcome: 'verified-echo';
      blocker: null;
    }>
  | Extract<StrictSeamUpsertResult, { ok: false }>;

export type StrictSeamAcceptGuardResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; why: string }>;

export type StrictSeamAcceptGuard = Readonly<{
  /** Exact saved-card version captured together with the empty target operation. */
  expectedLockVersion: number;
  /** Re-check the live selected operation synchronously at the final request boundary. */
  validate: () => StrictSeamAcceptGuardResult;
}>;

function strictUpsertBlocked(
  code: StrictSeamUpsertFailureCode,
  detail: string,
  outcome: Extract<StrictSeamUpsertResult, { ok: false }>['outcome'],
): Extract<StrictSeamUpsertResult, { ok: false }> {
  return Object.freeze({
    ok: false as const,
    rows: Object.freeze([]) as readonly [],
    seamKeys: Object.freeze([]) as readonly [],
    outcome,
    blocker: Object.freeze({ code, detail }),
  });
}

/** Resolve the exact final rows acknowledged by the seam RPC. */
export function resolveStrictSeamUpsertReceipt(
  submitted: readonly StoredRow[],
  echo: readonly TechCardSeamWire[],
  lockVersion: number,
): StrictSeamUpsertResult {
  if (!Number.isSafeInteger(lockVersion) || lockVersion < 0)
    return strictUpsertBlocked(
      'receipt-missing',
      'The strict seam write echo has no exact committed card lock version.',
      'acknowledged-unverified',
    );
  const decoded = readWire(echo);
  const resolved: StoredRow[] = [];
  const seenSeamPairs = new Set<string>();
  const seenPoseKeys = new Set<string>();
  for (const row of submitted) {
    if (row.kind === 'pose') {
      if (seenPoseKeys.has(row.seamKey))
        return strictUpsertBlocked(
          'receipt-ambiguous',
          `Pose ${row.seamKey} was submitted more than once.`,
          'acknowledged-unverified',
        );
      seenPoseKeys.add(row.seamKey);
      const matches = decoded.poses.filter(({ seamKey }) => seamKey === row.seamKey);
      if (matches.length === 0)
        return strictUpsertBlocked(
          'receipt-missing',
          `The seam write echo does not contain pose ${row.seamKey}.`,
          'acknowledged-unverified',
        );
      if (matches.length !== 1)
        return strictUpsertBlocked(
          'receipt-ambiguous',
          `The seam write echo contains multiple poses for ${row.seamKey}.`,
          'acknowledged-unverified',
        );
      resolved.push(matches[0]);
      continue;
    }
    const pair = rowExactAnchorSig(row);
    if (seenSeamPairs.has(pair))
      return strictUpsertBlocked(
        'receipt-ambiguous',
        'The same seam pair was submitted more than once.',
        'acknowledged-unverified',
      );
    seenSeamPairs.add(pair);
    const matches = decoded.rows.filter((candidate) => rowExactAnchorSig(candidate) === pair);
    if (matches.length === 0)
      return strictUpsertBlocked(
        'receipt-missing',
        `The seam write echo does not contain the submitted pair for ${row.seamKey}.`,
        'acknowledged-unverified',
      );
    if (matches.length !== 1)
      return strictUpsertBlocked(
        'receipt-ambiguous',
        `The seam write echo contains multiple rows for the submitted pair ${row.seamKey}.`,
        'acknowledged-unverified',
      );
    resolved.push(matches[0]);
  }
  return Object.freeze({
    ok: true as const,
    rows: Object.freeze(resolved),
    seamKeys: Object.freeze(resolved.map(({ seamKey }) => seamKey)),
    lockVersion,
    outcome: 'verified-echo' as const,
    blocker: null,
  });
}

export type SeamWrites = {
  /**
   * One gesture in one request (C7): rows and step links together, under the card's version. The
   * steps are addressed after the form's autosave flush; the form adopts the committed links.
   */
  change: (change: SeamChangeInput, opts: SeamChangeOpts) => Promise<SeamChangeResult>;
  /** The list a new row is checked against, read again when old; false: it could not be read. */
  fresh: () => Promise<boolean>;
  /** Insert or replace these rows (by seam key); resolves true when the server took them. */
  upsert: (rows: StoredRow[], errorAt?: string) => Promise<boolean>;
  /** Same write, but only succeeds with the exact final rows and keys echoed by the server. */
  upsertWithReceipt: (rows: StoredRow[], errorAt?: string) => Promise<StrictSeamUpsertResult>;
  /** Delete these rows; resolves true when the server took it. */
  remove: (rows: StoredRow[]) => Promise<boolean>;
  /** Insert or replace these pose rows (P8, by seam key); true when the server took them. */
  upsertPoses: (rows: StoredPose[]) => Promise<boolean>;
  /** Delete these pose rows; true when the server took it. */
  removePoses: (rows: StoredPose[]) => Promise<boolean>;
  // The three gestures below are the user's own on one step: they go on past a form that only fails
  // validation (C9, `pastInvalidForm`). upsert / remove / the poses' pair serve undo, auto-reconfirm and
  // the strip teardown — they keep the form saved first.
  /** ACCEPT: one seam row written AND linked to the step in one change; the key it is stored under. */
  acceptSeam: (row: StoredSeam, step: StepRef) => Promise<{ ok: true; key: string } | Refused>;
  /**
   * Exact ACCEPT for a captured saved operation. It never retries after a lock move, and succeeds
   * only when the RPC echoes the submitted exact row.
   */
  acceptSeamStrict: (
    row: StoredSeam,
    step: StepRef,
    guard?: StrictSeamAcceptGuard,
  ) => Promise<StrictSeamAcceptResult>;
  /**
   * A seam taken off a step. The server deletes the row with its last link; `gone`: this page expects
   * that (no other step links it), so the row leaves the list at once.
   */
  detachSeam: (step: StepRef, seamKey: string, gone: boolean) => Promise<SeamChangeResult>;
  /** A step's pose rows (P8) in one change: `drop` deleted, `put` written and linked, `reflag` rewritten. */
  placePoses: (
    step: StepRef,
    put: readonly StoredPose[],
    drop: readonly StoredPose[],
    reflag: readonly StoredPose[],
  ) => Promise<boolean>;
  frozen: boolean;
};

export function useSeamWrites(cardId: number | undefined, frozen: boolean): SeamWrites {
  const qc = useQueryClient();
  const undoHistory = useUndoHistory();

  const change = useCallback(
    async (c: SeamChangeInput, opts: SeamChangeOpts): Promise<SeamChangeResult> => {
      if (frozen) {
        refuseGesture('SEAMS', 'frozen', FROZEN_REFUSAL);
        return { ok: false, why: 'frozen' };
      }
      if (!cardId) {
        refuseGesture(
          'SEAMS',
          'not saved',
          'save the card first — seams are stored on a saved card',
        );
        return NOT_WRITTEN;
      }
      return runSeamChange(cardId, c, opts, {
        call: (req) => adminService.ChangeTechCardSeams(req),
        // The store already holds the answer; the card query reads the same version again.
        settled: (id) => void qc.invalidateQueries({ queryKey: techCardKeys.detail(id) }),
        // The row says «refused: …» on the page; the inbox keeps it.
        refused: (verb, why) =>
          notify(
            { sev: 'error', subject: 'SEAM', text: `${verb} not saved`, detail: why },
            { toast: false },
          ),
      });
    },
    [cardId, frozen, qc],
  );

  // The list a new row is checked against must be recent: another client may have confirmed the
  // same pair since this card was read (the card query lives 5 min). Older than FRESH_MS → read
  // the card's rows again first (one read per card for writes queued meanwhile). False: the list
  // could not be read, so a new row is not written against it.
  const fresh = useCallback(async (): Promise<boolean> => {
    if (!cardId || frozen) return true;
    const s = useSeamsStore.getState();
    const readAt = qc.getQueryState(techCardKeys.detail(cardId))?.dataUpdatedAt ?? 0;
    if (Date.now() - Math.max(readAt, s.serverAt) <= FRESH_MS) return true;
    return refreshSeams(cardId);
  }, [cardId, frozen, qc]);

  const upsert = useCallback(
    async (rows0: StoredRow[], errorAt?: string) => {
      if (!(await fresh())) {
        refuseGesture('SEAMS', 'not read', 'the seam list did not load — try again');
        return false;
      }
      // The card changed while its list was read: this write belongs to nobody here.
      if (cardId && useSeamsStore.getState().cardId !== cardId) return false;
      // A new row of a pair already stored (server or in flight) goes onto that row's key.
      const seams = reuseKeys(
        rows0.filter((row): row is StoredSeam => row.kind !== 'pose'),
        rowsOf(useSeamsStore.getState()),
      );
      const poses = rows0.filter((row): row is StoredPose => row.kind === 'pose');
      const rows: StoredRow[] = [...seams, ...poses];
      const res = await change(
        { upsert: rows },
        { verb: rows.length > 1 ? `decisions (${rows.length})` : 'decision', errorAt },
      );
      return res.ok;
    },
    [cardId, change, fresh],
  );

  const upsertWithReceipt = useCallback(
    async (rows0: StoredRow[], errorAt?: string): Promise<StrictSeamUpsertResult> => {
      if (rows0.length === 0)
        return strictUpsertBlocked(
          'receipt-missing',
          'A strict seam write requires at least one row.',
          'not-attempted',
        );
      if (frozen) return strictUpsertBlocked('frozen', FROZEN_REFUSAL, 'not-attempted');
      if (!cardId)
        return strictUpsertBlocked(
          'card-unsaved',
          'Save the card before writing exact seams.',
          'not-attempted',
        );
      if (!(await fresh()))
        return strictUpsertBlocked(
          'write-failed',
          'The seam list did not load before the write.',
          'unknown',
        );
      if (useSeamsStore.getState().cardId !== cardId)
        return strictUpsertBlocked(
          'card-changed',
          'The open tech card changed before the seam write started.',
          'not-attempted',
        );
      const seams = reuseExactKeys(
        rows0.filter((row): row is StoredSeam => row.kind !== 'pose'),
        rowsOf(useSeamsStore.getState()),
      );
      const poses = rows0.filter((row): row is StoredPose => row.kind === 'pose');
      const rows: StoredRow[] = [...seams, ...poses];
      const result = await change(
        { upsert: rows },
        { verb: rows.length > 1 ? `decisions (${rows.length})` : 'decision', errorAt },
      );
      if (!result.ok)
        return strictUpsertBlocked(
          result.why === 'still saving' ? 'write-in-flight' : 'write-failed',
          result.why,
          result.why === 'still saving' ? 'not-attempted' : 'unknown',
        );
      if (useSeamsStore.getState().cardId !== cardId)
        return strictUpsertBlocked(
          'card-changed',
          'The open tech card changed before the seam write echo arrived.',
          'acknowledged-unverified',
        );
      if (!result.echo || result.echo.length === 0)
        return strictUpsertBlocked(
          'echo-missing',
          'The seam write was acknowledged without a row echo.',
          'acknowledged-unverified',
        );
      return resolveStrictSeamUpsertReceipt(rows, result.echo, result.lockVersion);
    },
    [cardId, change, fresh, frozen],
  );

  const remove = useCallback(
    async (rows: StoredRow[]) => {
      undoHistory.cut('seam-delete');
      const res = await change({ delete: rows.map((r) => r.seamKey) }, { verb: 'removal' });
      return res.ok;
    },
    [change, undoHistory],
  );

  // A pose (P8) is one row per piece per step, keyed by the caller (it replaces its own key), so no
  // pair reuse: the server list is not consulted first.
  const upsertPoses = useCallback(
    async (rows: StoredPose[]) => (await change({ upsert: rows }, { verb: 'placement' })).ok,
    [change],
  );

  const removePoses = useCallback(
    async (rows: StoredPose[]) =>
      (await change({ delete: rows.map((r) => r.seamKey) }, { verb: 'placement removal' })).ok,
    [change],
  );

  const acceptSeam = useCallback(
    async (row0: StoredSeam, step: StepRef): Promise<{ ok: true; key: string } | Refused> => {
      if (!(await fresh())) {
        refuseGesture('SEAMS', 'not read', 'the seam list did not load — try again');
        return NOT_WRITTEN;
      }
      if (cardId && useSeamsStore.getState().cardId !== cardId) return NOT_WRITTEN;
      const [row] = reuseKeys([row0], rowsOf(useSeamsStore.getState()));
      const res = await change(
        { upsert: [row], link: [{ step, seamKey: row.seamKey }] },
        {
          verb: 'decision',
          pastInvalidForm: true,
          ...(row.seamKey !== row0.seamKey ? { errorAt: row0.seamKey } : {}),
        },
      );
      return res.ok ? { ok: true, key: res.keyMap.get(row.seamKey) ?? row.seamKey } : res;
    },
    [cardId, change, fresh],
  );

  const acceptSeamStrict = useCallback(
    async (
      row0: StoredSeam,
      step: StepRef,
      guard?: StrictSeamAcceptGuard,
    ): Promise<StrictSeamAcceptResult> => {
      if (frozen) return strictUpsertBlocked('frozen', FROZEN_REFUSAL, 'not-attempted');
      if (!cardId)
        return strictUpsertBlocked(
          'card-unsaved',
          'Save the card before linking an exact seam.',
          'not-attempted',
        );
      if (!(await fresh()))
        return strictUpsertBlocked(
          'write-failed',
          'The seam list did not load before the exact link write.',
          'not-attempted',
        );
      if (useSeamsStore.getState().cardId !== cardId)
        return strictUpsertBlocked(
          'card-changed',
          'The open tech card changed before the exact link write started.',
          'not-attempted',
        );
      const [row] = reuseExactKeys([row0], rowsOf(useSeamsStore.getState()));
      const result = await change(
        { upsert: [row], link: [{ step, seamKey: row.seamKey }] },
        {
          verb: 'decision',
          pastInvalidForm: true,
          retryLockMoved: false,
          beforeRequest: ({ expectedLockVersion }) => {
            if (!guard) return null;
            if (expectedLockVersion !== guard.expectedLockVersion)
              return 'The saved card moved after the exact operation was captured.';
            const validation = guard.validate();
            return validation.ok ? null : validation.why;
          },
          ...(row.seamKey !== row0.seamKey ? { errorAt: row0.seamKey } : {}),
        },
      );
      if (!result.ok)
        return strictUpsertBlocked(
          result.why === 'still saving' ? 'write-in-flight' : 'write-failed',
          result.why,
          result.why === 'still saving' ? 'not-attempted' : result.outcome ?? 'unknown',
        );
      if (useSeamsStore.getState().cardId !== cardId)
        return strictUpsertBlocked(
          'card-changed',
          'The open tech card changed before the exact link write echo arrived.',
          'acknowledged-unverified',
        );
      if (!result.echo || result.echo.length === 0)
        return strictUpsertBlocked(
          'echo-missing',
          'The exact link write was acknowledged without a seam row echo.',
          'acknowledged-unverified',
        );
      const receipt = resolveStrictSeamUpsertReceipt([row], result.echo, result.lockVersion);
      if (!receipt.ok) return receipt;
      const echoed = receipt.rows[0];
      if (
        !echoed ||
        echoed.kind === 'pose' ||
        echoed.status !== row.status ||
        echoed.kind !== row.kind ||
        echoed.direction !== row.direction ||
        echoed.source !== row.source ||
        echoed.anchoredSize !== row.anchoredSize ||
        echoed.note !== row.note ||
        JSON.stringify(echoed.sideA) !== JSON.stringify(row.sideA) ||
        JSON.stringify(echoed.sideB) !== JSON.stringify(row.sideB)
      )
        return strictUpsertBlocked(
          'receipt-missing',
          'The exact link write echoed a different seam row.',
          'acknowledged-unverified',
        );
      return Object.freeze({
        ok: true as const,
        row: echoed,
        seamKey: echoed.seamKey,
        lockVersion: receipt.lockVersion,
        outcome: 'verified-echo' as const,
        blocker: null,
      });
    },
    [cardId, change, fresh, frozen],
  );

  const detachSeam = useCallback(
    async (step: StepRef, seamKey: string, gone: boolean) => {
      if (gone) undoHistory.cut('seam-delete');
      return change(
        { detach: [{ step, seamKey }] },
        { verb: 'removal', pastInvalidForm: true, ...(gone ? { gone: [seamKey] } : {}) },
      );
    },
    [change, undoHistory],
  );

  const placePoses = useCallback(
    async (
      step: StepRef,
      put: readonly StoredPose[],
      drop: readonly StoredPose[],
      reflag: readonly StoredPose[],
    ) =>
      (
        await change(poseChange(step, put, drop, reflag), {
          verb: 'placement',
          pastInvalidForm: true,
        })
      ).ok,
    [change],
  );

  return useMemo(
    () => ({
      change,
      fresh,
      upsert,
      upsertWithReceipt,
      remove,
      upsertPoses,
      removePoses,
      acceptSeam,
      acceptSeamStrict,
      detachSeam,
      placePoses,
      frozen,
    }),
    [
      change,
      fresh,
      upsert,
      upsertWithReceipt,
      remove,
      upsertPoses,
      removePoses,
      acceptSeam,
      acceptSeamStrict,
      detachSeam,
      placePoses,
      frozen,
    ],
  );
}
