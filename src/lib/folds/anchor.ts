// A line drawn on a piece (or an accepted hint) → the row to save. The locator is written by the same
// geometry the resolver reads it back with (geom.ts offsetFromRun), so a fold saved on one size lands
// at the same distance from its edge on every other.

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import type { SeamRun } from 'lib/seams/frame';
import { newSeamKey } from 'lib/seams/anchor';
import {
  add,
  clampUV,
  contourSig,
  distToPoly,
  edgeAlong,
  foldEdgeOf,
  frameOf,
  inside,
  mul,
  perp,
  sideDist,
  sub,
  toUV,
  unit,
} from './geom';
import { FOLDS, type FoldHint, type FoldKind, type FoldSource, type StoredFold } from './types';

export type FoldMeta = {
  seq: number;
  kind: FoldKind;
  source: FoldSource;
  foldKey?: string;
  anchoredSize?: string;
  note?: string;
  /** Grain turn of this piece (lib/seams grainDegOf) — the frame the row is written in. */
  grainDeg?: number;
  /** The edge the line runs along: a run, none (null), or found here (undefined). */
  edge?: SeamRun | null;
};

/** One fold row from a line and a point on the flipping part (both mm, the piece's `rs` frame). */
export function foldFromLine(
  piece: PieceGeom,
  lineMm: readonly [Pt2, Pt2],
  flipMm: Pt2,
  meta: FoldMeta,
): StoredFold {
  const f = frameOf(piece, meta.grainDeg ?? 0);
  const reachesOutline = lineMm.every((point) => distToPoly(piece.rs, point) <= FOLDS.onContourMm);
  const run = meta.edge === undefined && reachesOutline ? edgeAlong(piece, lineMm) : meta.edge;
  return {
    foldKey: meta.foldKey ?? newSeamKey(),
    pieceKey: piece.pieceKey,
    seq: meta.seq,
    kind: meta.kind,
    source: meta.source,
    line: [clampUV(toUV(f, lineMm[0])), clampUV(toUV(f, lineMm[1]))],
    flipAt: clampUV(toUV(f, flipMm)),
    edge: run ? foldEdgeOf(piece, f, run, lineMm) : null,
    contourSig: contourSig(piece, f),
    anchoredSize: meta.anchoredSize ?? '',
    note: meta.note ?? '',
    stale: false,
  };
}

/**
 * The default flipping part of a hint: the strip between the line and its edge (a hem turns its
 * allowance), else the left of a→b. The owner flips it in the UI; `side` overrides.
 */
export function defaultFlipMm(piece: PieceGeom, hint: FoldHint, side?: 1 | -1): Pt2 | null {
  const [a, b] = hint.lineMm;
  const mid = mul(add(a, b), 0.5);
  const n = perp(unit(sub(b, a)));
  let s: number = side ?? 1;
  let steps = [5, 2, 1, 10];
  const run = side === undefined && hint.edge ? edgeAlong(piece, hint.lineMm) : null;
  if (run && hint.edge) {
    const em = mul(add(run.pts[0], run.pts[run.pts.length - 1]), 0.5);
    s = Math.sign(sideDist(a, b, em)) || 1;
    steps = [hint.edge.offsetMm / 2, ...steps];
  }
  for (const step of steps) {
    const p = add(mid, mul(n, s * step));
    if (inside(piece.rs, p) && Math.abs(sideDist(a, b, p)) > 0.5) return p;
  }
  return null;
}

/** An accepted hint → the row to save (source from the hint; the owner gave the kind). */
export function foldFromHint(
  piece: PieceGeom,
  hint: FoldHint,
  meta: Omit<FoldMeta, 'source' | 'edge'> & { side?: 1 | -1 },
): StoredFold | null {
  const flip = defaultFlipMm(piece, hint, meta.side);
  if (!flip) return null;
  return foldFromLine(piece, hint.lineMm, flip, {
    ...meta,
    source: hint.source,
    edge: hint.edge ? edgeAlong(piece, hint.lineMm) : null,
  });
}
