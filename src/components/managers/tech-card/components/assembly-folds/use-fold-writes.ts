// Fold writes of the open card: optimistic in the store, the RPC echo replaces `server`, the card
// query is invalidated so the next read agrees. Mirrors assembly-seams/use-seam-decisions.ts
// (useSeamWrites); the server does the locking and the frozen / membership checks.

import { adminService } from 'api/api';
import type { common_TechCardPieceFold } from 'api/proto-http/admin';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useQueryClient } from '@tanstack/react-query';
import { foldToWire, type StoredFold, type TechCardPieceFoldWire } from 'lib/folds';
import { notify } from 'lib/stores/store';
import { useCallback, useMemo } from 'react';
import { FROZEN_REFUSAL } from '../assembly-fullscreen';
import { refuseGesture } from '../refuse-gesture';
import { readFoldWire, useFoldsStore, type FoldPendingOp } from './folds-store';

const message = (e: unknown) =>
  e instanceof Error ? e.message.replace(/^Error:\s*/, '') : 'the server did not answer';

export type FoldWrites = {
  /** Save rows (new or changed); false when refused or not sent. */
  upsert: (rows: StoredFold[]) => Promise<boolean>;
  /** Remove rows by their keys. */
  remove: (rows: StoredFold[]) => Promise<boolean>;
  frozen: boolean;
};

export function useFoldWrites(cardId: number | undefined, frozen: boolean): FoldWrites {
  const qc = useQueryClient();

  const settle = useCallback(
    (keys: string[], echo: readonly TechCardPieceFoldWire[] | undefined, error?: string) => {
      const s = useFoldsStore.getState();
      // The card may have changed while the call flew: then its echo belongs to nobody here.
      if (s.cardId !== (cardId ?? null)) return;
      const pending = { ...s.pending };
      const errors = { ...s.errors };
      for (const k of keys) {
        delete pending[k];
        if (error) errors[k] = error;
        else delete errors[k];
      }
      const read = echo ? readFoldWire(echo) : null;
      useFoldsStore.setState({
        pending,
        errors,
        ...(read ? { server: read.rows, unreadable: read.unreadable, serverAt: Date.now() } : {}),
      });
      if (cardId) qc.invalidateQueries({ queryKey: techCardKeys.detail(cardId) });
    },
    [cardId, qc],
  );

  const run = useCallback(
    async (
      ops: Record<string, FoldPendingOp>,
      call: () => Promise<{ folds: common_TechCardPieceFold[] | undefined }>,
      verb: string,
    ): Promise<boolean> => {
      if (frozen) {
        refuseGesture('FOLDS', 'frozen', FROZEN_REFUSAL);
        return false;
      }
      if (!cardId) {
        refuseGesture('FOLDS', 'not saved', 'save the card first');
        return false;
      }
      const keys = Object.keys(ops);
      if (!keys.length) return true;
      const s = useFoldsStore.getState();
      // One write per row at a time: a second intent on a row in flight is dropped, never raced.
      if (keys.some((k) => s.pending[k])) return false;
      const errors = { ...s.errors };
      for (const k of keys) delete errors[k];
      useFoldsStore.setState({ pending: { ...s.pending, ...ops }, errors });
      try {
        const res = await call();
        settle(keys, (res.folds ?? []) as TechCardPieceFoldWire[]);
        return true;
      } catch (e) {
        const why = message(e);
        settle(keys, undefined, why);
        notify(
          { sev: 'error', subject: 'FOLD', text: `${verb} not saved`, detail: why },
          { toast: false },
        );
        return false;
      }
    },
    [cardId, frozen, settle],
  );

  const upsert = useCallback(
    (rows: StoredFold[]) =>
      run(
        Object.fromEntries(rows.map((row) => [row.foldKey, { kind: 'upsert' as const, row }])),
        () =>
          adminService.UpsertTechCardPieceFolds({
            techCardId: cardId,
            folds: rows.map(foldToWire) as common_TechCardPieceFold[],
          }),
        rows.length > 1 ? `folds (${rows.length})` : 'fold',
      ),
    [cardId, run],
  );

  const remove = useCallback(
    (rows: StoredFold[]) =>
      run(
        Object.fromEntries(rows.map((row) => [row.foldKey, { kind: 'delete' as const, row }])),
        () =>
          adminService.DeleteTechCardPieceFolds({
            techCardId: cardId,
            foldKeys: rows.map((r) => r.foldKey),
          }),
        'fold removal',
      ),
    [cardId, run],
  );

  return useMemo(() => ({ upsert, remove, frozen }), [upsert, remove, frozen]);
}
