// READ AND WRITE THE SEAM DECISIONS (03-SEAMS-DESIGN §3.3, §5.3).
//
// Reads: the graph the provider read (held through its 400 ms settle, as the map holds it), the
// rows (server + optimistic) and the resolver's verdict → one `Review`.
//
// Writes: optimistic per row — the row is laid over the server's list at once, the RPC sends ONLY
// the rows that changed (a keyed upsert, never the whole list), the server's echo replaces the list
// (it carries `stale` and who / when), and the card query is invalidated so the next read agrees. A
// refused write puts the server's words on the row and reverts it. A released card writes nothing.

import { adminService } from 'api/api';
import type { common_TechCardSeam } from 'api/proto-http/admin';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackBarStore } from 'lib/stores/store';
import type { PieceGeom, SeamGraph } from 'lib/assembly-skeleton/types';
import { toWire, type StoredSeam, type TechCardSeamWire } from 'lib/seams';
import { useCallback, useMemo, useRef } from 'react';
import { useCardSeamGraph } from '../card-unit-pictures';
import { FROZEN_REFUSAL } from '../assembly-fullscreen';
import { buildReview, type Review } from './review-model';
import { readWire, rowsOf, useSeamsStore, type PendingOp } from './seams-store';

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

/** A row as the generated client sends it: output-only fields left empty. */
const wireOut = (row: StoredSeam): common_TechCardSeam => ({
  ...(toWire(row) as Omit<
    common_TechCardSeam,
    'stale' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt'
  >),
  stale: undefined,
  createdBy: undefined,
  createdAt: undefined,
  updatedBy: undefined,
  updatedAt: undefined,
});

const message = (e: unknown) =>
  e instanceof Error ? e.message.replace(/^Error:\s*/, '') : 'the server did not answer';

export type SeamWrites = {
  /** Insert or replace these rows (by seam key); resolves true when the server took them. */
  upsert: (rows: StoredSeam[], errorAt?: string) => Promise<boolean>;
  /** Delete these rows; resolves true when the server took it. */
  remove: (rows: StoredSeam[]) => Promise<boolean>;
  frozen: boolean;
};

export function useSeamWrites(cardId: number | undefined, frozen: boolean): SeamWrites {
  const qc = useQueryClient();
  const showMessage = useSnackBarStore((s) => s.showMessage);

  const settle = useCallback(
    (
      keys: string[],
      echo: readonly TechCardSeamWire[] | undefined,
      error?: string,
      errorAt?: string,
    ) => {
      const s = useSeamsStore.getState();
      // The card may have changed while the call flew: then its echo belongs to nobody here.
      if (s.cardId !== (cardId ?? null)) return;
      const pending = { ...s.pending };
      const errors = { ...s.errors };
      for (const k of [...keys, ...(errorAt ? [errorAt] : [])]) {
        delete pending[k];
        if (error) errors[k] = error;
        else delete errors[k];
      }
      useSeamsStore.setState({
        pending,
        errors,
        ...(echo ? { server: readWire(echo).rows } : {}),
      });
      if (cardId) qc.invalidateQueries({ queryKey: techCardKeys.detail(cardId) });
    },
    [cardId, qc],
  );

  const run = useCallback(
    async (
      ops: Record<string, PendingOp>,
      call: () => Promise<{ seams: common_TechCardSeam[] | undefined }>,
      verb: string,
      errorAt?: string,
    ): Promise<boolean> => {
      if (frozen) {
        showMessage(FROZEN_REFUSAL, 'error');
        return false;
      }
      if (!cardId) {
        showMessage('save the card first — seams are stored on a saved card', 'error');
        return false;
      }
      const keys = Object.keys(ops);
      const s = useSeamsStore.getState();
      // One write per row at a time: a second intent on a row in flight is dropped, never raced.
      if (keys.some((k) => s.pending[k])) return false;
      const errors = { ...s.errors };
      for (const k of [...keys, ...(errorAt ? [errorAt] : [])]) delete errors[k];
      useSeamsStore.setState({ pending: { ...s.pending, ...ops }, errors });
      try {
        const res = await call();
        settle(keys, (res.seams ?? []) as TechCardSeamWire[]);
        return true;
      } catch (e) {
        const why = message(e);
        settle(keys, undefined, why, errorAt);
        showMessage(`the seam ${verb} was not saved: ${why}`, 'error');
        return false;
      }
    },
    [cardId, frozen, settle, showMessage],
  );

  const upsert = useCallback(
    (rows: StoredSeam[], errorAt?: string) =>
      run(
        Object.fromEntries(rows.map((row) => [row.seamKey, { kind: 'upsert' as const, row }])),
        () => adminService.UpsertTechCardSeams({ techCardId: cardId, seams: rows.map(wireOut) }),
        rows.length > 1 ? `decisions (${rows.length})` : 'decision',
        errorAt,
      ),
    [cardId, run],
  );

  const remove = useCallback(
    (rows: StoredSeam[]) =>
      run(
        Object.fromEntries(rows.map((row) => [row.seamKey, { kind: 'delete' as const, row }])),
        () =>
          adminService.DeleteTechCardSeams({
            techCardId: cardId,
            seamKeys: rows.map((r) => r.seamKey),
          }),
        'removal',
      ),
    [cardId, run],
  );

  return { upsert, remove, frozen };
}
