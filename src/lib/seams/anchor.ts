// Writing anchors (03-SEAMS-DESIGN §2.3): computed on the CURRENT graph at the moment of the
// decision, from the run the technologist accepted or clicked.

import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import type { EdgeId, PieceGeom, SeamCandidate } from 'lib/assembly-skeleton/types';
import { contourSig, frameOf, runById, runSamples, type SeamRun } from './frame';
import {
  SEAMS,
  type EdgeAnchor,
  type SeamPlacement,
  type StoredPose,
  type StoredSeam,
  type StoredSeamDirection,
  type StoredSeamKind,
  type StoredSeamSource,
  type StoredSeamStatus,
} from './types';

const r = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
export const pieceOfId = (id: EdgeId) => id.slice(0, id.lastIndexOf('#'));

/** The anchor of one run of one piece. `range` = sewn shares of the run ([0, 1] = whole). */
export function anchorOf(
  piece: PieceGeom,
  run: SeamRun,
  grainDeg = 0,
  range: [number, number] = [0, 1],
): EdgeAnchor {
  const f = frameOf(piece, grainDeg);
  return {
    piece: piece.pieceKey,
    samples: runSamples(f, run).map(([u, v]) => [r(u, 3), r(v, 3)]),
    perimShare: r(run.lenMm / (piece.perimMm || run.lenMm || 1), 4),
    lenMm: r(run.lenMm, 1),
    notches: run.notches,
    turnDeg: r(run.turnDeg, 1),
    range: [r(range[0], 4), r(range[1], 4)],
    edgeHint: run.id,
    contourSig: contourSig(piece, f),
  };
}

/** The anchor of a run named by the engine's id ('FP_L#2', 'BP#3+4'), or null when it is gone. */
export function anchorOfRunId(
  pieces: readonly PieceGeom[],
  id: EdgeId,
  grainDeg?: ReadonlyMap<string, number>,
  range: [number, number] = [0, 1],
): EdgeAnchor | null {
  const piece = pieces.find((p) => p.pieceKey === pieceOfId(id));
  if (!piece) return null;
  const run = runById(piece, id, SEAMS.maxChain);
  return run ? anchorOf(piece, run, grainDeg?.get(piece.pieceKey) ?? 0, range) : null;
}

export const storedKindOf = (k: SeamCandidate['kind']): StoredSeamKind =>
  k === 'closure-not-seam' ? 'closure' : k;

export type SeamFromCandidateOptions = {
  seamKey: string;
  status: StoredSeamStatus;
  source?: StoredSeamSource;
  direction?: StoredSeamDirection;
  anchoredSize?: string;
  note?: string;
  by?: string;
  at?: string;
  grainDeg?: ReadonlyMap<string, number>;
};

/**
 * A stored row for a seam as the graph reads it today (accept / reject of an engine proposal, a
 * doll or order proposal, or a hand connection built as a SeamCandidate). Null when a side's run is
 * not on the pieces given (it was read on another geometry).
 */
export function seamFromCandidate(
  c: SeamCandidate,
  pieces: readonly PieceGeom[],
  o: SeamFromCandidateOptions,
): StoredSeam | null {
  const sideIds = (side: 'a' | 'b'): EdgeId[] =>
    side === 'a' ? c.aParts ?? [c.a] : c.bParts ?? [c.b];
  const lenOf = (id: EdgeId) => {
    const p = pieces.find((q) => q.pieceKey === pieceOfId(id));
    return p ? runById(p, id, SEAMS.maxChain)?.lenMm ?? 0 : 0;
  };
  // A partial seam: the LONG side carries the sewn range. By the engine's convention a's START
  // sits on b's END, so a long `a` is sewn from its start, a long `b` up to its end.
  const ranges: { a: [number, number]; b: [number, number] } = { a: [0, 1], b: [0, 1] };
  if (c.kind === 'partial') {
    const la = lenOf(c.a);
    const lb = lenOf(c.b);
    if (c.range && la > 0 && lb > 0) {
      ranges.a = [c.range.a[0] / la, c.range.a[1] / la];
      ranges.b = [c.range.b[0] / lb, c.range.b[1] / lb];
    } else if (la > 0 && lb > 0) {
      if (la >= lb) ranges.a = [0, lb / la];
      else ranges.b = [1 - la / lb, 1];
    }
  }
  const side = (s: 'a' | 'b'): EdgeAnchor[] | null => {
    const out: EdgeAnchor[] = [];
    for (const id of sideIds(s)) {
      const a = anchorOfRunId(pieces, id, o.grainDeg, ranges[s]);
      if (!a) return null;
      out.push(a);
    }
    return out;
  };
  const sideA = side('a');
  const sideB = side('b');
  if (!sideA || !sideB) return null;
  return {
    seamKey: o.seamKey,
    status: o.status,
    kind: storedKindOf(c.kind),
    direction: o.direction ?? 'reversed',
    source: o.source ?? 'graph',
    sideA,
    sideB,
    anchoredSize: o.anchoredSize ?? '',
    note: o.note ?? '',
    ...(o.by ? { createdBy: o.by, updatedBy: o.by } : {}),
    ...(o.at ? { createdAt: o.at, updatedAt: o.at } : {}),
  };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * The anchor of a piece's WHOLE outline (a pose row's side, P8): the sewing loop from its first
 * point round to it again, perim share 1. Nothing resolves it as a run — it names the piece and
 * passes the row validation (five samples in [0, 1], perim share in (0, 1], a length).
 */
export function outlineAnchor(
  piece: PieceGeom,
  grainDeg = 0,
  placement?: SeamPlacement,
): EdgeAnchor {
  const f = frameOf(piece, grainDeg);
  const ring = piece.rs.length ? [...piece.rs, piece.rs[0]] : [];
  let len = 0;
  for (let i = 1; i < ring.length; i++)
    len += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
  const samples: [number, number][] = ring.length
    ? runSamples(f, { pts: ring }).map(([u, v]) => [r(clamp01(u), 3), r(clamp01(v), 3)])
    : [0, 0.25, 0.5, 0.75, 1].map(() => [0, 0]);
  return {
    piece: piece.pieceKey,
    samples,
    perimShare: 1,
    lenMm: Math.max(0.1, r(piece.perimMm || len, 1)),
    notches: piece.notchIdx.length,
    turnDeg: 0,
    range: [0, 1],
    edgeHint: 'outline',
    contourSig: contourSig(piece, f),
    ...(placement ? { placement } : {}),
  };
}

/**
 * A pose row (P8): `piece` placed by hand in a step, `placement` = it in `host`'s frame as a surface
 * placement is encoded. The server's rules: confirmed, one anchor per side, the placement on side A.
 */
export function poseRow(o: {
  seamKey: string;
  piece: PieceGeom;
  host: PieceGeom;
  placement: SeamPlacement;
  grainDeg?: ReadonlyMap<string, number>;
}): StoredPose {
  return {
    seamKey: o.seamKey,
    status: 'confirmed',
    kind: 'pose',
    direction: 'unknown',
    source: 'manual',
    sideA: [outlineAnchor(o.piece, o.grainDeg?.get(o.piece.pieceKey) ?? 0, o.placement)],
    sideB: [outlineAnchor(o.host, o.grainDeg?.get(o.host.pieceKey) ?? 0)],
    anchoredSize: '',
    note: '',
  };
}

/** What a pose row says: the moved piece, its host, the placement in the host's frame. */
export function poseOf(
  row: StoredPose,
): { piece: string; host: string; placement: SeamPlacement } | null {
  const a = row.sideA[0];
  const b = row.sideB[0];
  if (!a?.placement || !b || !a.piece || !b.piece || a.piece === b.piece) return null;
  return { piece: a.piece, host: b.piece, placement: a.placement };
}

/** Edge ids a stored side stands for, by its hints (diagnostics only — never for resolution). */
export const hintedEdges = (side: readonly EdgeAnchor[]): EdgeId[] =>
  side.flatMap((a) => edgeIdsOf(a.edgeHint));

// ── ULID (client-minted seam_key) ─────────────────────────────────────────────────────────────

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A 26-char ULID: 48-bit time + 80 random bits, Crockford base32. */
export function newSeamKey(now = Date.now(), rand: () => number = Math.random): string {
  let t = now;
  let time = '';
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let tail = '';
  const bytes = new Uint8Array(16);
  const g = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (g?.getRandomValues) g.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(rand() * 256);
  for (let i = 0; i < 16; i++) tail += CROCKFORD[bytes[i] % 32];
  return time + tail;
}
