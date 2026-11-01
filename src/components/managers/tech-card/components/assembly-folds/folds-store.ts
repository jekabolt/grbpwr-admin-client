// PIECE FOLDS OF THE OPEN CARD — the stored fold lines (doll-folds SPEC-T2), one store for every
// reader. The card read (`TechCard.pieceFolds`) and every RPC echo land in `server`, the optimistic
// writes in `pending`; `foldRowsOf` is the list everybody reads (server with pending laid over it).
// Mirrors assembly-seams/seams-store.ts; no UI reads it yet (the doll wires it in SPEC-T3).

import { foldsFromWire, type StoredFold, type TechCardPieceFoldWire } from 'lib/folds';
import { useEffect } from 'react';
import { create } from 'zustand';

export type FoldPendingOp =
  | { kind: 'upsert'; row: StoredFold }
  | { kind: 'delete'; row?: StoredFold };

type FoldsState = {
  /** The card these rows belong to; another card resets the store. */
  cardId: number | null;
  /** The last list the server gave: the card read or an RPC echo, whichever came later. */
  server: StoredFold[];
  /** Rows of the last list this client cannot read (a newer server's kind or source). */
  unreadable: number;
  /** Optimistic writes in flight, by fold key. */
  pending: Record<string, FoldPendingOp>;
  /** The server's refusal of the last write of a row, in its words, by fold key. */
  errors: Record<string, string>;
  /** When `server` was last taken from the server itself (an RPC echo or a fresh read), ms. */
  serverAt: number;
};

const EMPTY: FoldsState = {
  cardId: null,
  server: [],
  unreadable: 0,
  pending: {},
  errors: {},
  serverAt: 0,
};

export const useFoldsStore = create<FoldsState>(() => EMPTY);

/** Server rows with the pending writes laid over them (a delete hides, an upsert replaces / adds). */
export function foldRowsOf(s: Pick<FoldsState, 'server' | 'pending'>): StoredFold[] {
  const out: StoredFold[] = [];
  const seen = new Set<string>();
  for (const r of s.server) {
    seen.add(r.foldKey);
    const op = s.pending[r.foldKey];
    if (!op) out.push(r);
    else if (op.kind === 'upsert') out.push(op.row);
  }
  for (const [k, op] of Object.entries(s.pending)) {
    if (op.kind === 'upsert' && !seen.has(k)) out.push(op.row);
  }
  return out;
}

/** A cheap signature of a row list (memo / effect key). */
export function foldRowsSig(rows: readonly StoredFold[]): string {
  return rows
    .map(
      (r) =>
        `${r.foldKey}:${r.seq}:${r.kind}:${r.stale ? 1 : 0}:${r.line.flat().join(',')}:${r.flipAt.join(',')}:${r.edge?.offsetMm ?? ''}`,
    )
    .sort()
    .join('|');
}

/** A server list (card read or echo) → the store's shape. */
export function readFoldWire(wire: readonly TechCardPieceFoldWire[] | undefined): {
  rows: StoredFold[];
  unreadable: number;
} {
  const { folds, unreadable } = foldsFromWire(wire);
  return { rows: folds, unreadable };
}

/** The card read arrived (or the card changed): its rows become the server's list. */
export function hydrateFolds(
  cardId: number | null,
  wire: readonly TechCardPieceFoldWire[] | undefined,
) {
  const { rows, unreadable } = readFoldWire(wire);
  const s = useFoldsStore.getState();
  if (s.cardId !== cardId) {
    useFoldsStore.setState({ ...EMPTY, cardId, server: rows, unreadable });
    return;
  }
  useFoldsStore.setState({ server: rows, unreadable });
}

export function resetFolds() {
  useFoldsStore.setState(EMPTY);
}

/** The card's fold rows as every reader sees them. */
export function useFoldRows(): StoredFold[] {
  const server = useFoldsStore((s) => s.server);
  const pending = useFoldsStore((s) => s.pending);
  return foldRowsOf({ server, pending });
}

/** The rows' signature, for a reader that memoises on it (the doll, SPEC-T3). */
export function useFoldRowsSig(): string {
  return useFoldsStore((s) => foldRowsSig(foldRowsOf(s)));
}

/**
 * Keeps the store on the card read: the card's `pieceFolds` hydrate it whenever the card or its
 * list changes (an echo already in `server` is the same list, so nothing moves). Mount it where the
 * card is read (SPEC-T3 wires it next to the seams' hydration).
 */
export function useHydrateFolds(
  cardId: number | undefined,
  wire: readonly TechCardPieceFoldWire[] | undefined,
) {
  useEffect(() => {
    if (!cardId) return;
    hydrateFolds(cardId, wire);
  }, [cardId, wire]);
}
