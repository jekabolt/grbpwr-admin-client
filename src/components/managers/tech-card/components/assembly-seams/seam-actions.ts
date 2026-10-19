// What a decision WRITES (03-SEAMS-DESIGN §2.3, §5.2): every row is anchored on the CURRENT graph at
// the moment of the decision, through lib/seams' own `seamFromCandidate` — the review never builds
// an anchor by hand. A re-confirm resolves the stale row once more as if the server had not flagged
// it and rewrites its anchors from what it resolves to today, under the same seam key.

import type { EdgeId, PieceGeom, SeamCandidate } from 'lib/assembly-skeleton/types';
import {
  newSeamKey,
  resolveSeamDecisions,
  seamFromCandidate,
  SEAMS,
  type StoredSeam,
  type StoredSeamDirection,
} from 'lib/seams';
import type { ReviewItem } from './review-model';
import { edgeOf, pieceOf } from './words';

export type AnchorCtx = {
  pieces: readonly PieceGeom[];
  grainDeg: ReadonlyMap<string, number> | null;
  nameOf: (pieceKey: string) => string;
  /** The size code the pieces were read on (honesty on the row, not used to resolve). */
  size?: string;
};

const opts = (ctx: AnchorCtx) => ({
  ...(ctx.grainDeg ? { grainDeg: ctx.grainDeg } : {}),
  ...(ctx.size ? { anchoredSize: ctx.size } : {}),
});

/** Accept / reject / closure of an engine proposal (or of its alternative reading). */
export function rowFromProposal(
  c: SeamCandidate,
  ctx: AnchorCtx,
  o: {
    status: 'confirmed' | 'rejected';
    closure?: boolean;
    direction?: StoredSeamDirection;
    note?: string;
  },
): StoredSeam | null {
  const cand: SeamCandidate = o.closure ? { ...c, kind: 'closure-not-seam' } : c;
  return seamFromCandidate(cand, ctx.pieces, {
    seamKey: newSeamKey(),
    status: o.status,
    source: 'graph',
    direction: o.direction ?? 'reversed',
    note: (o.note ?? '').trim().slice(0, 255),
    ...opts(ctx),
  });
}

/**
 * Edges of one side → the runs an anchor can name: contiguous edges of one piece become one chain
 * (`P#3+4`, at most SEAMS.maxChain long), everything else stays a run of its own, in click order.
 */
export function runsOfSide(edges: readonly EdgeId[], geoms: ReadonlyMap<string, PieceGeom>) {
  const runs: EdgeId[][] = [];
  for (const id of edges) {
    const e = edgeOf(id, geoms);
    const last = runs[runs.length - 1];
    const prev = last ? edgeOf(last[last.length - 1], geoms) : undefined;
    if (
      e &&
      prev &&
      last.length < SEAMS.maxChain &&
      pieceOf(id) === pieceOf(last[0]) &&
      prev.e === e.s
    ) {
      last.push(id);
      continue;
    }
    runs.push([id]);
  }
  return runs.map(
    (r) => `${pieceOf(r[0])}#${r.map((id) => id.slice(id.lastIndexOf('#') + 1)).join('+')}`,
  );
}

/** A hand connection (click A, click B; shift-click for more runs on a side) → a confirmed row. */
export function rowFromHand(
  a: readonly EdgeId[],
  b: readonly EdgeId[],
  geoms: ReadonlyMap<string, PieceGeom>,
  ctx: AnchorCtx,
  o: { direction: StoredSeamDirection; seamKey?: string; note?: string },
): StoredSeam | null {
  const ra = runsOfSide(a, geoms);
  const rb = runsOfSide(b, geoms);
  if (ra.length === 0 || rb.length === 0) return null;
  const composite = ra.length > 1 || rb.length > 1;
  const len = (ids: readonly EdgeId[]) =>
    ids.reduce((s, id) => s + (edgeOf(id, geoms)?.lenMm ?? 0), 0);
  const aLen = len(a);
  const bLen = len(b);
  const d = Math.abs(aLen - bLen);
  const c: SeamCandidate = {
    a: ra[0],
    b: rb[0],
    ...(composite ? { aParts: ra, bParts: rb } : {}),
    score: 1,
    kind: composite ? 'composite' : 'edge',
    evidence: {
      dLenMm: Math.round(d * 10) / 10,
      relLen: Math.max(aLen, bLen) > 0 ? d / Math.max(aLen, bLen) : 0,
      notchScore: null,
      curvature: 'flat',
      hand: 'neutral',
      twin: 'none',
      self: new Set([...a, ...b].map(pieceOf)).size === 1,
      rule: 'connected by hand',
      aLenMm: aLen,
      bLenMm: bLen,
    },
  };
  return seamFromCandidate(c, ctx.pieces, {
    seamKey: o.seamKey ?? newSeamKey(),
    status: 'confirmed',
    source: 'manual',
    direction: o.direction,
    note: (o.note ?? '').trim().slice(0, 255),
    ...opts(ctx),
  });
}

/**
 * Re-confirm a stale row that still fits: resolve it once more without the server's flag and
 * rewrite its anchors from today's runs, same key, same decision. Null: it no longer resolves.
 */
export function reconfirmRow(item: ReviewItem, ctx: AnchorCtx): StoredSeam | null {
  const row = item.row;
  if (!row) return null;
  const r = resolveSeamDecisions([{ ...row, stale: false }], ctx.pieces, {
    nameOf: ctx.nameOf,
    ...opts(ctx),
  });
  const applied = r.applied[0];
  if (!applied) return null;
  const parts = (hs: typeof applied.a) => hs.map((h) => h.run);
  const kind: SeamCandidate['kind'] = row.kind === 'closure' ? 'closure-not-seam' : row.kind;
  const cand: SeamCandidate = applied.candidate ?? {
    a: applied.a[0].run,
    b: applied.b[0].run,
    ...(applied.a.length > 1 || applied.b.length > 1
      ? { aParts: parts(applied.a), bParts: parts(applied.b) }
      : {}),
    score: 1,
    kind,
    evidence: {
      dLenMm: 0,
      relLen: 0,
      notchScore: null,
      curvature: 'flat',
      hand: 'neutral',
      twin: 'none',
      self: false,
    },
  };
  // A composite's resolved candidate names its sides by edges; anchor them by the runs that fit.
  const anchored: SeamCandidate =
    applied.a.length > 1 || applied.b.length > 1
      ? {
          ...cand,
          a: applied.a[0].run,
          b: applied.b[0].run,
          aParts: parts(applied.a),
          bParts: parts(applied.b),
        }
      : { ...cand, a: applied.a[0].run, b: applied.b[0].run, aParts: undefined, bParts: undefined };
  return seamFromCandidate(anchored, ctx.pieces, {
    seamKey: row.seamKey,
    status: row.status,
    source: row.source,
    direction: row.direction,
    note: row.note,
    ...opts(ctx),
  });
}

export const flipped = (d: StoredSeamDirection): StoredSeamDirection =>
  d === 'same' ? 'reversed' : 'same';
