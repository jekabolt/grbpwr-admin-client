// What a decision WRITES (03-SEAMS-DESIGN §2.3, §5.2): every row is anchored on the CURRENT graph at
// the moment of the decision, through lib/seams' own `seamFromCandidate` — the review never builds
// an anchor by hand. A re-confirm resolves the stale row once more as if the server had not flagged
// it and rewrites its anchors from what it resolves to today, under the same seam key.

import type { EdgeId, PieceGeom, SeamCandidate } from 'lib/assembly-skeleton/types';
import {
  anchorOfRunId,
  candidateSideOf,
  newSeamKey,
  resolveSeamDecisions,
  sameRunLen,
  seamFromCandidate,
  SEAMS,
  normalizeParts,
  sidePartEdges,
  type AnchorHit,
  type EdgeAnchor,
  type SidePart,
  type StoredSeam,
  type StoredSeamDirection,
} from 'lib/seams';
import type { ReviewItem } from './review-model';
import { edgeOf, pieceOf } from './words';
import { sideLengthMm } from '../step-seams/seam-length';

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

/** Why a hand pick stores no row, in the picker's words; '' when it does. */
export type HandRowRefusal = '' | 'cannot pair' | 'too many parts';

/** A hand connection (click A, click B; shift-click for more runs on a side) → a confirmed row. */
export function rowFromHand(
  a: readonly EdgeId[] | readonly SidePart[],
  b: readonly EdgeId[] | readonly SidePart[],
  geoms: ReadonlyMap<string, PieceGeom>,
  ctx: AnchorCtx,
  o: { direction: StoredSeamDirection; seamKey?: string; note?: string },
): StoredSeam | null {
  return handRow(a, b, geoms, ctx, o).row;
}

/** `rowFromHand` with the reason it refused. */
export function handRow(
  a: readonly EdgeId[] | readonly SidePart[],
  b: readonly EdgeId[] | readonly SidePart[],
  geoms: ReadonlyMap<string, PieceGeom>,
  ctx: AnchorCtx,
  o: { direction: StoredSeamDirection; seamKey?: string; note?: string },
): { row: StoredSeam | null; refusal: HandRowRefusal } {
  const refused = { row: null, refusal: 'cannot pair' as const };
  const partsOf = (side: readonly EdgeId[] | readonly SidePart[]) =>
    normalizeParts(
      side.map((part) => (typeof part === 'string' ? { target: part } : part)),
      geoms,
    );
  const pa = partsOf(a);
  const pb = partsOf(b);
  // Spans of one target are stretches with a gap between them; an edge reached by two different
  // targets (a chain and its member) is the same line named twice.
  const repeatsEdge = (parts: readonly SidePart[]) => {
    const seen = new Map<EdgeId, string>();
    for (const part of parts)
      for (const edge of sidePartEdges(part)) {
        if (seen.has(edge) && seen.get(edge) !== part.target) return true;
        seen.set(edge, part.target);
      }
    return false;
  };
  if (repeatsEdge(pa) || repeatsEdge(pb)) return refused;
  const anyRange = [...pa, ...pb].some((part) => !!part.range);
  // Whole edges in a row of one piece sew as one run, whatever else the side holds: a stretch
  // picked elsewhere must not turn every edge into a part of its own.
  const runs = (parts: readonly SidePart[]): SidePart[] => {
    const out: SidePart[] = [];
    let whole: EdgeId[] = [];
    const flush = () => {
      out.push(...runsOfSide(whole, geoms).map((target): SidePart => ({ target })));
      whole = [];
    };
    for (const part of parts) {
      if (part.range) {
        flush();
        out.push(part);
      } else whole.push(part.target as EdgeId);
    }
    flush();
    return out;
  };
  const ra = runs(pa);
  const rb = runs(pb);
  if (ra.length === 0 || rb.length === 0) return refused;
  const composite = ra.length > 1 || rb.length > 1;
  const partial = !composite && anyRange;
  const aLen = sideLengthMm(pa, geoms, () => 0);
  const bLen = sideLengthMm(pb, geoms, () => 0);
  const d = Math.abs(aLen - bLen);
  const sa = candidateSideOf(ra);
  const sb = candidateSideOf(rb);
  const partRange: Record<EdgeId, [number, number]> = composite ? { ...sa.hull, ...sb.hull } : {};
  const c: SeamCandidate = {
    a: ra[0].target,
    b: rb[0].target,
    ...(composite ? { aParts: sa.ids, bParts: sb.ids } : {}),
    ...(sa.walk || sb.walk
      ? { walk: { ...(sa.walk ? { a: sa.walk } : {}), ...(sb.walk ? { b: sb.walk } : {}) } }
      : {}),
    score: 1,
    kind: composite ? 'composite' : partial ? 'partial' : 'edge',
    ...(partial
      ? {
          range: {
            a: ra[0].range ? [ra[0].range[0], ra[0].range[1]] : [0, aLen],
            b: rb[0].range ? [rb[0].range[0], rb[0].range[1]] : [0, bLen],
          },
        }
      : {}),
    ...(Object.keys(partRange).length ? { partRange } : {}),
    evidence: {
      dLenMm: Math.round(d * 10) / 10,
      relLen: Math.max(aLen, bLen) > 0 ? d / Math.max(aLen, bLen) : 0,
      notchScore: null,
      curvature: 'flat',
      hand: 'neutral',
      twin: 'none',
      self: new Set([...pa, ...pb].map((part) => pieceOf(part.target))).size === 1,
      rule: 'connected by hand',
      aLenMm: aLen,
      bLenMm: bLen,
    },
  };
  const row = seamFromCandidate(c, ctx.pieces, {
    seamKey: o.seamKey ?? newSeamKey(),
    status: 'confirmed',
    source: 'manual',
    direction: o.direction,
    note: (o.note ?? '').trim().slice(0, 255),
    ...opts(ctx),
  });
  if (!row) return refused;
  if (Math.max(row.sideA.length, row.sideB.length) > SEAMS.maxAnchorsPerSide)
    return { row: null, refusal: 'too many parts' };
  return { row, refusal: '' };
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
  const parts = (hs: typeof applied.a) => [...new Set(hs.map((h) => h.run))];
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

/**
 * After a re-upload (T6, owner 09.11): the stale rows whose edges did not change, re-anchored for
 * one write. Each row is resolved as if the server had not flagged it and kept only when EVERY
 * anchor lands on a run the resolver's own fast path would call the same edge: the piece sits as
 * is (no turn, no mirror), the five samples fit within its `fitMax`, the notches match and the
 * length is within `sameRunLen` (2.5 mm or 1.5 %). The run's number is not part of it: an edge the
 * segmentation renumbered (a corner moved elsewhere on the piece) is still the same line in the same
 * place. A row that still fits on an edge that grew, moved or turned stays stale for the review;
 * one that no longer fits too. Each anchor is redrawn on today's run keeping its range, placement
 * and layer: same key, same decision (a rejection included), same direction, same note. A surface
 * row has no edge to compare and stays as it is.
 */
export function autoReconfirmable(rows: readonly StoredSeam[], ctx: AnchorCtx): StoredSeam[] {
  const stale = rows.filter((row) => row.stale && row.kind !== 'surface');
  if (stale.length === 0) return [];
  const grainDeg = ctx.grainDeg ?? undefined;
  const r = resolveSeamDecisions(
    stale.map((row) => ({ ...row, stale: false })),
    ctx.pieces,
    { nameOf: ctx.nameOf, ...(grainDeg ? { grainDeg } : {}) },
  );
  const redraw = (hit: AnchorHit): EdgeAnchor | null => {
    const was = hit.anchor;
    if (hit.frame !== 'asis' || hit.fit > SEAMS.fitMax) return null;
    const now = anchorOfRunId(ctx.pieces, hit.run, grainDeg, was.range);
    if (!now || now.notches !== was.notches || !sameRunLen(now.lenMm, was.lenMm)) return null;
    return {
      ...now,
      ...(was.placement ? { placement: was.placement } : {}),
      ...(was.layer ? { layer: was.layer } : {}),
    };
  };
  const out: StoredSeam[] = [];
  for (const x of r.applied) {
    const seam = x.seam;
    if (x.a.length !== seam.sideA.length || x.b.length !== seam.sideB.length) continue;
    const sideA = x.a.map(redraw);
    const sideB = x.b.map(redraw);
    if (sideA.length === 0 || sideB.length === 0 || [...sideA, ...sideB].some((a) => !a)) continue;
    const row: StoredSeam = {
      ...seam,
      sideA: sideA as EdgeAnchor[],
      sideB: sideB as EdgeAnchor[],
      ...(ctx.size ? { anchoredSize: ctx.size } : {}),
    };
    delete row.stale;
    out.push(row);
  }
  return out;
}
