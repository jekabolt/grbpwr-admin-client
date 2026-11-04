// SEAM DECISIONS OF THE OPEN CARD — one store between three readers (03-SEAMS-DESIGN §4, §5).
//
//   • the card read (`TechCard.seams`) and every RPC echo land in `server`, the optimistic writes in
//     `pending`; `rowsOf` is the list everybody reads (server with the pending rows laid over it);
//   • the provider of the seam graph (`card-unit-pictures.tsx`, Need A) asks `cardSeamDecisions`
//     for the decisions of the facts it is about to read, and appends `useCardSeamsSig()` to its
//     facts signature — so a decision re-reads the graph the ASSEMBLY MAP, the pictograms and the
//     doll draw;
//   • retained seam readers use `resolved` and `facts` from the same graph read;
//   • a POSE row (P8, a piece placed by hand in a step) rides the same table but is not a seam: the
//     one split is `readWire` (lib/seams `splitWire`) — poses land in `poses` / `posePending`, read
//     by `posesOf`, and never reach `server`, `rowsOf` or the resolver.
//
// A store and not a context: hydration and graph readers are siblings, while a context only flows
// down.

import type { SeamDecisions, PieceGeom, SkeletonFacts } from 'lib/assembly-skeleton/types';
import {
  decisionsFor,
  grainDegOf,
  splitWire,
  type Resolved,
  type StoredPose,
  type StoredSeam,
  type TechCardSeamWire,
} from 'lib/seams';
import { useEffect } from 'react';
import { create } from 'zustand';

import { rowTouchesStrip } from '../cut-strips/strip-pieces';

const NO_STRIPS: ReadonlySet<string> = new Set();

export type PendingOp = { kind: 'upsert'; row: StoredSeam } | { kind: 'delete'; row?: StoredSeam };
export type PosePendingOp =
  | { kind: 'upsert'; row: StoredPose }
  | { kind: 'delete'; row?: StoredPose };

type SeamsState = {
  /** The card these rows belong to; another card resets the store. */
  cardId: number | null;
  /** The last list the server gave: the card read or an RPC echo, whichever came later. */
  server: StoredSeam[];
  /** Rows the card read carried that this client cannot read (a newer server's status or kind). */
  unreadable: number;
  /** Optimistic writes in flight, by seam key. */
  pending: Record<string, PendingOp>;
  /** The pose rows of the last server list (P8) — never seams, never in `server`. */
  poses: StoredPose[];
  /** Optimistic pose writes in flight, by seam key. */
  posePending: Record<string, PosePendingOp>;
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
  poses: [],
  posePending: {},
  errors: {},
  resolved: null,
  facts: null,
  grainDeg: null,
  serverAt: 0,
};

export const useSeamsStore = create<SeamsState>(() => EMPTY);

function overlay<T extends { seamKey: string }>(
  server: readonly T[],
  pending: Readonly<Record<string, { kind: 'upsert'; row: T } | { kind: 'delete' }>>,
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const r of server) {
    seen.add(r.seamKey);
    const p = pending[r.seamKey];
    if (p?.kind === 'delete') continue;
    out.push(p?.kind === 'upsert' ? p.row : r);
  }
  for (const [key, p] of Object.entries(pending))
    if (p.kind === 'upsert' && !seen.has(key)) out.push(p.row);
  return out;
}

/** Server rows with the optimistic writes laid over them, in server order, new rows last. */
export function rowsOf(s: Pick<SeamsState, 'server' | 'pending'>): StoredSeam[] {
  return overlay(s.server, s.pending);
}

/** The pose rows (P8) with the optimistic pose writes laid over them — the seams' twin of `rowsOf`. */
export function posesOf(s: Pick<SeamsState, 'poses' | 'posePending'>): StoredPose[] {
  return overlay(s.poses, s.posePending);
}

/**
 * What a re-read of the graph depends on: identity, status, kind, direction, the anchors' hints and
 * its hand placement and the server's verdict. A note is not in it — words do not move a seam.
 */
export function rowsSig(rows: readonly StoredSeam[]): string {
  return rows
    .map(
      (r) =>
        `${r.seamKey}:${r.status}:${r.kind}:${r.direction}:${r.stale ? 1 : 0}:${r.updatedAt ?? ''}:${[
          ...r.sideA,
          ...r.sideB,
        ]
          .map((a) => {
            const p = a.placement;
            const placement = p ? `@${p.xMm},${p.yMm},${p.rotDeg},${p.flip ? 1 : 0}` : '';
            return `${a.edgeHint}@${a.contourSig}${placement}`;
          })
          .join('/')}`,
    )
    .sort()
    .join(',');
}

/** A row's pair, order-free: kind + both sides' run hints (the same pair from two clients agrees). */
export function rowPairSig(r: StoredSeam): string {
  // Two spans of one edge are two seams: a real range is part of the pair, a whole edge reads as before.
  const span = (a: StoredSeam['sideA'][number]) =>
    r.kind !== 'edge' && (a.range[0] > 0.0001 || a.range[1] < 0.9999)
      ? `@${a.range[0].toFixed(3)}-${a.range[1].toFixed(3)}`
      : '';
  const side = (xs: StoredSeam['sideA']) =>
    xs
      .map((a) => `${a.edgeHint}${span(a)}`)
      .sort()
      .join('+');
  return `${r.kind}|${[side(r.sideA), side(r.sideB)].sort().join('~')}`;
}

/** A pair plus its sewn windows: two partial rows on one pair remain two independent rows. */
export function rowPairRangeSig(r: StoredSeam): string {
  const side = (xs: StoredSeam['sideA']) =>
    xs
      .map((anchor) => `${anchor.edgeHint}@${anchor.range[0]}-${anchor.range[1]}`)
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
  for (const r of have)
    if (!bySig.has(rowPairRangeSig(r))) bySig.set(rowPairRangeSig(r), r.seamKey);
  return rows.map((r) => {
    if (keys.has(r.seamKey)) return r;
    const k = bySig.get(rowPairRangeSig(r));
    return k ? { ...r, seamKey: k } : r;
  });
}

/**
 * The card read's rows: THE split of a stored list — seams (readable ones) in `rows`, pose rows in
 * `poses`, how many were neither. Every list from the server enters the store through here.
 */
export function readWire(wire: readonly TechCardSeamWire[] | undefined): {
  rows: StoredSeam[];
  poses: StoredPose[];
  unreadable: number;
} {
  const { seams, poses, unreadable } = splitWire(wire);
  return { rows: seams, poses, unreadable };
}

/** The card read arrived (or the card changed): its rows become the server's list. */
export function hydrateSeams(cardId: number | null, wire: readonly TechCardSeamWire[] | undefined) {
  const { rows, poses, unreadable } = readWire(wire);
  const s = useSeamsStore.getState();
  if (s.cardId !== cardId) {
    useSeamsStore.setState({ ...EMPTY, cardId, server: rows, poses, unreadable });
    return;
  }
  // Another list (a re-upload stamped rows stale, a colleague decided): the last verdict was read
  // on the old rows and must not vouch for the new ones until the provider re-reads.
  const changed = rowsSig(rows) !== rowsSig(s.server);
  useSeamsStore.setState({
    server: rows,
    poses,
    unreadable,
    ...(changed ? { resolved: null } : {}),
  });
}

export function resetSeams() {
  useSeamsStore.setState(EMPTY);
}

/** Keep the open card's saved decisions available to every seam-graph reader. */
export function useHydrateSeams(
  cardId: number | null,
  wire: readonly TechCardSeamWire[] | undefined,
) {
  useEffect(() => hydrateSeams(cardId, wire), [cardId, wire]);
  useEffect(() => () => resetSeams(), []);
}

/**
 * NEED A — the decisions the provider hands `readSeamGraph`: the card's rows resolved on the very
 * pieces the graph matches. No rows → undefined: the engine alone, byte for byte as before.
 */
export function cardSeamDecisions(
  facts: SkeletonFacts,
  stripKeys?: ReadonlySet<string>,
): ((pieces: readonly PieceGeom[]) => SeamDecisions) | undefined {
  const s = useSeamsStore.getState();
  useSeamsStore.setState({ facts, grainDeg: grainDegOf(facts) });
  // A strip's seam is not the garment's: its piece is out of this read, so it would come back orphan.
  const rows = rowsOf(s).filter((row) => !rowTouchesStrip(row, stripKeys ?? NO_STRIPS));
  const d = decisionsFor(rows, facts, (resolved) => useSeamsStore.setState({ resolved }));
  if (!d) useSeamsStore.setState({ resolved: null });
  return d;
}

/** NEED A — the rows' signature, appended to the provider's facts signature. */
export function useCardSeamsSig(): string {
  return useSeamsStore((s) => rowsSig(rowsOf(s)));
}
