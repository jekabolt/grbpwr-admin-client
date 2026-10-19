// SEAM DECISIONS OF THE OPEN CARD — one store between three readers (03-SEAMS-DESIGN §4, §5).
//
//   • the card read (`TechCard.seams`) and every RPC echo land in `server`, the optimistic writes in
//     `pending`; `rowsOf` is the list everybody reads (server with the pending rows laid over it);
//   • the provider of the seam graph (`card-unit-pictures.tsx`, Need A) asks `cardSeamDecisions`
//     for the decisions of the facts it is about to read, and appends `useCardSeamsSig()` to its
//     facts signature — so a decision re-reads the graph the ASSEMBLY MAP, the pictograms and the
//     doll draw;
//   • the SEAMS review reads `resolved` (stale / orphan / applied rows) and `facts` (grain lines for
//     the anchors, piece inputs for the POM role words) off the very read the graph came from.
//
// A store and not a context: the provider sits ABOVE the door that hydrates it (the door is a child
// of the map, the map a child of the provider), and a context only flows down.

import type { SeamDecisions, PieceGeom, SkeletonFacts } from 'lib/assembly-skeleton/types';
import {
  decisionsFor,
  fromWire,
  grainDegOf,
  type Resolved,
  type StoredSeam,
  type TechCardSeamWire,
} from 'lib/seams';
import { create } from 'zustand';

export type PendingOp = { kind: 'upsert'; row: StoredSeam } | { kind: 'delete'; row?: StoredSeam };

type SeamsState = {
  /** The card these rows belong to; another card resets the store. */
  cardId: number | null;
  /** The last list the server gave: the card read or an RPC echo, whichever came later. */
  server: StoredSeam[];
  /** Rows the card read carried that this client cannot read (a newer server's status or kind). */
  unreadable: number;
  /** Optimistic writes in flight, by seam key. */
  pending: Record<string, PendingOp>;
  /** The server's refusal of the last write of a row, in its words, by seam key. */
  errors: Record<string, string>;
  /** The provider's verdict on the rows it read the graph with (null: no rows, or not read yet). */
  resolved: Resolved | null;
  /** The facts the provider read the graph from — grain lines for anchors, inputs for POM roles. */
  facts: SkeletonFacts | null;
  grainDeg: Map<string, number> | null;
  /** When `server` was last taken from the server itself (an RPC echo or a fresh read), ms. */
  serverAt: number;
};

const EMPTY: SeamsState = {
  cardId: null,
  server: [],
  unreadable: 0,
  pending: {},
  errors: {},
  resolved: null,
  facts: null,
  grainDeg: null,
  serverAt: 0,
};

export const useSeamsStore = create<SeamsState>(() => EMPTY);

/** Server rows with the optimistic writes laid over them, in server order, new rows last. */
export function rowsOf(s: Pick<SeamsState, 'server' | 'pending'>): StoredSeam[] {
  const out: StoredSeam[] = [];
  const seen = new Set<string>();
  for (const r of s.server) {
    seen.add(r.seamKey);
    const p = s.pending[r.seamKey];
    if (p?.kind === 'delete') continue;
    out.push(p?.kind === 'upsert' ? p.row : r);
  }
  for (const [key, p] of Object.entries(s.pending))
    if (p.kind === 'upsert' && !seen.has(key)) out.push(p.row);
  return out;
}

/**
 * What a re-read of the graph depends on: identity, status, kind, direction, the anchors' hints and
 * the server's verdict. A note is not in it — words do not move a seam.
 */
export function rowsSig(rows: readonly StoredSeam[]): string {
  return rows
    .map(
      (r) =>
        `${r.seamKey}:${r.status}:${r.kind}:${r.direction}:${r.stale ? 1 : 0}:${r.updatedAt ?? ''}:${[
          ...r.sideA,
          ...r.sideB,
        ]
          .map((a) => `${a.edgeHint}@${a.contourSig}`)
          .join('/')}`,
    )
    .sort()
    .join(',');
}

/** A row's pair, order-free: kind + both sides' run hints (the same pair from two clients agrees). */
export function rowPairSig(r: StoredSeam): string {
  const side = (xs: StoredSeam['sideA']) =>
    xs
      .map((a) => a.edgeHint)
      .sort()
      .join('+');
  return `${r.kind}|${[side(r.sideA), side(r.sideB)].sort().join('~')}`;
}

/**
 * New rows onto the key of a row already stored for the same pair (another client confirmed it a
 * moment ago, or a write of this tab is still in flight): one pair, one row — never two keys.
 */
export function reuseKeys(rows: readonly StoredSeam[], have: readonly StoredSeam[]): StoredSeam[] {
  const keys = new Set(have.map((r) => r.seamKey));
  const bySig = new Map<string, string>();
  for (const r of have) if (!bySig.has(rowPairSig(r))) bySig.set(rowPairSig(r), r.seamKey);
  return rows.map((r) => {
    if (keys.has(r.seamKey)) return r;
    const k = bySig.get(rowPairSig(r));
    return k ? { ...r, seamKey: k } : r;
  });
}

/** The card read's rows, readable ones only; how many were not. */
export function readWire(wire: readonly TechCardSeamWire[] | undefined): {
  rows: StoredSeam[];
  unreadable: number;
} {
  const rows: StoredSeam[] = [];
  let unreadable = 0;
  for (const w of wire ?? []) {
    const r = fromWire(w);
    if (r) rows.push(r);
    else unreadable += 1;
  }
  return { rows, unreadable };
}

/** The card read arrived (or the card changed): its rows become the server's list. */
export function hydrateSeams(cardId: number | null, wire: readonly TechCardSeamWire[] | undefined) {
  const { rows, unreadable } = readWire(wire);
  const s = useSeamsStore.getState();
  if (s.cardId !== cardId) {
    useSeamsStore.setState({ ...EMPTY, cardId, server: rows, unreadable });
    return;
  }
  // Another list (a re-upload stamped rows stale, a colleague decided): the last verdict was read
  // on the old rows and must not vouch for the new ones until the provider re-reads.
  const changed = rowsSig(rows) !== rowsSig(s.server);
  useSeamsStore.setState({ server: rows, unreadable, ...(changed ? { resolved: null } : {}) });
}

export function resetSeams() {
  useSeamsStore.setState(EMPTY);
}

/**
 * NEED A — the decisions the provider hands `readSeamGraph`: the card's rows resolved on the very
 * pieces the graph matches. No rows → undefined: the engine alone, byte for byte as before.
 */
export function cardSeamDecisions(
  facts: SkeletonFacts,
): ((pieces: readonly PieceGeom[]) => SeamDecisions) | undefined {
  const s = useSeamsStore.getState();
  useSeamsStore.setState({ facts, grainDeg: grainDegOf(facts) });
  const rows = rowsOf(s);
  const d = decisionsFor(rows, facts, (resolved) => useSeamsStore.setState({ resolved }));
  if (!d) useSeamsStore.setState({ resolved: null });
  return d;
}

/** NEED A — the rows' signature, appended to the provider's facts signature. */
export function useCardSeamsSig(): string {
  return useSeamsStore((s) => rowsSig(rowsOf(s)));
}
