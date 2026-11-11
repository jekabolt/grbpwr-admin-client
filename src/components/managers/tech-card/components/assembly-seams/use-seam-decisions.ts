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
import { poseChange, type SeamChange, type StepRef } from './seam-change-plan';
import {
  NOT_SAVED,
  runSeamChange,
  type SeamChangeOpts,
  type SeamChangeResult,
} from './seam-change';
import { hydrateSeams, reuseKeys, rowsOf, useSeamsStore } from './seams-store';
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

export type SeamWrites = {
  /**
   * One gesture in one request (C7): rows and step links together, under the card's version. The
   * steps are addressed after the form's autosave flush; the form adopts the committed links.
   */
  change: (change: SeamChange, opts: SeamChangeOpts) => Promise<SeamChangeResult>;
  /** The list a new row is checked against, read again when old; false: it could not be read. */
  fresh: () => Promise<boolean>;
  /** Insert or replace these rows (by seam key); resolves true when the server took them. */
  upsert: (rows: StoredRow[], errorAt?: string) => Promise<boolean>;
  /** Delete these rows; resolves true when the server took it. */
  remove: (rows: StoredRow[]) => Promise<boolean>;
  /** Insert or replace these pose rows (P8, by seam key); true when the server took them. */
  upsertPoses: (rows: StoredPose[]) => Promise<boolean>;
  /** Delete these pose rows; true when the server took it. */
  removePoses: (rows: StoredPose[]) => Promise<boolean>;
  /** ACCEPT: one seam row written AND linked to the step in one change; the key it is stored under. */
  acceptSeam: (row: StoredSeam, step: StepRef) => Promise<{ ok: true; key: string } | Refused>;
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
    async (c: SeamChange, opts: SeamChangeOpts): Promise<SeamChangeResult> => {
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
        { verb: 'decision', ...(row.seamKey !== row0.seamKey ? { errorAt: row0.seamKey } : {}) },
      );
      return res.ok ? { ok: true, key: res.keyMap.get(row.seamKey) ?? row.seamKey } : res;
    },
    [cardId, change, fresh],
  );

  const detachSeam = useCallback(
    async (step: StepRef, seamKey: string, gone: boolean) => {
      if (gone) undoHistory.cut('seam-delete');
      return change(
        { detach: [{ step, seamKey }] },
        { verb: 'removal', ...(gone ? { gone: [seamKey] } : {}) },
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
    ) => (await change(poseChange(step, put, drop, reflag), { verb: 'placement' })).ok,
    [change],
  );

  return useMemo(
    () => ({
      change,
      fresh,
      upsert,
      remove,
      upsertPoses,
      removePoses,
      acceptSeam,
      detachSeam,
      placePoses,
      frozen,
    }),
    [
      change,
      fresh,
      upsert,
      remove,
      upsertPoses,
      removePoses,
      acceptSeam,
      detachSeam,
      placePoses,
      frozen,
    ],
  );
}
